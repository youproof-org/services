# Multi-language content & URL model

> **Status: APPROVED.** Phase 0 design document for the multi-language URL
> structure refactor. All open questions confirmed; Phase 1+ may proceed.

YouProof is pre-release and today ships a **single-locale (Hungarian)** statically
exported site with **no locale abstraction anywhere**. This document defines the
locale model, URL structure, and cross-cutting strategies (assets, canonical,
hreflang, sitemap, legacy redirects) that let a second language be added **by
editing data only** — never routing, rendering, or redirect *code*.

**Guiding principle:** implement only what `hu` needs today, but never hardcode
that `hu` is the only locale. No `if (locale === 'hu')` in any code path; no
locale-agnostic hardcoded URL segments outside the container dictionary below.
Hardcoding lives only in *data* (the `hu` dictionary entry), never in *code*.

---

## 1. Locale model

The set of supported locales is a **config list**, `['hu']` today. Each locale has:

- a **code** — BCP-47-ish (`hu`, later `en`);
- a **display name** (for future UI — not built now);
- a **container dictionary** (§3).

The config lives in one place, `apps/website/lib/i18n/config.ts`, backed by a
plain-data file `apps/website/lib/i18n/locales.json` so it can also be read by the
legacy-redirect manifest generator (a standalone `.mjs`, see §7). `DEFAULT_LOCALE`
is `hu`.

---

## 2. URL shape (generalized)

| Content | URL |
|---|---|
| Homepage (per locale) | `/{locale}` |
| Book (series) | `/{locale}/{book-container}/{book-slug}` |
| Chapter | `/{locale}/{book-container}/{book-slug}/{chapter-container}/{chapter-slug}` |
| Article | `/{locale}/{article-container}/{slug}` |
| Newsletter | `/{locale}/{newsletter-container}/{slug}` |
| Landing | `/{locale}/{landing-container}/{slug}` |
| Custom page | `/{locale}/{slug}` — **no container segment** |
| Site root | `/` → **301 → `/{DEFAULT_LOCALE}`** (§6) |

Parts and sections are **not** in the public URL. Both nonetheless render as
in-page **HTML anchors** and are cross-reference targets — a part on its book's
index page, a section on its item's page — keyed by a locale-dependent **`slug`**
(§4b). Knowledge-base entities have URL shapes of their own, nesting owned types
under their owner and keeping namespaces out of the path (§4a).

Concrete `hu` examples (from §3):

```
/hu
/hu/konyvek/alice-es-bob
/hu/konyvek/alice-es-bob/fejezetek/{chapter-slug}
/hu/cikkek/{slug}
/hu/hirek/{slug}
/hu/landing/{slug}
/hu/{page-slug}
/  → 301 → /hu
```

---

## 3. Container dictionary

A per-locale map from a **canonical, language-independent container key** to the
**localized URL segment** for that content type in that locale. This is the single
mechanism that generalizes routing and the manifest generator — nothing like
`konyvek` is hardcoded anywhere outside it.

| canonical key | English (today) | `hu` segment |
|---|---|---|
| `book` | books | **konyvek** |
| `chapter` | chapters | **fejezetek** |
| `article` | articles | **cikkek** |
| `newsletter` | newsletter | **hirek** |
| `landing` | landing | **landing** *(kept as-is)* |
| `page` | (root) | *(no container)* |

Data shape (`locales.json`):

```json
{
  "defaultLocale": "hu",
  "locales": {
    "hu": {
      "displayName": "Magyar",
      "containers": {
        "book": "konyvek",
        "chapter": "fejezetek",
        "article": "cikkek",
        "newsletter": "hirek",
        "landing": "landing"
      }
    }
  }
}
```

`page` has no entry (routes at `/{locale}/{slug}`). The app exposes
`getContainerSegment(locale, key)` and the inverse `resolveContainerKey(locale,
segment)`; all URL construction goes through `buildLocalizedUrl(locale,
contentTypeKey, ...slugPath)`.

---

## 4. Content identity across languages *(design-only — not built now)*

The same conceptual entity (e.g. "the cryptography book") will be represented as
**one YAML file per locale**, sharing a **language-independent identifier**.

- `name` (kebab-case) is that language-independent ID. It is unchanged by this
  work and remains what internal cross-references resolve against.
- `slug` is the **locale-specific URL segment**, newly split out from `name`
  (today they happen to be equal for every file).
