# YP-125: Multi-Language URL Structure Refactor — Implementation Plan

**Jira ticket:** [YP-125 — Finalize URL structure](https://sytesbook.atlassian.net/browse/YP-125)
**Scope note for Claude Code:** the current Jira description only talks about adding a language prefix to URLs. This plan supersedes and generalizes that description — it covers the full multi-language content model, URL structure, redirect worker, and editor changes described below. Update the Jira ticket description to match this plan's scope once the design doc (Phase 0) is agreed, or leave a comment linking to the design doc — do not silently leave the ticket describing only the narrow prefix change.

**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`

**Guiding principle for every phase below: implement only what `hu` needs today, but never in a way that hardcodes the assumption that `hu` is the only language.** Concretely: no `if (locale === 'hu')` branching in routing/rendering logic; no locale-agnostic file/route naming; no single-language shortcuts in the manifest generator's public API. Hardcoding is fine only inside the *data* (the `hu` container-name/dictionary file), never in the *code path*.

---

## Phase 0 — Design document (do this first, before writing code)

Produce `docs/i18n-design.md` in `youproof-org/services` (or a Confluence page, mirrored into the repo) covering:

1. **Locale model**: the set of supported locales is a config list (`['hu']` today). Each locale has: a code (BCP-47-ish, e.g. `hu`, `en`), a display name, and a "container dictionary" (see below).
2. **URL shape**, generalized:
   - `/{locale}/{container}/{slug}` for content types that have a container segment (article, newsletter, landing)
   - `/{locale}/{slug}` for custom pages (`page` type) — no container segment
   - `/{locale}/{book-container}/{book-slug}/{chapter-container}/{chapter-slug}` for books/chapters
   - `/{locale}` is the homepage for that locale
   - `/` (no locale) redirects to the default locale's homepage — see Phase 2 item 6
3. **Container dictionary**: a per-locale mapping from a *canonical, language-independent container key* (e.g. `book`, `chapter`, `article`, `newsletter`, `landing`) to the *localized URL segment* used for that content type in that locale (e.g. `hu: book → "konyvek"`, `hu: chapter → "fejezetek"`). This is the mechanism that generalizes the manifest generator and the routing layer — nothing about "konyvek" is hardcoded outside this dictionary.
4. **Content identity across languages**: how the same conceptual entity (e.g. "the cryptography book") is represented as multiple YAML files (one per locale) that share a language-independent identifier, and how internal cross-references and future translation tooling resolve across locales. Note this only needs to be *designed*, not built — today there is only one locale's worth of files.
5. **Image asset strategy**: locale-independent asset URLs, per the existing ticket description (e.g. `https://youproof.org/assets/{content-id}/{filename}`), unaffected by the `/hu/` prefix. Confirm this is already the direction and document it explicitly so it isn't lost when the description is rewritten.
6. **hreflang/canonical strategy**: self-referencing canonical, reciprocal hreflang set from the list of locales that have a published version of a given content item (today: just `hu`, so hreflang emits one `hu` entry + `x-default` pointing at the `hu` URL).
7. **Non-goals for this phase**: no language switcher UI beyond a stub/placeholder, no browser-language or geo-IP redirect, no `en` content.

Get this doc reviewed before Phase 1 starts (flag it to David rather than assuming approval).

---

## Phase 1 — Content model changes (`youproof-org/content`)

1. Add a top-level `locale` field (string, required) to every content YAML schema: `book`, `chapter`, `article`, `landing`, `newsletter`, `page`. Value is the locale code (`hu` for all existing files today).
   - **Also analyze the finer-grained mathematical entity types** — theorems, definitions, remarks, lemmas, proofs, namespaces, and similar YAML content types that exist in the content model beyond these six (see the cross-reference automation work) — and determine whether they need a `locale` field too. Do these entities currently get their own addressable URLs/anchors at all, or are they always rendered inline within a parent chapter/article? Do internal cross-references resolve to them directly? Does "namespace" imply grouping/hierarchy that needs its own representation in the schema? Write up the findings as an addendum to the Phase 0 design doc before deciding how (or whether) `locale`/`slug` apply to these types — don't guess or silently skip them.
2. Add a top-level `slug` field (string, required) to `book`, `chapter`, `article`, `landing`, `newsletter`, `page` schemas. This is the locale-specific URL segment for that entity — distinct from its internal name/ID, which remains language-independent and is used for internal cross-references and the future multi-locale grouping described in the design doc.
3. Update the shared content schema (used by both the Next.js build and the editor) to require both fields, and to validate `slug` as URL-safe (lowercase, hyphenated, no reserved characters).
4. Backfill: write a one-off migration script that populates `locale: hu` and `slug: <slugified-name>` for every existing YAML file, so nothing in the current content set fails validation after the schema change. Run it, review the diff, commit.
5. Confirm with David whether `slug` uniqueness is scoped per content-type-per-locale or globally per-locale before enforcing a uniqueness check in the schema validator — do not assume.

---

## Phase 2 — Routing & rendering (`youproof-org/services`)

Next.js is statically exported (`output: 'export'`), so all locale/slug resolution happens at build time.

1. **Locale config module** (e.g. `apps/web/lib/i18n/config.ts`): exports the list of active locales, the default locale (`hu`), and, per locale, the container dictionary from the design doc (canonical container key → localized URL segment). This is the single place `hu`-specific strings like `konyvek`/`fejezetek` live.
2. **Route structure**: introduce a `[locale]` dynamic segment at the root of the app router (`apps/web/app/[locale]/...`), with `generateStaticParams` driven by the locale config, not hardcoded.
3. Under `[locale]`, route the book/chapter, article, newsletter, and landing paths through the *localized* container segments looked up from the container dictionary for that locale — not the canonical container key directly. Custom pages (`page` type) route directly at `/{locale}/{slug}` with no container segment. Two acceptable implementations for the container-based routes, pick based on what fits the current router less invasively:
   - A single dynamic catch-all per content family that resolves the localized segment against the dictionary at build time, or
   - Per-locale generated route segments (since there's currently only one locale, this is viable too, as long as it's generated from the dictionary rather than typed by hand).
4. **Link-building utility**: a single `buildLocalizedUrl(locale, contentTypeKey, slugPath)` helper used by *every* internal link, sitemap entry, canonical tag, and redirect target in the app. No component should string-concatenate `/${locale}/...` by hand. This is the direct fix for the "internal links must stay locale-consistent" requirement — centralizing it makes cross-locale link bugs structurally hard to introduce.
5. **Content resolution**: when loading a content YAML file to render a page, the loader must resolve by `(locale, contentTypeKey, slug)`, not by filename/internal-name. Internal cross-reference resolution must also resolve within the *same locale* as the referencing document by default (per the design doc), even though today there's only one locale to resolve within.
6. **Homepage root redirect**: `https://youproof.org/` issues a redirect to `https://youproof.org/hu`. This is a static, hardcoded default-locale redirect — implemented as a single named constant (`DEFAULT_LOCALE`), not a geo/browser-based decision. Explicitly do not implement any Accept-Language or geo-IP based redirect logic — the ticket calls this out as deliberately deferred. (There is no legacy-un-prefixed-path back-compat concern to handle here — the site is pre-release, so `/hu/...` is simply how every path is generated from day one; there's no existing production traffic at un-prefixed paths to redirect.)
7. **canonical + hreflang**: a shared `<head>`-building utility, used on every page, that emits:
   - `<link rel="canonical" href="{self URL}">`
   - `<link rel="alternate" hreflang="{locale}" href="{that locale's URL}">` for every locale that has a version of this content item (today: just `hu`)
   - `<link rel="alternate" hreflang="x-default" href="{default locale URL}">`
   Drive this from actual per-locale content availability, not from the static locale list, so it's correct once a second locale exists without further code changes.
8. **Sitemap generation**: update the sitemap generator to emit locale-prefixed URLs via the same `buildLocalizedUrl` helper.
9. **Image asset URLs**: confirm/implement that image URLs are emitted via a locale-independent path (e.g. `/assets/{content-id}/{filename}`) regardless of which locale's page references them, per the ticket's existing SEO guidance. This should already fall out naturally if asset URLs never pass through `buildLocalizedUrl`.

---

## Phase 3 — Legacy redirect Worker & manifest generator generalization

Context: the existing Cloudflare Worker at `youproof.hu` redirects legacy paths to their `youproof.org` counterparts using a redirect table baked into the manifest (bundled directly into the Worker script — see the CI/CD plan's decision to drop the Workers-KV approach).

1. **Manifest generator script**: take the target language as an explicit input parameter (not inferred, not hardcoded). Since the Worker instance is bound to a specific legacy domain (`youproof.hu` → `hu` today), the language parameter is supplied by whatever invokes the generator for that Worker instance/environment (e.g. a CLI flag or environment variable wired through the existing per-environment Terraform/CI setup) — not hardcoded inside the generator.
2. Refactor the redirect-table-building algorithm so all locale-specific behavior — the URL prefix and the container-segment names — comes from the *same* container dictionary structure introduced in Phase 2, ideally the literal same source-of-truth file (shared between `services` and the manifest generator, or duplicated with a comment pointing at the canonical copy if the generator can't easily import from `services`). Do not let two independent copies of "konyvek"/"fejezetek" drift.
3. Verify the generated redirect targets now match the Phase 2 routing exactly (e.g. `youproof.hu/kriptografia` → `youproof.org/hu/konyvek/kriptografia`, or whatever the actual slug resolves to) — write a small script or test that cross-checks a sample of generated redirect targets against the Next.js build's actual output paths, so the two systems can't silently diverge.
4. No behavior change to the Worker's routing/proxy logic itself (match → 301, no-match → proxy to `legacy.youproof.hu`) — this phase only touches how the manifest's redirect table is generated.

---

## Phase 4 — Editor changes (`youproof-org/editor`)

Context: this is the VS Code extension used to author/edit the content YAML files locally (no runtime dependency on `services`; reads/writes local files).

1. **Default load locale**: on startup, the editor loads the `hu` version of the content model by default.
2. **Sidebar reload buttons**: replace the single "Reload model" button with one reload button per locale present in the locale config (e.g. "Reload HU", "Reload EN"), driven from the same locale list used elsewhere (don't hand-write a second locale list in the extension — either import the shared config or keep a clearly-marked mirrored copy with a comment, consistent with the manifest generator's approach in Phase 3).
3. **Single active locale at a time**: the editor's in-memory model and any edit/validation UI operates on exactly one locale's entities at a time. Clicking a different locale's reload button discards/reloads the model to that locale — no mixed-locale editing session. Make sure unsaved-changes handling (if any exists today) fires an appropriate warning before a reload switches locales.
4. Since only `hu` is populated today, "Reload EN" (and other future locales) can be present in the UI per the locale config but should behave sensibly with zero `en` content (e.g. an empty model, not an error) — this is what makes the button list itself forward-compatible without extra `en` work now.

---

## Phase 5 — Testing & Definition of Done

- [ ] Design doc (`docs/i18n-design.md`) written and reviewed
- [ ] All content YAML schemas require `locale` + `slug`; existing content migrated and validates
- [ ] All public pages served under `/hu/...`; root `/` redirects to `/hu`
- [ ] Book/chapter, article, newsletter, and landing URLs use the localized container segments + slugs (e.g. `/hu/konyvek/{book-slug}/fejezetek/{chapter-slug}`); custom page URLs are `/hu/{slug}` with no container segment
- [ ] No component builds a locale-prefixed URL by hand outside `buildLocalizedUrl`
- [ ] Every page emits a correct self-canonical + reciprocal hreflang set (+ `x-default`)
- [ ] Sitemap emits locale-prefixed URLs
- [ ] Image asset URLs are locale-independent and unaffected by the prefix
- [ ] No browser-language or geo-IP redirect logic exists anywhere in the codebase
- [ ] Legacy Worker's manifest generator takes locale as a parameter and derives prefixes/container names from the shared dictionary, not hardcoded strings
- [ ] Sample of generated legacy redirects verified against actual Next.js build output paths
- [ ] Editor defaults to `hu`, shows one reload button per configured locale, and never mixes locales in one edit session
- [ ] **Forward-compatibility check**: as a throwaway local test (not merged), add a second dummy locale entry (e.g. `en`) to the locale config/container-dictionary file only, with no other code changes, and confirm the app builds, routes, and generates sitemap/redirect entries for it correctly. If this requires editing anything in `apps/web` route files, the link-building utility, or the manifest generator's algorithm — rather than just the config/dictionary data — that's a signal the code isn't actually generalized yet and needs fixing before this ticket is done.

---

## Deployment / promotion note (zone changes are serialized)

The root `/` → `/{default_locale}` edge redirect is a **302** rule added to the
shared zone Terraform root (`infra/cloudflare/terraform/zone/redirects.tf`, plus
a `default_locale` variable in `variables.tf`). There is **one promotion lane for
everything** — `development → stable/staging → stable/production` (no
`zone/*`→production shortcut). Per
[deploy-pipeline.md](../deploy-pipeline.md#keep-zone-changes-isolated-through-the-promotion-lane),
the required `zone-purity` check (`zone-purity-guard.yml`) fails **any** PR —
into `development`, `stable/staging`, or `stable/production` — whose **projected
`stable/production` delta** (the PR merged, compared to production) mixes a
`terraform/zone/**` change with non-zone changes. It runs from feature-PR time
onward, so a zone change and non-zone work can never accumulate together on
`development`. Zone changes only **apply on the `stable/production` merge** (a
no-op at `stable/staging`). Therefore:

- **Land the `zone/` change as its own isolated PR into `development`** (already
  a separate commit, `db997d1`); the rest of the ticket (content, `apps/website`,
  `.github/workflows/deploy.yml`, docs) goes in separate PR(s).
- **Serialize the zone promotion:** first drain the non-zone work to
  `stable/production` (staging and production matching), then promote the zone
  change through `development → stable/staging → stable/production` **alone**.
  This mirrors the "park + drain" approach and is now CI-enforced (a mixed
  promotion delta fails the guard). The static `out/index.html` redirect already
  covers `/`→`/hu`, so the edge rule is non-urgent and can wait for a drained
  window.
- Set the `DEFAULT_LOCALE` GitHub Environment variable (production) to match
  `apps/website/lib/i18n/locales.json`'s configured default before/with the zone
  promotion. (Terraform's `hu` fallback keeps the zone root self-contained if the
  var isn't set yet.)

## Explicit non-goals (do not build these now)

- Automatic browser-language or geo-IP based redirects
- A real language switcher UI (a placeholder/disabled control is fine if convenient, not required)
- Any `en` content or translation tooling
- Cross-locale cross-reference resolution logic (design only, per Phase 0 item 4)
