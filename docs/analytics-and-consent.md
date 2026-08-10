# Analytics and cookie consent

Google Analytics 4 behind a self-built consent gate. No third-party CMP.

The invariant everything else serves: **GA4 does not load — no script, no cookies,
no network request to Google — until the visitor has affirmatively accepted.**

## Why there is no inline `<head>` script

The canonical Consent Mode v2 recipe puts `gtag('consent', 'default', …)` in an
inline head script, because `gtag.js` loads immediately afterwards and the two are
racing. Here there is no race: `gtag.js` is never appended unless the stored
decision resolves to `granted`.

What actually guarantees correct ordering is **position in `window.dataLayer`**, a
plain array that `gtag.js` drains in order whenever it eventually loads — not
wall-clock timing. So pushing `consent default` → `consent update` → `config` from
a mount effect is exactly as correct as doing it from the document head, and it
keeps "nothing loads before consent" verifiable by inspection.

The `consent default` call is still made, and is deliberately not dead code: it is
the secondary, in-SDK gate, and it is what a Consent Mode audit looks for. The
primary gate is that no script is injected.

## Where things live

| Path | Role |
|---|---|
| `apps/website/lib/consent/policy.ts` | Cookie names, lifetimes, skew tolerance. Pure. |
| `apps/website/lib/consent/record.ts` | Record shape, parsing, and `resolveDecision`. Pure. |
| `apps/website/lib/consent/cookies.ts` | Cookie/query string handling. Pure. |
| `apps/website/lib/consent/pages.ts` | Locale filter for the policy links. Pure. |
| `apps/website/lib/consent/storage.ts` | The only `document.cookie` reads/writes. |
| `apps/website/lib/consent/gtag.ts` | dataLayer, Consent Mode, tag injection, page views. |
| `apps/website/lib/consent/copy.ts` | Hungarian UI strings. **Purpose-neutral** — see below. |
| `apps/website/.generated/consent-policy.json` | **Generated, gitignored.** Policy version + policy-page links. |
| `apps/website/components/consent/` | `ConsentGate` (state) + banner, FAB, dialog. |
| `apps/website/components/ui/Modal.tsx` | Shared modal shell, with opt-in focus trap / scroll lock. |

The pure modules take `now` and the policy version as **parameters** and never
touch `window`, `document`, or `Date.now()`. That is what makes expiry and version
comparison deterministically testable — `apps/website/test/*.test.mjs`, run with
`node --import tsx --test`.

## The UI copy names no specific tool

`lib/consent/copy.ts` talks about "sütik, amelyekhez a hozzájárulásod kell" and
never mentions Google Analytics. That is deliberate: the banner is the consent
surface for whatever non-essential cookies the site uses, and analytics happens to
be the only category today. Adding another purpose later should be a content edit
plus a version bump, not a rewrite of the UI strings.

The specifics belong in the linked policy pages, which is why both the banner and
the reopen dialog render `PolicyLinks` — a visitor deciding needs somewhere to read
what they are deciding about, and that somewhere is the content, not the banner.

## Cookies this site sets

| Name | Contents | Lifetime | Set when |
|---|---|---|---|
| `yp_consent` | `{"d":"granted"\|"denied","t":<ISO-8601>,"v":<version>}` | 12 months | A decision is made |
| `yp_ga_exclude` | `1` | 2 years | `?ga_debug=exclude` is visited |
| `_ga`, `_ga_<id>` | GA4's own | 2 years | Only after acceptance |

`yp_consent` is host-only (**no `Domain`**), so youproof.org and
staging.youproof.org hold independent decisions. It is not `HttpOnly` because
client JS is the only reader — adding it would break the feature, not harden it.
`Secure` is set only over https so `next dev` on plain http still works.

The content-repo commit SHA is deliberately **not** in the record. It would ride on
every request, drive nothing, and can never be read back — this is a client-side
record, unlike the newsletter's `privacy_content_sha`, which exists because that
consent attaches to an identifiable email address.

## The policy version, and when visitors are re-asked

The version is authored in the **content repo**, not here: a page declares itself
consent-relevant by carrying `cookie-policy-version` in its front matter.
`apps/website/scripts/gen-cookie-policy-version.mjs` collects those pages at build
time and writes `.generated/consent-policy.json` — both the version and the list of
pages the banner links to. One field drives both, so the link list and the
re-prompt trigger cannot drift apart.

Today that is `content/pages/suti/page.yaml` and
`content/pages/adatkezeles/page.yaml`, kept in **lockstep**. They must agree; the
build fails if they do not. (Taking the max instead would be subtly broken: bump
one page to 2 while the other is at 1, then later bump the second to 2, and the max
never changes — so an author who deliberately bumped would get no re-prompt.)

**Bump only when the change materially alters what the visitor agreed to** — a new
processor, a new cookie, a new purpose. A reworded paragraph or a corrected typo is
not a bump. Every bump re-asks every visitor who accepted.

A warn-only guard in the content repo
(`.github/workflows/cookie-policy-version-guard.yml`) annotates a PR that edits a
consent-relevant page without changing the version. It never fails the build, so a
cosmetic edit costs nothing — it just makes the judgement call visible.