- Future per-locale grouping (mapping the `hu` and `en` files of the same entity)
  will key off `name`. **No grouping mechanism is built now** — there is only one
  locale's worth of files.
- **Cross-reference resolution** stays within the *same locale* as the
  referencing document by default. Cross-locale reference resolution is a
  non-goal (design-only).

### 4a. Addendum — knowledge-base entities

KB entity types are `definition`, `theorem`, `proof`, `remark`, plus `namespace`
(a grouping node). **There are no `lemmas`.**

All four entity types are **addressable** and carry both `locale` and `slug`. Their
URLs are deliberately **independent of namespace position** — namespaces are
expected to be reorganized, and a node's URL must not move when that happens — so a
definition or theorem sits at a flat path and a proof or remark nests under the node
that owns it. `lib/i18n/url.ts` is the single constructor for all of them.

An entity is *also* rendered inline inside a chapter, via `embed`/`recall` content
blocks. That gives it two addresses, and which one a cross-reference resolves to
depends on the **rendering context**, not on the target: a reference rendered on a
chapter page resolves to the in-chapter anchor, and the same reference on a
knowledge-base page resolves to the target's own page. Both are resolved at build
time — `RefEntry.href` and `RefEntry.kbHref` in `lib/content/graph.ts`.

`namespace` is the one type with **`locale` only, no `slug`**. It is expressed
solely as a path string built from the `name` chain of `namespace.yaml` files, is
not materialized as a routed node, has no anchor, and appears in no cross-reference.

### 4b. Addendum — parts and sections (localized anchor slugs)

Neither a `part` nor a `section` has a routed URL — a part is flattened out of
chapter URLs, and a section is one heading inside its chapter or standalone item.
Both are nonetheless **addressable by anchor**: a part on its book's index page, a
section on its item's page, and both are cross-reference targets.

