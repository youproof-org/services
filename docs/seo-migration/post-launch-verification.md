# YP-129 — SEO post-launch verification checklist

Runbook for verifying the YP-129 SEO work on the live site. Copy into Confluence
(alongside "Deployment Architecture" / "Repository Structure").

Each item is tagged:

- **[AUTO]** — already enforced by the deploy **quality gate** (`tools/smoke-tests`,
  crawler + `.hu` worker smoke tests). It runs post-deploy on every environment and
  fails the run on any fatal finding, so a green deploy already implies these pass.
  Re-check manually only when investigating.
- **[MANUAL]** — needs a human (visual card review, external tools, Search Console);
  cannot be automated.

Reference values (per environment):

| | Production | Staging |
|---|---|---|
| `.org` host | `youproof.org` | `staging.youproof.org` |
| `.hu` host | `youproof.hu` | `staging.youproof.hu` |
| Indexable? | **Yes** (apex) | **No** (noindex everywhere) |
| `robots.txt` | `Allow: /` + `Sitemap:` | `Disallow: /` |
| `X-Robots-Tag` on `.org` | absent on apex | `noindex, nofollow` (via zone rule) |
| `X-Robots-Tag` on legacy proxy | absent (kept indexable) | `noindex, nofollow` |

> **Sequencing.** The two zone branches (`feat/yp-125-zone-root-redirect` +
> `feat/yp-129-zone-staging-noindex`) apply **only at the `stable/production`
> merge** and are promoted through the lane **after** the main YP-129 production
> release. So **Stage C** items (apex root redirect, the `.org` `X-Robots-Tag`
> header) only go live once that zone batch has been applied — verify them then,
> not at the initial production release.

---

## Stage A — on staging (after promoting `feat/yp-129-seo` to `stable/staging`)

Front-loads the risky, content-shaped checks before production. Most are already
enforced by the gate; the manual ones are the visual/scraper checks.

- [ ] **[AUTO]** Every content page emits `<title>`, meta description, canonical,
  hreflang (+`x-default`) and the full OG block; `og:image` resolves. _(gate:
  `seoErrors` / `brokenInternal`)_
- [ ] **[AUTO]** `robots.txt` on `staging.youproof.org` is `Disallow: /`. _(gate:
  `robotsErrors`)_
- [ ] **[AUTO]** `<meta name="robots" content="noindex,nofollow">` on staging HTML;
  `<html lang="hu">` correct; no broken assets (name-based `/content/**` URLs
  resolve). _(gate: crawler)_
- [ ] **[AUTO]** `staging.youproof.hu` legacy proxy serves `X-Robots-Tag: noindex,
  nofollow`; migrated legacy paths `301` to `staging.youproof.org/hu/...` in one
  hop; migrated targets return `200`. _(gate: `.hu` smoke tests + crawler
  migration-target check)_
