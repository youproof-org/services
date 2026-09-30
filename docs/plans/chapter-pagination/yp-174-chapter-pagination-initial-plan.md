# Chapter Pagination — Planfile

## Problem

Chapter pages on youproof.org exceed Ahrefs' crawl size limit, which indicates they are
too large for search engines to reliably index in full. The pages need to be split into
smaller crawlable units without degrading the reading experience.

## Goals

- Each chapter page segment is a separate static HTML file with its own URL, fully
  indexable by search engines.
- Users experience the chapter as one seamless, continuous document regardless of which
  page they land on.
- The pagination mechanism is invisible during normal reading — it only becomes apparent
  at the URL level.

## Non-goals

- No server-side runtime is introduced. The site remains a fully static Next.js export
  on Cloudflare R2.
- No separate API or JSON endpoint is needed. Dynamic loading reuses the already-generated
  static HTML pages.

---

## URL Structure

Path-based pagination under the existing chapter URL:

```
/hu/chapter/<slug>/        ← page 1 (canonical, same URL as today)
/hu/chapter/<slug>/2/      ← page 2
/hu/chapter/<slug>/3/      ← page 3
```

Page 1 keeps its current URL unchanged so existing links and indexed URLs are unaffected.

---

## Static Generation

At build time, each chapter is split into page-sized slices based on its section list.
The exact slicing strategy (by section count, by estimated rendered size, or a hybrid)
should be determined by Claude Code after inspecting the content YAML structure and the
existing chapter page component.

Each generated page (`/hu/chapter/<slug>/N/`) is a complete, standalone HTML document
containing:

- The content for that page's sections only
- Correct `<title>` and `<meta>` tags relevant to those sections
- `<link rel="canonical">` pointing to itself
- `<link rel="prev">` and `<link rel="next">` in `<head>` where applicable
- A `data-chapter-slug` and `data-page` attribute (or equivalent) on the content
  container so the client script can read its own position without hardcoding

Page 1 additionally keeps the existing canonical URL structure and should contain the
most SEO-dense content (key definitions, main theorems).

---

## Client-Side Infinite Scroll

### Entry point

When a page loads, the scroll loader initialises with:

- `topPage` = current page number
- `bottomPage` = current page number
- `FIRST_PAGE` = 1
- `LAST_PAGE` = total page count for this chapter (available from the generated page)

### Two sentinels

A sentinel element is placed at the very top and at the very bottom of the chapter
content container. Each is observed by its own `IntersectionObserver` with a generous
`rootMargin` so loading begins before the user actually reaches the edge.

### Fetching pages

When a sentinel fires, the loader fetches the adjacent static HTML page
(`/hu/chapter/<slug>/N/`), parses it with `DOMParser`, and extracts only the chapter
content fragment (by a stable selector on the content container). The full HTML shell
(head, nav, footer) is discarded.

### Appending content (scroll down)

New content is appended to the bottom of the container. The bottom sentinel is moved
(or re-observed) after the new content. The observer is disconnected when
`bottomPage === LAST_PAGE`.

### Prepending content (scroll up)

New content is prepended to the top of the container. **Scroll position must be
preserved** — save `scrollHeight` before the DOM mutation and call
`window.scrollBy(0, newScrollHeight - savedScrollHeight)` immediately after, so the
viewport does not jump. The top sentinel is moved (or re-observed) after the new
content. The observer is disconnected when `topPage === FIRST_PAGE`.

### URL updates

A separate `IntersectionObserver` watches the first element of each loaded page's
content. Whichever page's marker is nearest the top of the viewport determines the URL
shown to the user, updated via `history.pushState`. This keeps the address bar in sync
as the user scrolls in either direction.

### LaTeX re-rendering

After any DOM insertion, KaTeX (or whichever renderer the codebase uses) must be
re-run scoped to the newly inserted fragment only. Claude Code should identify the
correct re-render call from the existing math rendering setup.

---

## Direct Navigation to a Non-First Page

When a user or crawler lands directly on `/hu/chapter/<slug>/2/`:

- Page 2's content is rendered as the initial HTML (no back-fill of page 1).
- The scroll loader initialises with `topPage = 2`, `bottomPage = 2`.
- Scrolling **down** loads page 3, 4, … as normal.
- Scrolling **up** dynamically loads page 1 above the current content (with scroll
  anchoring applied).
- There is no "read from the beginning" banner — the upward scroll handles this
  transparently.

---

## Anchor Integrity

### The problem

Today, internal cross-references link to anchors within a chapter using URLs like
`/hu/chapter/real-analysis#completeness-theorem`. After pagination, that anchor may
live on page 2. A link without the page number will land the user on page 1 with no
scroll to the target.