Both therefore carry **`locale` and `slug`**. The `slug` — not `name` — is what
appears in the anchor, so a fragment reads in the page's language; `name` stays the
language-independent internal ID that cross-references resolve against. See
[§9](#9-identifier-rules--names-and-slugs) for the anchor shape.

### Field summary

| category | types | `locale` | `slug` |
|---|---|---|---|
| Addressable (own URL) | `book`, `chapter`, `article`, `newsletter`, `landing`, `page`, `definition`, `theorem`, `proof`, `remark` | ✔ | ✔ (URL segment) |
| Anchored (no URL, in-page anchor) | `part`, `section`, `claim` block, `terms` entry | ✔ (the entity's; a claim/term takes its owner's) | ✔ (anchor segment) |
| Structural (no URL, no anchor) | `namespace` | ✔ | — |

---

## 5. Image asset strategy

Asset URLs are **locale-independent** and must stay so. Today image `src`s are
built at content-load time as `/content/{...}` paths (served from
`public/content/...`) and are **never** run through URL localization. The `/hu/`
prefix does **not** apply to assets: a figure referenced from any locale's page
resolves to the same `/content/{content-id}/{filename}` URL.

**Invariant:** asset URLs must never pass through `buildLocalizedUrl`. A
regression test asserts this.

---

## 6. Root redirect `/` → `/{DEFAULT_LOCALE}`

Two complementary layers, both a plain `DEFAULT_LOCALE`-based 301 with **no
Accept-Language / geo-IP logic** (explicit non-goal):

1. **Deployed environments (edge):** a Cloudflare zone dynamic-redirect rule
   (in `infra/cloudflare/terraform/zone/redirects.tf`, alongside the existing
   www→apex ruleset) matching `path eq "/"` on the `youproof.org` zone → **302**
   `/hu`. Fires at the edge before R2, so it wins in staging/production. This is
   the intended seam to **later** be replaced by a geo/preference-cookie aware
   auto-redirect worker — out of scope here. It is a **302 (temporary)**, not a
   301: the root's target is a *current default*, not permanent, so it must not
   be cached indefinitely (a 301 would stop a future locale-negotiation worker
   from running for return visitors). The www→apex and `.html`-strip rules stay
   301 (true canonicalizations). SEO is unaffected — per-page canonical +
   hreflang + `x-default` already point search engines at `/{locale}`.
2. **Local dev / non-Cloudflare serving of `out/`:** a build-time static fallback
   — a minimal root `app/page.tsx` emitting `<meta http-equiv="refresh">` +
   `<link rel="canonical" href="/hu">`, producing `out/index.html`.

The two do not conflict (edge rule wins where present; static file covers the rest).

There is **no legacy un-prefixed-path back-compat concern** on `.org`: the site is
pre-release, so `/hu/...` is how every path is generated from day one.

---

## 7. canonical & hreflang

Emitted per page via a shared head-builder utility (no per-page metadata exists
today):

- `<link rel="canonical" href="{self URL}">` — self-referencing.
- `<link rel="alternate" hreflang="{locale}" href="{that locale's URL}">` for
  **every locale that actually has a published version of this content item**
  (today: just `hu`).
- `<link rel="alternate" hreflang="x-default" href="{DEFAULT_LOCALE URL}">`.

Driven by **actual per-locale content availability**, not the static locale list,
so it is correct the moment a second locale exists — no code change.

### Sitemap

A single sitemap containing **all** locales' URLs (via `buildLocalizedUrl`),
keeping today's published-gating and landing-exclusion. Each entry carries
hreflang alternates via Next's `MetadataRoute.Sitemap` per-entry
`alternates.languages` field, driven by the **same availability logic as the
hreflang head tags**. Today: `/hu/...` URLs, each with a single `hu` alternate.

### Legacy redirect manifest (youproof.hu → youproof.org)

The manifest generator takes the target **locale as an explicit parameter**
(`--locale`/env, wired per Worker environment via Terraform/CI — `youproof.hu`
→ `hu`) and derives the `.org` path prefix + container segments from the **same
`locales.json`** as the app. Targets become `/{locale}/{localized-container}/
{slug}` (e.g. `youproof.hu/kriptografia` → `youproof.org/hu/konyvek/alice-es-bob`),
using the content's `slug`. The `.hu` **root** now redirects to `/hu` on `.org`
(behavior change from `/` → `/`, see open question below). Worker runtime routing
is unchanged.

---

## 7a. Per-locale `<html lang>` — post-build rewrite + live guard

In the App Router the root `<html>` (in `app/layout.tsx`) sits **above** the
`[locale]` segment and cannot read the locale param, and static export has no
middleware — so the root layout can only emit a single static `lang`
(`DEFAULT_LOCALE`). That is correct for the root redirect page and all
default-locale pages, but a `/{other-locale}/…` page would wrongly inherit the
default `lang`. This is handled in two parts (both data-driven — a new locale
needs no code change):

1. **Fix — post-build rewrite** (`apps/website/scripts/set-html-lang.mjs`, wired as
   `postbuild`). After the export, it rewrites `<html lang>` in every `out/**.html`
   to the `htmlLang` of the locale in that file's path (first path segment ∈
   configured locales, else the default). A no-op for the current hu-only output;
   correct-by-construction the moment other-locale content exists.
2. **Guard — live verification in the quality gate.** The post-deploy crawler
   (`tools/smoke-tests`) fetches each live page and asserts its `<html lang>`
   matches the locale in its URL path; a mismatch is a **fatal** `langErrors`
   finding → the crawler suite fails → `overall: fail` in the report artifact →
   the production `pr-gate` finds no passing artifact and **blocks the production
   promotion**. So a wrong `lang` cannot reach production. (Verifying on the live
   staging site — not a local build artifact — is deliberate: it exercises the
   actually-served HTML through R2 + the CDN.)

The crawler also **starts at `/{DEFAULT_LOCALE}`** (not `/`), since every page is
locale-prefixed and the bare root only redirects (static stub now; edge 302 once
the zone rule ships) — starting at `/` would traverse nothing.

---

## 8. Non-goals (this phase)

- No language switcher UI beyond an optional disabled placeholder.
- No browser-language or geo-IP redirect.
- No `en` content or translation tooling.
- No cross-locale cross-reference resolution logic (design-only, §4).
- No shared schema package / Zod validator (fields added to existing per-repo
  types + a lightweight URL-safety check in the existing loader; mirrored by hand
  in the editor with a pointer comment).

---

## 9. Identifier rules — names and slugs

The real constraint is: **no two pages may resolve to the same URL, no two nodes on
one page may share an anchor, and no reference may be ambiguous.** The uniqueness
scope therefore follows the address shape, not a blanket "per-type" rule.

