# YouProof.org — SEO Support Implementation Plan (YP-129)

**Jira ticket:** [YP-129 — SEO support](https://sytesbook.atlassian.net/browse/YP-129)
**Status:** Planning — pending David's review before implementation starts
**Repos involved:** `youproof-org/content`, `youproof-org/services` (including its `terraform/worker` path), `youproof-org/editor`

---

## 0. Open questions to resolve with David before starting

Claude Code should **stop and ask** rather than guess on these — don't proceed past Phase 0 until they're answered:

1. ~~Canonical tags vs. hreflang.~~ **Resolved:** canonical is confirmed not needed per the ticket. Hreflang/canonical tags were already implemented as part of a separate prior ticket. For YP-129, Claude Code's job is **verification only** — confirm the existing implementation emits correct tags and behaves as search engines expect (see Phase 7). No new implementation work here.
2. ~~Slug change redirects.~~ **Resolved:** the 301 redirect map for changed slugs is already implemented and in place (separate from this ticket). Claude Code should **verify** the existing redirect logic correctly covers whatever new slugs come out of Phase 1/5, not build new redirect infrastructure.
3. **Scope of social meta tags.** Ticket scopes social to Facebook OpenGraph only. `twitter:card`/`twitter:title`/`twitter:image` are confirmed **out of scope** for this ticket — tracked as a follow-up ticket, not implemented here.
4. ~~OG image asset pipeline ownership.~~ **Resolved:** `sync-figures` is an existing pre-build script that compiles `.tex` figures into `.svg` and copies them (alongside normal images) into the output folder — it already runs at the right point in the build pipeline to also own (or sit next to) the thumbnail→OG-image compositing step. Claude Code should extend `sync-figures` (or add a sibling step invoked at the same point in the build) rather than inventing a new, separately-triggered pipeline. Still confirm target dimensions with David if not obvious (Facebook recommends 1200×630, min 200×200, aspect ratio 1.91:1) — default to 1200×630 unless told otherwise.
5. ~~Generic fallback thumbnail.~~ **Resolved — design direction given:** no such asset exists yet, it needs to be created. Use the homepage hero section's background image, with the horizontal-layout logo lockup and the "There is no royal road, just better maps…" motto burned onto it (same visual treatment already used in the hero itself, from the launch-plan branding work). This becomes the generic OG image for any page/content-file with no thumbnail (homepage, `/hu/cikkek` index, `/hu/hirek` index, and any content item without a `thumbnail` field), run through the same OG-dimension/logo-overlay processing as regular thumbnails in Phase 4.

---

## Phase 1 — Legacy site analysis (slugs + SEO/social fields)

**Goal:** extract ground truth from `youproof.hu` before inventing new values.

1. Crawl/inspect `youproof.hu` (and its sitemap.xml/robots.txt if present) to enumerate all live URLs per content type: books, chapters, articles, newsletters, pages, landings.
2. For each URL, extract:
   - The current slug (URL path segment).
   - `<title>` and `<meta name="description">`.
   - Any existing OpenGraph tags (`og:title`, `og:description`, `og:image`, `og:type`).
3. Produce a mapping artifact — e.g. `legacy-seo-extract.json` or `.csv` — keyed by content type + legacy identifier, containing:
   - `legacy_slug`
   - `legacy_title` / `legacy_seo_title`
   - `legacy_description`
   - `legacy_og_title` / `legacy_og_description` / `legacy_og_image`
4. Cross-reference this extract against the current `youproof-org/content` YAML files to identify:
   - Content that already exists in the new repo (match by title/slug heuristics — flag ambiguous matches for manual review rather than guessing).
   - Legacy slugs that differ from the new repo's current (placeholder) slugs — these become the redirect-map candidates for Phase 5.
5. **Do not auto-write any YAML changes in this phase.** Output the extract + proposed mapping as a review artifact (e.g. `docs/seo-migration/legacy-extract-review.md`) for David to sanity-check before Phase 2 applies it.

---

## Phase 2 — Content schema: SEO + social fields

**Goal:** add fields to the YAML content schema so authors (and the migration script) can set crawler-facing metadata independent of on-page display text.

1. Extend the shared content schema (wherever `published-at`, `thumbnail` etc. currently live) with a new `seo` block, applicable to book, chapter, article, newsletter, page content types (landing pages excluded per the ticket — "not much relevant for SEO"):
   ```yaml
   seo:
     title: string          # optional; falls back to display title if absent
     description: string    # optional; falls back to display excerpt if absent
     og_title: string       # optional; falls back to seo.title, then display title
     og_description: string # optional; falls back to seo.description, then display excerpt
   ```
2. Confirm fallback chain order with David if not obvious from existing display-title/excerpt field names: **display title/excerpt → `seo.title`/`seo.description` → `seo.og_title`/`seo.og_description` override only if explicitly set.**
3. Update the VS Code editor / content authoring tooling (`youproof-org/editor`) to surface these new optional fields (likely low priority relative to the generation pipeline — confirm sequencing with David).
4. Update any content-linting/validation scripts to accept the new fields without requiring them (they're optional, with fallback).

---

## Phase 3 — Static generation: meta tag injection

**Goal:** every statically generated page emits correct `<head>` tags at build time.

1. Build a shared `buildPageMeta()` (or similar) helper in the Next.js static export pipeline that, given a page's content type + resolved content object (or `null` for content-less pages like the homepage / index pages), returns:
   - `title`
   - `meta description`
   - Full OG block: `og:title`, `og:description`, `og:type`, `og:locale`, `og:url`, `og:site_name`, `og:image`
2. Site-wide constants (not per-page): `og:site_name`, base `og:locale` mapping per locale, canonical domain for `og:url` construction. Store these in one config location, not scattered across templates.
3. Per-page-type `og:type` mapping (confirm with David / use standard OG types as defaults):
   - Homepage → `website`
   - Book index → `book`
   - Chapter → `article` (or `book` — confirm; chapters arguably aren't standalone articles)
   - Article → `article`
   - Article/News index pages → `website`
   - Newsletter instance → `article`
   - Static page (privacy policy etc.) → `website`
   - Landing pages → excluded per ticket scope
4. `og:url` must resolve to the canonical production URL for the page (using the locale-aware URL builder from YP-125's `buildLocalizedUrl` helper if that's landed by the time this is implemented — check for dependency ordering).
5. Wire `title`/`meta description` fallback chain from Phase 2 into every page template, including the content-less pages (homepage, `/hu/cikkek`, `/hu/hirek` index) which use hardcoded/site-level defaults since they have no backing YAML file.
6. Add `<html lang="hu">` (locale-driven, not hardcoded) if not already present.
7. Implement the Phase 0 hreflang decision (self-referential tag or skip).

---

## Phase 4 — OG image generation pipeline

**Goal:** build-time generation of Facebook-optimized share images from content thumbnails, integrated into the existing `sync-figures` pre-build step (which already compiles `.tex` figures to `.svg` and copies images into the output folder at the right point in the pipeline).

   Both regular thumbnails and the generic fallback go through the **same** OG-processing step (same code path, same output). The only difference is the input image and the logo/motto overlay applied:
1. Regular thumbnails — for each content item with a `thumbnail`:
   - Loads the thumbnail.
   - Resizes/crops to Facebook's recommended OG image dimensions (1200×630 by default — confirmed in Phase 0 Q4).
   - Composites a **small** horizontal-layout `youproof.org` logo into the **top-right corner**.
   - Outputs to a predictable path (e.g. `R2` alongside other generated assets).
2. Generic fallback OG image (doesn't exist yet) — same processing, different input and overlay:
   - Uses the homepage hero section's background image as the input (its central area is intentionally left relatively empty, so the overlay fits cleanly there).
   - Resizes/crops to the same OG dimensions.
   - Composites the **big** horizontal-layout logo **and** the "There is no royal road, just better maps…" motto into the **middle** of the image (matching the existing hero treatment from the launch-plan branding work).
   - Use this for content with **no thumbnail**, and for pages with **no backing content file** (homepage, `/hu/cikkek` index, `/hu/hirek` index).
3. Emit the resulting OG image URL into the `og:image` field from Phase 3.

---

## Phase 5 — Slug migration + redirect verification

**Goal:** apply the Phase 1 extract to produce SEO-friendly slugs, without breaking any already-indexed URL. Note: the 301 redirect infrastructure itself is **already implemented** (separate prior work) — this phase is about feeding it correct data and verifying it, not building it.

1. Using the reviewed Phase 1 mapping artifact, update `slug` fields across book, chapter, article, newsletter, page, and landing content YAML files.
   - Confirm with David whether landing/page slugs should also be migrated even though they're "not much relevant for SEO" — likely yes for consistency, low priority.
   - Confirm whether **chapter section-level** slugs are needed (ticket says "consider if needed") — sections currently don't have their own URLs per the page list provided, so default to **not needed** unless David says otherwise.
2. For every slug that changes from what's currently live/indexed on `youproof.hu`, confirm an entry exists (or gets added, using the existing mechanism) in the already-implemented redirect table so the old path 301s to the new `youproof.org` URL rather than 404ing or falling through to the legacy proxy. Do not build new redirect logic — locate and reuse what's already there.
3. Validate no redirect chains are introduced (old slug → new slug → newer slug) — collapse to a single hop.
4. Re-run the manifest generator (per the existing CI/CD plan) to ensure the Worker's bundled manifest reflects the new slugs before deploy.

---

## Phase 6 — `robots.txt`, `sitemap.xml`, `X-Robots-Tag`

**Goal:** verify (and fix if needed) the existing generation/enforcement, per the ticket's explicit ask to "double-check."

1. **`robots.txt`:**
   - Confirm it's generated per-environment (not a static file checked into the repo) — production allows indexing; staging disallows. (The legacy site is a proxied upstream origin, not an environment we generate `robots.txt` for — its unmigrated paths are handled via `X-Robots-Tag` below.)
   - Confirm it references the correct `Sitemap:` URL.
2. **`sitemap.xml`:**
   - Confirm it's generated at build time from the actual current content set (not stale/hand-maintained).
   - Confirm it includes all indexable page types (books, chapters, articles, article index, newsletters, news index, pages) and **excludes** landing pages (ad-bound, not relevant for SEO) and any noindexed environments.
   - Confirm `lastmod` values are populated (from `published-at` or content file modification data) — helps crawl prioritization.
3. **`X-Robots-Tag`:**
   - Implement/verify at the Cloudflare Worker level: `X-Robots-Tag: noindex, nofollow` served for all responses on `staging.youproof.org` and on the legacy-proxy path, regardless of content type (not just HTML).
   - Confirm production (`youproof.org`) explicitly does **not** send this header (or sends `index, follow` — decide which is the intended default and be explicit rather than relying on absence).
   - This should live alongside the existing per-environment Terraform `vars` bindings already used for the two-environment single-codebase Worker setup.

---

## Phase 7 — Post-launch verification

**Goal:** the ticket asks for a comprehensive SEO analysis *after* production release — sequence this as a follow-up task, not blocking initial launch, but plan it now.

1. Verify `robots.txt` and `sitemap.xml` are live and correct on production (not staging values leaking through).
2. Verify `X-Robots-Tag` headers are correctly absent/present per environment (spot-check staging and production, plus the legacy-proxy path — legacy being a proxied upstream origin, not a separate environment).
3. Verify OG tags with an actual link-preview/debug tool (e.g. Facebook's Sharing Debugger) on a sample of each content type — book, chapter, article, newsletter, page, homepage.
4. Verify meta title/description render correctly and within reasonable length limits (title ~50–60 chars, description ~150–160 chars) across a sample of pages — flag content whose fallback-derived title/description is too long, rather than silently truncating.
5. **Double-check the already-implemented hreflang/canonical tags** on a sample of each content type — confirm the tags are present/absent exactly as intended (no canonical, per the documented ticket decision) and that hreflang markup (if self-referential per prior implementation) validates against Google's guidelines (e.g. via Search Console's URL Inspection tool or a third-party hreflang validator). This is a verification pass only — the tags themselves were implemented under a separate ticket.
6. **Double-check the already-implemented 301 redirect map** covers every slug that changed as part of Phase 5, with no chains and no dead ends — spot-check a sample of old `youproof.hu` URLs to confirm they land on the correct new `youproof.org` URL in a single hop.
7. Document findings in a Confluence page (consistent with existing "Deployment Architecture" / "Repository Structure" docs) rather than only as a Jira comment, so it's discoverable later.

---

## Explicitly out of scope for this ticket (per YP-129 text)

- Canonical tags (documented decision: not needed during migration).
- New hreflang/canonical implementation — already done under a separate prior ticket; YP-129 only verifies it (Phase 7).
- New redirect-map implementation — already done under separate prior work; YP-129 only feeds it new slug data and verifies it (Phase 5/7).
- Landing pages for meta/SEO purposes (only for basic hygiene, not prioritized).

## Confirmed follow-up tickets (not in YP-129, raised during planning, David has agreed these are separate)

- **JSON-LD structured data** (Article/Book/BreadcrumbList/Organization schema.org markup) — enables rich results in search (breadcrumbs, book/article cards, sitelinks search box) and helps crawlers/AI answer engines understand relationships between content pieces (e.g. chapter-belongs-to-book). Doesn't directly affect ranking but improves click-through rate on results that do rank. Needs real schema-design work for a math/book platform, hence follow-up rather than folding into YP-129.
- `twitter:card` meta tags (X/Twitter-specific; OG tags alone don't fully cover it).
- Search Console + Bing Webmaster Tools submission (David has a separate release ticket covering this).