- [ ] **[MANUAL]** **Facebook Sharing Debugger** (<https://developers.facebook.com/tools/debug/>)
  on one URL of each type — home, book, chapter, article, newsletter, page. Confirm
  the card shows the right **title**, **description**, and the **generated OG image**
  renders (1200×630, logo overlay). FB's scraper ignores `robots.txt`, so staging
  URLs work. _(This is the single most valuable manual check — do it before prod.)_
- [ ] **[MANUAL]** Eyeball the gate's **`seoWarnings`** in the report artifact
  (over-long titles/descriptions from the seeded legacy meta) and trim any that read
  badly. Title ≈ 50–60, description ≈ 150–160 chars (excl. the brand suffix).
- [ ] **[MANUAL]** Open a couple of generated OG images directly
  (`.../og-thumbnail.jpg`, and `/assets/generated/og-thumbnail.jpg`) — confirm they
  look on-brand (not just that they 200).

---

## Stage B — on production (after the full YP-129 + follow-up release)

Run against `youproof.org` / `youproof.hu`.

- [ ] **[AUTO]** All Stage-A page-level checks (meta/OG/canonical/hreflang, assets)
  pass on production. _(gate: `seoErrors`)_
- [ ] **[AUTO]** `robots.txt` on `youproof.org` = `Allow: /` **and** references
  `https://youproof.org/sitemap.xml`. _(gate: `robotsErrors`)_
- [ ] **[MANUAL]** Fetch the production sitemap and sanity-check it:
  ```bash
  curl -s https://youproof.org/sitemap.xml | head
  ```
  Confirm: real production URLs, `<lastmod>` present, landing pages excluded, no
  staging URLs leaking.
- [ ] **[MANUAL]** Confirm **no** `X-Robots-Tag: noindex` and **no** `noindex` meta
  on a production page (production must be indexable):
  ```bash
  curl -sI https://youproof.org/hu | grep -i x-robots-tag        # expect: no output
  curl -s  https://youproof.org/hu | grep -i 'name="robots"'      # expect: no noindex
  ```
- [ ] **[MANUAL]** **Facebook Sharing Debugger** on the production URLs (one per
  type) — re-scrape and confirm the cards + OG images are correct on the real host.
- [ ] **[MANUAL]** **Google Search Console** — submit `https://youproof.org/sitemap.xml`;
  run **URL Inspection** on a sample page and confirm: indexable, canonical =
  self, hreflang recognised, no "blocked by robots.txt"/"noindex" warnings.
- [ ] **[MANUAL]** Validate **hreflang** on a sample (Search Console URL Inspection
  or a third-party hreflang validator) — self-referential `hu` + `x-default`,
  **no `canonical` pointing away** (per the ticket: no cross-host canonical).
- [ ] **[MANUAL]** **Bing Webmaster Tools** — submit the sitemap _(tracked in the
  separate release ticket; note here for completeness)_.

### Legacy `youproof.hu` (only once the production Worker cut-over is done)

Production `youproof.hu` runs on legacy WordPress until `production_cutover=true`.
After cut-over:

- [ ] **[AUTO]** Migrated `.hu` paths `301` to `youproof.org/hu/...` (one hop);
  targets `200`. _(gate: `.hu` smoke tests, when the prod worker job runs)_
- [ ] **[MANUAL]** Spot-check a sample of real old `youproof.hu` URLs (from the
  Phase-1 `legacy-extract-review.md`) in a browser → land on the correct new
  `.org` page, single hop:
  ```bash
  curl -sI "https://youproof.hu/kriptografia/1-alapfogalmak-caesar-vigenere-enigma-kulcsmegosztas" | grep -i '^location'
  ```
- [ ] **[MANUAL]** Confirm the production legacy proxy stays **indexable** — no
  `X-Robots-Tag: noindex` on a proxied unmigrated `youproof.hu` path (we keep
  indexing unmigrated legacy content until it's migrated).
  ```bash
  curl -sI https://youproof.hu/<some-unmigrated-path> | grep -i x-robots-tag   # expect: no output
  ```

---

## Stage C — after the zone batch is promoted (post-release, zone-only lane)

Only valid once `feat/yp-125-zone-root-redirect` + `feat/yp-129-zone-staging-noindex`
have been merged and applied at the production zone apply.

- [ ] **[MANUAL]** `X-Robots-Tag: noindex, nofollow` **is** served on
  `staging.youproof.org` (incl. a non-HTML asset — the whole point of the zone rule),
  and **absent** on `youproof.org`:
  ```bash
  curl -sI https://staging.youproof.org/hu | grep -i x-robots-tag                     # expect: noindex, nofollow
  curl -sI https://staging.youproof.org/assets/generated/og-thumbnail.jpg | grep -i x-robots-tag  # expect: noindex, nofollow
  curl -sI https://youproof.org/hu | grep -i x-robots-tag                             # expect: no output
  ```
- [ ] **[MANUAL]** Apex root redirect: `https://youproof.org/` → `302` →
  `https://youproof.org/hu`:
  ```bash
  curl -sI https://youproof.org/ | grep -iE '^(HTTP|location)'
  ```

---

## Follow-ups (out of YP-129 scope — track separately)

- JSON-LD structured data (Article/Book/BreadcrumbList/Organization).
- `twitter:card` meta tags.
- Redirect strategy for the ~719 legacy KB-entity + taxonomy URLs (no standalone
  `.org` URL) — see `legacy-extract-review.md`.
- Search Console + Bing submission (separate release ticket).

## Sign-off

Record the results (pass/fail per item, screenshots of the FB cards + URL
Inspection) in this page so the verification is discoverable later. Note the
`(services_sha, content_sha)` pair and the date verified.