There are two populations of affected links:

- **Internal links** generated at build time from the content YAML cross-references —
  these can be fixed at the source.
- **External links and already-indexed URLs** (bookmarks, other sites, Google's index)
  pointing to the pre-pagination bare anchor URL — these cannot be controlled and need
  a runtime fallback.

### Build-time: anchor-to-page map

During static generation, every anchor ID in the chapter must be assigned to a page
number. This is fully deterministic since the slicing is done at build time. The
resulting map for each chapter looks like:

```
{
  'completeness-theorem': 2,
  'cauchy-sequence': 2,
  'bolzano-weierstrass': 3,
  ...
}
```

Claude Code should determine where this map is best produced (alongside the slicing
logic) and how it is made available to both the link rewriter and the page 1 runtime
fallback below.

### Build-time: rewrite internal cross-reference links

Any link in the generated HTML that points to an anchor within the same chapter must
be rewritten to include the correct page number:

```
/hu/chapter/real-analysis#completeness-theorem
→ /hu/chapter/real-analysis/2/#completeness-theorem
```

Claude Code should identify where cross-reference links are rendered (likely in the
section/entity components) and apply the rewrite there using the anchor-to-page map,
rather than doing a post-processing pass over the HTML.

### Runtime fallback on page 1: legacy anchor redirect

Page 1 must handle inbound links that carry a hash but omit the page number — covering
external links, bookmarks, and URLs already indexed by search engines.

On page 1 load, if the URL contains a hash that does not match any anchor present in
page 1's own DOM, look up the hash in the anchor-to-page map and redirect:

```ts
window.location.replace(`/hu/chapter/<slug>/<page>/#<hash>`);
```

Use `replace` (not `assign`) so the redirect does not appear in browser history. The
anchor-to-page map should be inlined into page 1's HTML at build time as a small
`<script>` block. No network request is needed.

If the hash is not found in the map either, do nothing — it may be a typo or a
removed anchor.

---

## SEO Checklist

- [ ] `rel="prev"` / `rel="next"` present in `<head>` on all pages where applicable
- [ ] Each page has a unique, meaningful `<title>` (not just "Chapter X — Part 2")
- [ ] No page uses `rel="canonical"` pointing to page 1 (each page is its own canonical)
- [ ] Page 1 URL is unchanged from the pre-pagination URL
- [ ] Ahrefs crawl size re-checked after deploy to confirm pages fall within limits
- [ ] No internal cross-reference link points to a bare chapter anchor without a page number
- [ ] Page 1 anchor-to-page map covers all anchors that moved off page 1
- [ ] Legacy bare anchor URLs verified to redirect correctly via the runtime fallback
- [ ] Entity pages (YP-162) and chapter page segments are not competing for the same queries — each entity's occurrence within a chapter page should carry a `rel="canonical"` pointing to the entity's own page, so Google treats the entity page as authoritative for concept-level queries and the chapter page for narrative/contextual ones

---

## Open Questions for Claude Code

1. **Slicing strategy** — what is the right unit and threshold for splitting? Inspect the
   section YAML structure and the rendered output size of the longest chapters to decide.
2. **Content container selector** — what stable selector identifies the chapter body
   fragment to extract from a fetched page? Confirm it is present and unique on all
   chapter pages.
3. **`LAST_PAGE` injection** — what is the cleanest way to make total page count
   available to the client script? (inline `<script>`, `data-` attribute, or derived
   from `rel="next"` absence.)
4. **Math re-render API** — locate the existing KaTeX initialisation and confirm the
   correct call for scoped re-rendering on a DOM fragment.
5. **`generateStaticParams` shape** — confirm whether the existing chapter route uses
   the App Router or Pages Router, and adjust the param generation accordingly.
6. **Anchor ID inventory** — identify all places in the codebase where anchor IDs are
   generated (section headings, definition/theorem/proof entities, etc.) to ensure the
   anchor-to-page map is exhaustive.
7. **Cross-reference link render location** — find where internal cross-reference links
   are emitted in the component tree so the page-number rewrite can be applied at the
   right point rather than as a post-processing step.
8. **Per-page metadata generation** — each paginated page must have a distinct `<title>`
   and `<meta name="description">` derived from the entities it contains, not a generic
   "Chapter X — Part N" fallback. Inspect the YAML entity fields (names, short titles,
   summaries, or equivalents) and determine what can be meaningfully composed into
   unique, descriptive metadata for each page. The strategy should be decided and
   implemented alongside the slicing logic, since both operate on the same section-to-page
   assignment.