`resolveDecision` then behaves like this:

| Stored version vs build | Decision | Result |
|---|---|---|
| equal | granted / denied | honoured |
| **older** | **granted** | **re-ask** — they agreed to less than we now do |
| **older** | **denied** | **stay denied** — nothing is running for them, so no new purpose is active either; re-asking a rejector is nagging |
| newer | either | honoured, no re-ask — a stale CDN bundle or a rollback; a newer consent subsumes an older policy |
| any | either | re-ask once the record is older than 12 months |
| `0` | — | feature off entirely (see below) |

The "newer" row is only expressible because the version is an orderable integer. A
content-SHA-based scheme could not distinguish a rollback from a real change, so a
rollback would re-ask everyone who had consented since the last deploy.

## Version `0` is the kill switch

`.generated/consent-policy.json` is a build artifact and is **gitignored** — never
committed. It is imported by client code, so every entry point that needs it runs
the generator first:

| Entry point | Generates via |
|---|---|
| `pnpm dev` | `predev` |
| `pnpm build` | `prebuild` |
| `pnpm typecheck` | chained in the script itself |
| `pnpm test` | not needed — the tests import only the pure modules |

A bare `tsc --noEmit` will fail with "Cannot find module
`@/.generated/consent-policy.json`" on a clean tree. That is why there is a
`typecheck` script, and why CI calls it rather than `tsc` directly. With no content
checkout the generator still writes a valid file at version `0`, so neither a fresh
clone nor CI needs the content repo.

A committed stub was the obvious alternative and was rejected: a tracked file that
every `pnpm dev` rewrites shows up as a permanent spurious diff, and sooner or later
a real version gets committed by accident.

One consequence: `tools/smoke-tests` cannot read the file, because the quality gate
runs in a separate job on a fresh checkout. The website job publishes the page list
as a job output and the gate receives it as `CONSENT_POLICY_PAGES`.

`0` means "the content declaring the policy is not in this build", and `ConsentGate`
renders nothing at all in that state. That matters because production builds from
`stable/released`: until the rewritten policy is promoted there, production has the
banner *code* but not the *content*, and the old content still tells readers the
site shows no cookie banner. Version `0` resolves that automatically.

An empty `NEXT_PUBLIC_GA_MEASUREMENT_ID` does the same thing independently. Both
have to be true for the feature to appear, which is why the code can ship to
production before the GA4 properties exist.

## Page views are sent manually

`send_page_view: false` on the `config` call, one `page_view` per pathname from a
`usePathname()` effect, and GA4's **"page changes based on browser history events"
sub-toggle turned OFF** in the admin console.

Two reasons, in order of weight:

1. **Firing behaviour belongs in the repo.** With the toggle on, "when does a
   page_view fire" is configured in a Google UI — invisible from the codebase, not
   reviewable in a PR, changeable by anyone with GA access.
2. **`page_location` hygiene is structural.** We send `origin + pathname` only,
   because newsletter confirmation links arrive carrying single-use tokens
   (`?newsletter_ask=confirm&sid=…&stok=…`) that must never reach Google. A
   `config`-level override covers the first page view, but enhanced measurement's
   history listener reads the live URL and cannot be overridden. Constructing the
   value makes a leak impossible rather than merely unlikely.

`usePathname()` also updates on `popstate`, so back/forward are covered.
`useSearchParams()` is deliberately unused: under `output: 'export'` it forces a
Suspense boundary, and we do not want the query string anyway.

## Withdrawing consent without a reload

A loaded `gtag.js` cannot be unloaded, and `consent update → denied` on its own does
**not** stop traffic — GA4 keeps sending cookieless consent-mode pings. So
`denyAnalyticsConsent()` does three things:

1. `gtag('consent','update',{analytics_storage:'denied'})` — tell the SDK.
2. `window['ga-disable-<ID>'] = true` — Google's documented per-property opt-out,
   which is what actually stops the requests.
3. Delete `_ga` and `_ga_<id>` across every plausible domain scope.

One caveat, verified by hand: withdrawal stops the data immediately, but the `_ga`
cookies do **not** stay deleted within that page view. `gtag.js` is still loaded and
re-creates them shortly after the sweep removes them. It is disabled, so nothing is
sent — but the cookies remain visible in DevTools until the next full page load. So
the sweep also runs on **every SPA navigation while consent is withheld**, which
clears them at the next page the reader opens rather than forcing a reload and losing
their place. The policy text deliberately promises no timing for this, only that the
measurement stops and the cookies are deleted.

The same cookie sweep also runs on **every load where the stored decision does not
resolve to `granted`**, not only on an explicit withdrawal. A GA cookie can outlive
the consent that created it in three ways: the visitor cleared `yp_consent` by hand,
it expired after 12 months, or the policy version moved on so the old grant no
longer covers it. GA is not loaded in any of those states, so the cookies would
never be transmitted — but leaving them means a later acceptance silently resumes
the **old client id** instead of starting fresh, and a reader taking up the cookie
policy's invitation to check DevTools would find analytics cookies we said were not
there. So "not granted" always means "no analytics cookies present".