`name` and `slug` are two *separate* namespaces with the **same scopes**, differing
only in that a slug is unique **per locale** (a future `en` file may reuse an `hu`
slug) while a name is unique **across locales** (it is the same id in every
language). Each scope is the identifier's position in the cross-reference grammar:
what disambiguates a reference is what disambiguates the identifier. The
author-facing statement of the same rules lives in the content repo's
`docs/content-model.md`; enforcement is `validateIdentifiers` in
`lib/content/graph.ts`.

### Character rule

One pattern for every name and every slug: `^[a-z0-9]+(?:-[a-z0-9]+)*$`.

What has to hold is *no `.`, no `/`, no `:`* — `.` separates the segments of the
reference and anchor grammars, `/` separates URL segments, `:` marks an external
target. The full kebab pattern costs nothing more and keeps names and slugs the
same shape of string, differing only in language.

### Uniqueness scopes

| type | unique within… | why |
|---|---|---|
| `book` | all books | URL `/{loc}/konyvek/{slug}` |
| `article` | all articles | URL `/{loc}/cikkek/{slug}` |
| `newsletter` | all newsletters | URL `/{loc}/hirek/{slug}` |
| `landing` | all landings | URL `/{loc}/landing/{slug}` |
| `page` | all pages **+ not equal to any container segment** | URL `/{loc}/{slug}` sits at the locale root next to `konyvek`/`cikkek`/… |
| `part` | its **parent book** | anchor `reszek.{slug}` on the book index page |
| `chapter` | its **parent book** (not globally) | URL `/{loc}/konyvek/{book}/fejezetek/{slug}` |
| `section` | its **parent chapter** or standalone item | anchor `szakaszok.{slug}` |
| `definition` | all definitions | URL `/{loc}/tudasbazis/definiciok/{slug}` — flat, so the slug carries no namespace |
| `theorem` | all theorems | URL `/{loc}/tudasbazis/tetelek/{slug}` |
| `proof` | its **owning theorem** | URL nests under the theorem |
| `remark` | its **owning** definition / theorem / proof | URL nests under the owner |
| `claim` | its owning definition / theorem / remark | anchor `…allitasok.{slug}` |
| `terms` entry | its owning node | anchor `…fogalmak.{slug}` |
| `namespace` (name only) | its parent namespace | appears in no URL, anchor or reference |

### Examples

**Allowed** (no collision):

- A book slug `alice-es-bob` (`/hu/konyvek/alice-es-bob`) and an article slug
  `alice-es-bob` (`/hu/cikkek/alice-es-bob`) coexist — different container
  segments → different URLs.
- Two different books each have a chapter with slug `bevezetes`
  (`/hu/konyvek/book-a/fejezetek/bevezetes` and
  `/hu/konyvek/book-b/fejezetek/bevezetes`) — the parent book segment
  disambiguates.
- Two different chapters each contain a section with slug `attekintes`
  (`…/fejezetek/ch-1#szakaszok.attekintes` and
  `…/fejezetek/ch-2#szakaszok.attekintes`) — the anchor is page-scoped.
- A definition and a theorem both slugged `gyuru` —
  `/hu/tudasbazis/definiciok/gyuru` and `/hu/tudasbazis/tetelek/gyuru`.
- A claim and a term on the same node both slugged `nullelem` —
  `#…allitasok.nullelem` and `#…fogalmak.nullelem`.
- The `hu` book slug `alice-es-bob` and a future `en` book slug `alice-and-bob`
  are independent — slug uniqueness is per-locale.

**Rejected** (validator fails the build):

- Two published articles in `hu` both with slug `pi-nap` — same URL
  `/hu/cikkek/pi-nap`.
- A custom page with slug `konyvek` — collides with the `book` container segment
  at the locale root (`/hu/konyvek`). This is the multi-locale generalization of
  today's `RESERVED_SLUGS` guard, and it now also covers the anchor-only segments
  `allitasok`, `szakaszok` and `reszek`.
- Two chapters **in the same book** both with slug `bevezetes`.
- Two sections **in the same chapter** both with slug `attekintes` — duplicate
  in-page anchor.
- Any name or slug containing a `.` — it would split into two grammar segments.

---

## 10. Confirmed decisions

- **`.hu` root redirect target** — the legacy `.hu` root redirects to `/hu` on
  `.org` (manifest generator emits `/` → `/hu`). ✅ confirmed.
- **Container word `landing`** — kept English (`landing`); no Hungarian word.
  ✅ confirmed.
- **Name and slug uniqueness scope** — per §9 above. ✅ confirmed.