## Excluding your own visits

Visit **`https://youproof.org/?ga_debug=exclude`** once per browser. That sets
`yp_ga_exclude=1` for two years and scrubs the parameter from the URL. Undo with
**`?ga_debug=include`**.

While the cookie is present, every event carries `traffic_type: internal` — as a
`config` parameter, so it propagates to everything the tag sends rather than needing
to be threaded through each future `gtag('event', …)` call. Events still fire on
purpose: silently dropping them would make it impossible to tell a working
integration from a broken one while testing.

Excluding them from reports is a **manual GA4 step**: Admin → Data filters →
Internal Traffic, matching `traffic_type` = `internal`. Leave it in **Testing**
until verified against a real excluded visit. Once Active, matching data is dropped
permanently and cannot be recovered.

## GA4 admin settings the privacy policy asserts

The Hungarian policy pages make claims that only hold if the console matches. If
any of these drift, the published policy becomes inaccurate:

| Setting | Required value |
|---|---|
| Google signals | **Off** — no cross-device, no remarketing |
| Ad personalization | **Off** |
| Reporting identity | **Device-based** — supports the "no profiling" claim |
| Data retention (user/event) | **14 months** |
| Account → Data sharing | Google products & services **off**, modeling contributions **off**, account specialists **off**; technical support may stay on |
| Enhanced measurement → page views on history events | **Off** (we send them manually) |
| Data filter | `traffic_type = internal` |

There is **no IP-anonymization toggle** in GA4, unlike Universal Analytics — IP is
used transiently to derive approximate location and is not stored. The policy says
exactly that.

Data sharing being off is what lets the policy describe Google as a *processor*
only. Leaving "Google products & services" on would arguably make Google a
controller for that use, contradicting the published text.

## Build-time and post-deploy guards

`apps/website/scripts/check-analytics-build.mjs` (postbuild, before upload):

- a deploy build whose **content declares a policy version** must have a measurement
  ID. An empty ID on its own is *not* an error — that is the intended inert state.
  What is incoherent, and therefore fatal, is published policy pages telling readers
  analytics runs after consent while no tag exists to honour that consent;
- the ID baked into the bundle must equal the one configured for this environment; a
  mismatch means a stale export that would report into the wrong GA4 property;
- no `.html` references `googletagmanager.com` — the static-export form of "GA
  cannot load before consent";
- the banner's CSS-module class appears in **no** `.html`, which is the regression
  test for the no-flash-of-banner design, and **does** appear in the JS bundle, so
  the check cannot pass by the banner having vanished entirely;
- exactly one distinct `G-…` id across the bundle — staging and production are
  separate properties and must never share a build;
- policy pages exist for the default locale, so the banner can never render
  without a policy link.

Note the id and the banner live in the **JS chunks**, not the markup —
`NEXT_PUBLIC_*` is inlined at build time. Scanning HTML for the id would pass
silently no matter what was configured.

`tools/smoke-tests/lib/consent-checks.mjs` (post-deploy, against the live host)
verifies every policy-page URL returns 200. The crawler cannot cover these: the
banner is not in the HTML, so its links are the one set of URLs a link crawler will
never discover.

## Verifying by hand

Fresh incognito profile, DevTools Network filtered to `google`:

1. Load a page → **zero** requests to `googletagmanager.com` /
   `google-analytics.com` / `region1.google-analytics.com`; no `_ga*`, no
   `yp_consent`.
2. Banner visible, page still scrolls, footer reachable (the
   `--consent-banner-height` body padding works). Both policy links resolve.
3. **Reject** → banner gone, shield FAB visible, `yp_consent` shows `"d":"denied"`
   with Expires ≈ +12 months, still zero Google requests. Reload → no banner.
4. Clear the cookie, reload, **Accept** → `gtm.js?id=G-…` loads; one `/g/collect`
   with `en=page_view`. Check its query string: `gcs=` shows analytics granted,
   `dl=` contains **no** query string, `tt=` absent.
5. Click an internal link → exactly one more `/g/collect`, new `dl`, and `dt`
   matching the **new** page's title.
6. GA4 Realtime on the expected property shows the visit; the *other* property
   shows nothing.
7. FAB → dialog → switch to reject → Save → no further `/g/collect` on subsequent
   navigations, `_ga*` gone, no reload. Focus returns to the FAB; Tab stays inside
   the dialog while open.
8. `?ga_debug=exclude` → cookie set, parameter gone from the address bar, next
   `/g/collect` carries `tt=internal`. Then `?ga_debug=include` → cookie gone.

## Local development

`apps/website/.env.local` (gitignored, no example file in the repo). Leave
`NEXT_PUBLIC_GA_MEASUREMENT_ID` unset to keep the consent UI off entirely; set it to
the staging id to work on the UI. `CONTENT_DIR` must point at a content checkout for
`gen-cookie-policy-version.mjs` to find the policy version — without it, the
generator writes `0` and the UI stays off.
