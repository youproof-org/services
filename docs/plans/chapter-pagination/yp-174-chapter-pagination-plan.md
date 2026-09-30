# Chapter pagination plan (YP-174).

Supersedes `yp-174-chapter-pagination-initial-plan.md`, which was written without
codebase context.

## Decisions.

- **Move the RSC payload out of the HTML** with a postbuild rewrite
  ([details](#moving-the-payload-out-of-the-html)). Build-time checks and browser
  tests guard the Next.js internal it relies on.
- **Paginate the four chapters whose content alone is over the limit**, with page
  breaks and page metadata authored in `chapter.yaml` under a new `pages` key.
- **The size gate is 1,990,000 bytes of HTML per page**, just under the 2 MiB that
  Ahrefs measures.
- **URLs:** page 1 keeps the chapter URL, and later pages add `/{n}` with no
  trailing slash.
- **Markup:** each page's sections sit in a wrapper `div`, with a `<nav>`
  placeholder before and after it that links to the neighbouring page.
- **With JavaScript, the chapter reads as one continuous document.** Neighbouring
  pages load while you scroll, and the URL follows the page in view with
  `replaceState`. Each boundary crossing sends a GA4 `page_view`.
- **Mid-content newsletter forms are placed on the client**, one every three
  sections, counted from where the reader arrived.
- **No anchor redirects for old links**, because nothing links to chapter anchors
  from outside yet.
- **Page meta is required** on every page after page 1 of a published chapter. The
  content repo's PR check enforces it first, and the website build is the backstop.
- **Every page's meta describes only that page.** In a split chapter, that includes
  page 1: its meta is rewritten, because crawlers read it as the description of that
  specific page.
- **Pages after page 1 name their page in the Open Graph title:**
  `24. fejezet: Alice és Bob komolyabb fegyverekhez nyúl (2. rész)`.
- **The `Chapter` node in KB structured data is named by the root `title`**, since
  it describes the whole chapter, not one page.
- **Considered and rejected:** keeping KaTeX out of the payload with a client
  component ([why](#considered-and-rejected-keeping-katex-out-of-the-payload)).
- **The release is `2.4.0`.**

## Problem.

Ahrefs flags 10 published chapters as too large. Its reasoning: Googlebot only reads
the first 2 MB of an HTML page's uncompressed content, and silently discards the
rest.

### What Ahrefs measures.

Production (`https://youproof.org`, fetched September 30) shows **Ahrefs measures
the whole HTML file against 2 MiB (2,097,152 bytes)**:

| published chapter | whole file (bytes) | content ends at (bytes) | flagged |
|---|---|---|---|
| `alice-es-bob-felcsavarja-a-szamegyenest` | 7,263,191 | 2,739,401 | yes |
| `alice-bob-euler-es-fermat` | 5,682,986 | 2,133,229 | yes |
| `alice-es-bob-komolyabb-fegyverekhez-nyul` | 5,543,860 | 2,087,661 | **no** (see below) |
| `alice-es-bob-titkosit` | 5,028,577 | 1,913,868 | yes |
| `alice-bob-es-a-kinaiak` | 4,426,164 | 1,667,038 | yes |
| `alice-es-bob-okori-haverja` | 3,567,736 | 1,339,334 | yes |
| `alice-es-bob-idealjai` | 3,543,120 | 1,334,045 | yes |
| `alice-es-bob-primszamok-utan-nyomoz` | 2,939,834 | 1,108,949 | yes |
| `alice-es-bob-az-absztrakcio-utjan` | 2,573,955 | 965,989 | yes |
| `alice-es-bob-alaptetele` | 2,559,413 | 961,657 | yes |
| `alice-es-bob-gyuruje` | 2,437,030 | 914,873 | yes |
| `alice-es-bob-eladosodik` | 2,091,091 | 781,492 | no |
| `alice-es-bob-rendet-tesz` | 2,000,271 | 752,571 | no |

- `alice-es-bob-eladosodik` is over 2,000,000 bytes but under 2 MiB, and it isn't
  flagged. Every file over 2 MiB is flagged. That points to a 2 MiB threshold on the
  whole file.
- `alice-es-bob-komolyabb-fegyverekhez-nyul` is over 2 MiB but not flagged, because
  it was published on September 29, after the last Ahrefs crawl. It will be flagged
  on the next one.
- `alice-es-bob-fontos-parhuzamokat-talal` and `alice-es-bob-atlepi-a-celvonalat`
  are stubs on production today. They'll be flagged once they're published (4.2 MB
  and 9.97 MB locally).

### Where the bytes go.

- "Content ends at" is the offset of the first `self.__next_f.push` script. Every one
  of those scripts (the RSC Flight payload App Router needs for hydration) sits after
  the footer. None of them come before `</article>` on any chapter.
- That payload is **about 62% of every chapter file**. Each file is ~2.66 times its
  content prefix.

### Pagination alone can't meet the Ahrefs limit.

To keep the whole file under 2 MiB, a page's content has to stay under ~0.75 MB.
Section is the smallest unit, and one section doesn't fit on its own:

| section | markup | estimated single-section page |
|---|---|---|
| `alice-bob-euler-es-fermat` §5 | 0.80 MB | **2.16 MiB** |
| `alice-es-bob-atlepi-a-celvonalat` §9 | 0.71 MB | 1.95 MiB |
| `alice-es-bob-felcsavarja-a-szamegyenest` §1 | 0.72 MB | 1.93 MiB |

So pagination alone would need a split inside §5, and would cut about 12 chapters
into up to six pages each. The next section removes the payload from the HTML
instead. That reduces pagination to the few chapters whose content itself is too
large.

## Moving the payload out of the HTML.

**Next.js has no option to move the initial RSC payload out of the HTML.** None
that I found in Next 15.5, anyway: the `experimental` config has no such flag, and
the payload inlining is fixed in the App Router renderer. The per-page `.txt` files
in the export are the same payload, but only client-side navigation reads them.
Hydration reads the inline scripts.

A postbuild rewrite can move it, though, and a prototype of it works on the current
export.

### The rewrite: an example.

Every exported page ends the same way today. The async Next.js runtime is followed by
one init script, then a contiguous run of push scripts, then `</body></html>`, with
nothing in between. From `alice-es-bob-gyuruje.html` (575 pushes, 1.5 MB):

```html
…<footer>…</footer>
<script src="/_next/static/chunks/webpack-3c5f26592c5e8db9.js" id="_R_" async=""></script>
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
<script>self.__next_f.push([1,"1:\"$Sreact.fragment\"\n2:I[…"])</script>
<script>self.__next_f.push([1,"084ffa52b00e-s.p.woff2\",\"…"])</script>
…573 more…
</body></html>
```

After the rewrite, the HTML ends like this:

```html
…<footer>…</footer>
<script src="/_next/static/chunks/webpack-3c5f26592c5e8db9.js" id="_R_" async=""></script>
<script src="/_next/static/flight/bbe9b390d8f931389516.js"></script>
</body></html>
```

And `/_next/static/flight/bbe9b390d8f931389516.js` holds the same statements,
byte for byte, in the same order:

```js
(self.__next_f=self.__next_f||[]).push([0]);
self.__next_f.push([1,"1:\"$Sreact.fragment\"\n2:I[…"]);
self.__next_f.push([1,"084ffa52b00e-s.p.woff2\",\"…"]);
…
```

Nothing is decoded or re-encoded. The push arguments are copied as they are, and
only the `<script>` wrappers change. The file name is a hash of its content, so it's
immutable: a new page can never be paired with an old payload from a cache. Living
under `/_next/static/` means the existing hashed-asset cache and pruning rules apply
([CDN & R2](../../cdn-and-r2.md#cache-rules)), which needs confirming for a
directory Next.js didn't create.

### Why a synchronous script, and not a fetch of the `.txt`.

This is the one piece of Next.js internals the rewrite depends on
(`next/dist/client/app-index.js`, 15.5.12):

- `self.__next_f` is a global array. The client feeds every entry pushed onto it into
  the stream React hydrates from.
- The stream **closes at `DOMContentLoaded`**.
- A classic external `<script src>` (not `async`, not `defer`, not a module) blocks
  the parser. So it runs before `DOMContentLoaded`, exactly like the inline scripts
  it replaces. The async runtime may run before or after it, just as it may run
  between inline scripts today, which is why Next.js uses a global array at all.
- A `fetch` of the `.txt` would resolve after the close, and the payload would be
  lost.

### The prototype, run on the current export.

A prototype of `externalize-flight.mjs` (about 70 lines, not committed) ran on a copy
of the local export on September 30:

- **All 590 HTML pages matched the expected shape.** None tripped a guard.
- **Total HTML went from 149.1 MiB to 52.6 MiB.**
- Chapter files now equal their content prefix. The largest are
  `alice-es-bob-atlepi-a-celvonalat` (3.54 MiB),
  `alice-es-bob-felcsavarja-a-szamegyenest` (2.61), `alice-es-bob-komolyabb-fegyverekhez-nyul`
  (2.23), `alice-bob-euler-es-fermat` (2.03), and `alice-es-bob-titkosit` (1.83).
- **Hydration was checked in Chromium, original next to rewritten**, on the home page,
  two chapters, and the theorem index. React attached to the tree on both, neither
  logged a page or console error, and each rewritten page made exactly one flight
  request. The theorem index's client-side filter (`ListFilter`) behaves the same on
  both, filtering 193 rows to six for "Fermat".
- The full e2e suite couldn't run, because the local `out/` was older than the
  content (the fixture check rejects it). That's a stale build, not the rewrite.
  Running the suite on a fresh build is the first step of phase one.

### Effect.

- Four chapters stay over the gate, and each splits into two pages:
  - `alice-es-bob-felcsavarja-a-szamegyenest`
  - `alice-bob-euler-es-fermat`
  - `alice-es-bob-komolyabb-fegyverekhez-nyul`
  - `alice-es-bob-atlepi-a-celvonalat`, once it's published
- Every section fits on a page of its own, with a wide margin.
- A reader downloads the same bytes as before, plus one cacheable request.
  Hydration still waits for the payload, as it does today.

### What the rewrite assumes, and how each assumption is checked.

The fragility is in four assumptions about the page Next.js emits. The rewrite
doesn't trust any of them. It checks each one on every page, at build time, and
stops the build if one fails:

| assumption | checked by |
|---|---|
| exactly one `(self.__next_f=self.__next_f\|\|[]).push([0])` init script | rewrite: fails on zero or several |
| the pushes form one contiguous block ending at `</body></html>` | rewrite: fails on any other markup inside the block, or any `__next_f` before it |
| each push argument is a JSON array starting with a number | rewrite: parses every argument |
| the payload is complete: nothing is lost or reordered | `check-flight.mjs`: decodes the external file's `[1, …]` chunks and compares them with the page's `.txt` payload (below) |

The last check comes from a property I verified on the current export: **on all 589
pages that have a `.txt`, the decoded inline payload is byte-identical to it.** Next.js
writes the `.txt` separately, for client navigation. So comparing against it proves
the rewrite carried the whole payload, and it would catch a Next.js change to either
format.

If a future Next.js stops inlining, or changes the init script, the build fails with
a message naming the page and the broken assumption. It never ships a page that
half-hydrates.

### Costs and risks.

- **It relies on a Next.js internal.** The four checks turn a silent break into a
  build failure, and the e2e suite (below) covers hydration itself.
- **Postbuild checks that read the payload from the HTML** must run before the
  rewrite: `check-anchors.mjs` (hrefs in the payload) and `check-deferred-panels.mjs`
  (the rule about what's markup and what's payload). The simplest order is every
  existing check, then `externalize-flight.mjs`, then `check-flight.mjs` and
  `check-page-size.mjs`. `check-analytics-build.mjs` needs checking for the same
  assumption.
- **Crawlers.** As I understand Google's docs, the 2 MB limit applies to each fetched
  resource on its own, so a large payload file doesn't hide any HTML content. Worth
  confirming. If the renderer truncates a payload file over 2 MB, hydration fails in
  the render pass, but the server HTML it indexes is complete either way.
- **Off production**, the zone's `X-Robots-Tag` rule already covers the new asset
  files like any other asset.

### Testing it so a breaking Next.js change shows up early.

Here's where each layer catches a break, from earliest to latest. All of them run
before the `quality-gate` job.

1. **A local build.** The rewrite and `check-flight.mjs` run in `postbuild`, so the
   first `pnpm build` after a Next.js bump fails on the developer's machine. `next`
   is pinned exactly (`15.5.12` in the `pnpm-workspace.yaml` catalog), so a version
   only changes when someone changes it on purpose. A short comment on that line
   should point at this check.
2. **Unit tests (`pnpm test`, first CI step).** The rewrite and the checker are pure
   functions over strings, so they get `node:test` suites with fixtures: a real page
   tail, and one fixture per broken assumption. These prove the guards fire, but
   they can't see a new Next.js version. Only a build can.
3. **The `website` job's build step (`postbuild`).** It runs the same checks on
   every page of the real export, before the upload.
4. **The `website` job's browser tests (`test:e2e`).** They run against the rewritten
   `out/`, after the build and before the upload. Once the rewrite is in `postbuild`,
   every existing KB interaction test is also a hydration test of the rewritten
   pages. A new `flight.test.ts` adds the direct contract, on a home page, a chapter
   page, a KB entity page, and the theorem index:
   - no inline `__next_f` script is left, and exactly one flight script loads with a
     `200` and a JavaScript content type;
   - no `pageerror`, and no console error (the suite already has
     `support/console-noise.ts` for filtering known noise);
   - React attached (a `__reactFiber$` key on `main`);
   - a client component works: the `ListFilter` filter, and opening a KB panel.

A Next.js bump therefore can't reach staging with broken hydration: it fails at
layer one, three, or four, in the job that would otherwise upload it.

### Considered and rejected: keeping KaTeX out of the payload.

Today `FormulaBlock`, `ClaimBlock`, and `InlineText` (server components) pass KaTeX's
output to `dangerouslySetInnerHTML`, so every formula's HTML and MathML travels twice:
in the markup, and again as a string in the payload. A client component
`<Tex tex=… />` would render the same markup, but the payload would carry only the
TeX source. KaTeX strings are 40–52% of the inline payload bytes, so this would
shrink each chapter file by about 30%.

Why it was rejected:

- **It isn't enough on its own.** Only three of the ten flagged chapters drop under
  the gate. About 10 chapters would still need two to four pages each, against four
  chapters of two pages with the rewrite.
- **It costs every reader.** KaTeX would ship to the browser, and hydration would
  re-run it for every formula on the page (1,365 on
  `alice-es-bob-felcsavarja-a-szamegyenest`).
- **Its one advantage, public APIs only, is covered another way.** The rewrite's
  build-time checks and browser tests turn a Next.js change into a build failure.

The two approaches don't exclude each other. `<Tex>` stays available if the
payload a reader downloads ever becomes a performance concern.

### The MathML isn't the cause.

YP-172 phase 1a (commit `2d32504`, September 7) switched KaTeX to `htmlAndMathml`, so
screen readers and text extractors can read each formula's LaTeX. The MathML is about
20% of each chapter's content. Without it, nine of the ten flagged chapters would
still be over 2 MiB. It stays.

## Goals.

- The HTML of each chapter page stays under the size gate (below 2 MiB).
- With JavaScript, the reader sees one continuous chapter, whichever page they land
  on.
- Without JavaScript (and for crawlers), each page links to its neighbours with plain
  `<a>` elements.
- No server runtime and no JSON endpoint. The loader fetches the already-exported
  HTML pages.

## Non-goals.

- **Anchor redirects for old links.** Nothing links to chapter anchors from outside
  yet, so there's no anchor-to-page map in the page and no `location.replace`
  fallback. Internal links still get the right page number at build time (see
  [Cross-references](#cross-references-get-the-page-number-at-build-time)).
- Splitting inside a section.
- Changing how knowledge-base pages render.
- Shrinking the RSC payload itself (see
  [Considered and rejected](#considered-and-rejected-keeping-katex-out-of-the-payload)).

## URL structure.

The chapter route is `/{locale}/{book}/{book-slug}/{chapter}/{chapter-slug}`
(`/hu/konyvek/…/fejezetek/…`). Pagination adds one numeric segment, with no trailing
slash:

```
/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-atlepi-a-celvonalat      ← page 1, URL unchanged
/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-atlepi-a-celvonalat/2    ← page 2
```

- `/…/1` isn't generated, so it 404s. Page 1 has exactly one URL.
- A file and a directory with the same name already coexist in the export and in R2
  (`tetelek/{t}.html` next to `tetelek/{t}/bizonyitasok/1.html`). The `.html`
  Transform Rule maps `/…/{slug}/2` to `…/{slug}/2.html`, so the CDN needs no
  change.
- `lib/i18n/url.ts` stays the one URL constructor. It gets a `chapter-page` key
  (`bookSlug, chapterSlug, pageIndex`). `urlForChapterPage(chapter, n)` in
  `lib/content/urls.ts` returns `urlForChapter(chapter)` for `n === 1`.
- The segment is a bare number in every locale, so `locales.json` doesn't need a new
  entry.

## Content model: authored pages.

Page breaks and page metadata are authored in `chapter.yaml`. Today's flat
`sections` list and the chapter-level `meta` become a `pages` list:

```yaml
# today
meta:
  title: …
  description: …
  open-graph: { title: …, description: … }
sections:
  - primitiv-gyok
  - polinomok
  - …

# new
pages:
  - meta:
      title: …
      description: …
      open-graph: { title: …, description: … }
    sections:
      - primitiv-gyok
      - polinomok
  - meta:
      title: …
      description: …
    sections:
      - …
```

- **Page 1's meta starts as today's chapter meta.** All 27 chapters have a `meta`
  block today, and the migration moves it into page 1 unchanged. When a chapter is
  split, page 1's meta is rewritten too, so it describes only page 1's sections.
- **The reference grammar doesn't change.** A section is still addressed as
  `books.{book}.chapters.{chapter}.sections.{section}`. Pages are layout, not
  identity, so moving a section to another page moves no reference.
- **What stays chapter-level:** `excerpt`, `thumbnail`, `abstract`,
  `prerequisite-warning`, `prologue`, `epilogue`, and `references`.

### Loader and graph.

- `loadChapter` in `lib/content/loader.ts` reads `pages` into
  `RawChapter.pages: { sectionNames: string[]; meta?: MetaInfo }[]`.
- `ChapterNode` gets `pages: ChapterPageNode[]`, where each page carries
  `{ index, chapter, sections: SectionNode[], meta?: MetaInfo }`.
  `chapter.sections` stays as the flat, ordered list, because every existing consumer
  (numbering, embed and figure indices, the rendered-anchor map, `refOwners`) wants
  the whole chapter. `SectionNode` gets a `page` back-reference.
- `ChapterNode.meta` goes away. `buildPageMeta` reads the page meta instead.
- Page 1 holds the abstract, the prerequisite warning, the prologue, and its
  sections. The last page holds the epilogue. Section numbering (`11.3`), embed
  indices, and figure indices stay chapter-global. A stub chapter renders one stub
  page, whatever its `pages` say.

### Validation, and where it fails.

The build fails if:

- a section appears on more than one page, or on none;
- a page has no sections, or a chapter has no pages;
- the old `sections` or chapter-level `meta` key appears next to `pages`;
- on a published chapter, any page after page 1 lacks `meta.title` or
  `meta.description`;
- a page after page 1 has an `open-graph.title` that doesn't end in `({k}. rész)`
  with its own page number.

It fails in two places, both well before the `quality-gate` job:

1. **Content repo PR check (first to fail).** A new `scripts/check-pages.mjs` runs
   in the content repo, next to `check-slugs.mjs`, from the existing
   `slug-check.yml` PR workflow, or a sibling workflow. An author sees the error on
   their PR, before merge.
2. **The website loader (the backstop).** The same rules throw when the content
   graph loads. In `deploy.yml`, the first thing that loads the graph is `prebuild`
   (`gen-llms-txt.mjs`) in the `website` job's build step, so the job stops within
   seconds, before the export and the upload. `quality-gate` needs `website`, so it
   never starts.

### Rollout across the three repositories.

The website loader, the content repo, and the editor all read this field. The editor
reads `sections` as a string list (`editor/src/content/loader.ts:362`) and writes the
chapter key order (`editor/src/handlers.ts:740`). To avoid a broken build between
merges:

1. **services:** the loader accepts both shapes for a transition window. The old
   shape becomes one page that carries the chapter meta.
2. **content:** a migration script, `scripts/migrate-chapter-pages.mjs`, rewrites
   every chapter to `pages` with a single page (a purely mechanical change). Add
   `check-pages.mjs` and its workflow, and update `docs/content-model.md`.
3. **editor:** the loader, the model, the save order, and the save round-trip test
   learn `pages`.
4. **content:** author the page breaks and page meta for the chapters over the gate
   (see [Authoring the page splits](#authoring-the-page-splits)).
5. **services:** drop the old shape, so the loader rejects it.

## Authoring the page splits.

Claude drafts the page breaks and the page meta on a content repo branch. The
content author reviews them, and nothing is committed without approval. A
native-speaker review of the Hungarian meta is the point of that step, not a
formality.

### Where the breaks go.

Two rules, in order:

1. **Every page is under the gate with room to spare.** Aim for 1.6 MB or less, so a
   page can grow before it needs a new break.
2. **Among the splits that fit, pick a topic boundary** over the most balanced sizes.
   The page title has to describe one coherent topic, and a reader landing on page 2
   should start at a natural beginning.

Proposed from the local export (section sizes are markup bytes; page sizes include
the page chrome). Re-measure in phase four against a fresh build before writing
anything:

| chapter | proposed pages | page sizes | the boundary |
|---|---|---|---|
| `alice-es-bob-felcsavarja-a-szamegyenest` | §1–4 \| §5–9 | 1.42 \| 1.33 MB | computing with remainders \| congruences, homomorphisms, ideals |
| `alice-bob-euler-es-fermat` | §1–4 \| §5–7 | 0.95 \| 1.20 MB | congruences and residue classes \| linear congruences, residue systems, Euler–Fermat |
| `alice-es-bob-komolyabb-fegyverekhez-nyul` | §1–6 \| §7–10 | 1.16 \| 1.19 MB | group theory up to element order \| p-adic order, Miller–Rabin witnesses |
| `alice-es-bob-atlepi-a-celvonalat` | §1–4 \| §5–8 \| §9–12 | 1.36 \| 1.47 \| 0.90 MB | polynomials \| primitive roots, Carmichael numbers \| what to do about Carmichael numbers, AKS, RSA |

`alice-es-bob-atlepi-a-celvonalat` gets three pages. It fits in two only when split
after §5 or §6, and both leave the larger page at 1.92–1.95 MB, too close to the
gate.

### How the meta is written.

For each page, the source is the page's own content, read from its section YAML
files:

- the section titles;
- the definitions and theorems the page **introduces** (its `embed` blocks). A
  reference to something introduced earlier doesn't count, because the page isn't
  about it;
- the opening narrative of each section, for what the page is actually doing with
  those concepts.

The meta follows the conventions all 27 chapters already use:

| field | convention | limit |
|---|---|---|
| `title` | comma-separated topics, most important first: "Moduláris aritmetika, kongruenciák, maradékosztálygyűrűk" | about 60 characters, so the search result title isn't cut off |
| `description` | short topic phrases, each ending with a period: "Moduláris összeadás és szorzás. Kongruenciák. …" | about 155 characters |
| `open-graph.title` | page 1: `{n}. fejezet: {chapter title}`, unchanged. Page k ≥ 2: `{n}. fejezet: {chapter title} ({k}. rész)`, such as "24. fejezet: Alice és Bob komolyabb fegyverekhez nyúl (2. rész)" | |
| `open-graph.description` | the book tagline, "Alice és Bob - Kriptográfia, rejtjelezés" | |

- **Split chapters get new meta on every page, page 1 included.** Today's chapter
  meta describes the whole chapter. After a split, part of it describes another page.
  For example, the `alice-es-bob-felcsavarja-a-szamegyenest` meta mentions ideals and
  residue class rings, which both move to page 2. The meta is mainly read by
  crawlers, so it should match the page it sits on.
- **Unsplit chapters keep their meta unchanged.**
- **Titles and descriptions must be unique across all pages of the site.** The draft
  includes a check for that.
- **`check-pages.mjs` also checks the Open Graph title suffix** on pages after
  page 1, so the convention can't drift.

**What the review gets:** one table per chapter, with each page's sections, size,
the concepts it introduces, and the drafted title and description. The YAML changes
are applied only after the table is approved.

## Size gate.

A new postbuild script, `check-page-size.mjs`, fails the build if any exported HTML
page is over **1,990,000 bytes** (about 1.9 MiB). It runs after the payload rewrite,
so it measures what a crawler downloads. It reports each offending page with its
size, so the author knows which page break to move. The margin below 2 MiB leaves
room for content to grow.

- **It covers every page, not only chapters.** No other page is anywhere near the
  limit, so that costs nothing.
- **It measures HTML only.** The external payload files aren't gated. Ahrefs flags
  HTML pages, and Google judges each fetched resource on its own.
- **A known-oversize list covers the gap between phases.** From phase one until the
  page breaks are authored in phase four, three published chapters are still over
  the gate: `alice-es-bob-felcsavarja-a-szamegyenest`, `alice-bob-euler-es-fermat`,
  and `alice-es-bob-komolyabb-fegyverekhez-nyul`. The script names them in a
  `KNOWN_OVERSIZE` list. Each one is reported as a warning, not an error.
  - A page on the list that's under the gate fails the build, so the list can only
    shrink.
  - Any other oversize page fails the build. That includes
    `alice-es-bob-atlepi-a-celvonalat` if it's published before its page breaks
    exist.
  - Phase four empties the list, and phase six deletes it.

## Page markup.

```html
<article class="chapter" data-chapter="{chapter-name}" data-page-count="2">
  <BookReference/> <header>…<h1>{chapter title}</h1></header>

  <nav data-chapter-slot="prev" data-page="1">          ← absent on page 1
    <a href="/hu/…/{slug}" rel="prev">…</a>
  </nav>

  <div data-chapter-page="2">                            ← this page's content
    <section id="szakaszok.…">…</section>
    <div data-newsletter-slot="7" hidden></div>          ← before global section 7
    <section id="szakaszok.…">…</section>
  </div>

  <nav data-chapter-slot="next" data-page="3">          ← absent on the last page
    <a href="/hu/…/{slug}/3" rel="next">…</a>
  </nav>

  <nav class="chapter-nav">…previous / next chapter…</nav>
</article>
```

- **The wrapper `div` is confirmed.** It adds no meaning, so it's neutral for SEO.
  It gives the loader one node to extract and one node to observe for URL sync.
- **The placeholders are `<nav>`, confirmed.**
- The chapter header and the chapter-to-chapter nav render on every page, outside
  the wrapper. So every page has an `<h1>` and context, and the loader never
  duplicates them.
- Placeholder link text names the neighbouring page's content, such as the first
  section's number and title, rather than "next page".
- Styling isn't affected: neither stylesheet uses sibling or child combinators on
  sections.

## Newsletter forms: placed on the client.

The right place for a mid-content form depends on where the reader arrived, so the
server can't decide it. The server renders only empty slots, and the client decides
which slots get a form.

### Slots.

- The server renders an empty `<div data-newsletter-slot="{b}" hidden>` before every
  section except the first one of the chapter. `b` is the chapter-global index of
  the section it precedes (zero-based).
- Slots sit inside the page wrappers, so fetched pages bring their own slots along.
- Server-rendered pages and injected pages look the same, so one mechanism covers
  both.
- An empty `div` costs a few bytes and means nothing to a crawler.
- **Without JavaScript**, nothing fills the slots. Nothing is lost:
  `NewsletterForm` needs JavaScript to submit anyway (Turnstile and `fetch`).

### Which slots get a form.

With `S` sections in the chapter and `a` the arrival point (the global index of the
first section on the page the reader landed on), the rule is:

```
form at slot b  ⇔  b = a + 3k  for a whole number k
                   and b ≥ 3           (at least three sections before it)
                   and S − b ≥ 3       (at least three sections after it)
                   and section b − 1 is in the DOM
```

- `a` is fixed at arrival. It never changes while the reader scrolls, so no
  placed form ever moves.
- The last condition only matters for `b = a`, the slot right above the arrival
  section. It's empty on arrival, so no form sits right under the header. It's
  filled once the previous page is prepended and a section appears above it. Every
  other slot that matches already has its preceding section in the DOM, so the
  spacing is a strict three everywhere.
- Whenever a page is inserted, `ChapterPager` evaluates the slots the insert made
  eligible: the new page's own slots, plus slot `a` after the first prepend. Once a
  slot has a form, it's never re-evaluated.
- When a prepend fills slot `a`, that form renders in the same commit as the
  prepended page. So the scroll compensation measures both, and the reader's view
  doesn't jump.
- **How it renders:** `createPortal(<NewsletterForm placement="mid-content"
  instance={`mid-content-${b}`} />, slotElement)`, with `hidden` removed. A portal
  into an empty `div` is safe both where React rendered it (the server-rendered
  page) and inside injected HTML, because React never reconciles the children of
  an element it left empty or filled with `dangerouslySetInnerHTML`.
- **Examples,** for a 12-section chapter (indices 0–11, so slots 3–9 pass both edge
  limits):
  - Landing on page 1 (`a = 0`): candidates 3, 6, 9, and all three pass. Slot 9
    works because 12 − 9 = 3 sections follow it.
  - Landing on page 2 at `a = 7`: candidates 7, 4, 10, and 1. Slot 4 is filled when
    page 1 loads. Slot 7 stays empty until then, and is filled together with slot 4.
    Slot 10 fails because only two sections follow it, and slot 1 fails because only
    one section comes before it.
- This replaces `midContentIndex` for chapters. Single-page chapters follow the same
  rule, so a long one gets more than today's single midpoint form. Articles
  (`StandalonePage`) keep `midContentIndex` unchanged. The constant (3) lives next to
  it in `lib/newsletter/placement.ts`.

### `NewsletterForm` instance keys.

Today the form builds its DOM id (`newsletter-form-${placement}`), its
`sourceFormInstance` (`${pathname}#${placement}`), and its confirmation match
(`SubscriptionActionDialog`, which looks up that id) from `placement` alone. Several
mid-content forms on one page would share an id, and confirming one would switch all
of them. The fix is a new `instance` prop (`mid-content-{b}`):

- the key drives the id, `sourceFormInstance`, and the event match;
- `placement` still decides behaviour (collapsible or not);
- the newsletter worker stores `source_form_instance` as an opaque string
  (`validate.ts`, `db.ts`), so it needs no change.

A confirmation link can bring a reader back to a page where that form's slot isn't
filled, because they arrived somewhere else. `SubscriptionActionDialog` already
handles a missing form (the lookup returns `false`), so this changes nothing about
how confirmation works.

## Client loader.

A client component, `ChapterPager`, wraps the page and owns the slots and the
newsletter portals:

```tsx
<ChapterPager chapter={…} page={2} pageCount={2} sectionCount={12} firstSection={7} pageUrls={[…]}>
  {/* server-rendered page 2 wrapper */}
</ChapterPager>
```

It keeps `loaded: { index, html }[]` in state and renders:
`prev slot → pages before → children → pages after → next slot`, then the portals.
Injected pages are React-owned `div`s with opaque `dangerouslySetInnerHTML`, so React
never reconciles against DOM it didn't render.

- **Server output (no JavaScript).** Slots render as `<nav>` placeholders with their
  links.
- **After hydration.** Each slot keeps its link and adds an `IntersectionObserver`
  sentinel with a generous `rootMargin`, such as 1–2 viewports.
- **Fetch.** `fetch(pageUrl)` → `DOMParser` → `[data-chapter-page]` → `innerHTML`.
  The fetched page's payload is never loaded, because only the fragment is used.
  The chapter body is all server components, so nothing in it needs hydration.
- **Append (down).** Add to `loaded`. The slot moves on, or disappears after the last
  page.
- **Prepend (up).** Record `document.documentElement.scrollHeight` before the commit
  and `scrollBy` the difference in a layout effect. The container gets
  `overflow-anchor: none`, so native scroll anchoring can't apply a second
  correction. Newsletter forms placed in the prepended page are part of the same
  measured change. Verify Safari in e2e.
- **One request at a time per direction.** A failed fetch leaves the link in place.
- **Math.** KaTeX renders on the server (`lib/utils/math.ts`), so fetched HTML
  already contains finished math.

### URL sync and analytics.

- An `IntersectionObserver` on the page wrappers picks the page that crosses a
  reference line near the top of the viewport.
- It calls `history.replaceState`, not `pushState`, so Back leaves the chapter.
- It sets `document.title` from the fetched page's `<title>`.
- **Each boundary crossing sends a GA4 `page_view`, as decided.** No new code is
  needed. In Next 15.5, `history.replaceState` updates `usePathname`, and
  `ConsentGate` already sends one `page_view` per pathname change.
- The consent pages and `docs/analytics-and-consent.md` describe what GA4 receives.
  Check them against the new behaviour: a scroll now sends a page view.

### In-chapter links.

A delegated click handler on the article catches links to a page of the same
chapter. If the target `id` is already in the DOM, it calls `scrollIntoView`,
updates the URL, and skips the navigation. Otherwise the browser follows the link as
a full load. Look up ids with `getElementById`, never `querySelector('#…')`, because
anchors contain dots
([anchor rule](../../content-site-and-static-generation.md#anchor-rule)).

### What doesn't survive injection.

- The section bodies (`ContentBlocks`, `EmbeddedEntity`, `blocks/*`) are server
  components. `DetailsBlock` needs checking to confirm it's native `<details>`.
- `next/link` anchors become plain `<a>`, so clicking one is a full navigation.
  That's acceptable.
- Newsletter forms are portals, covered above.
- `HighlightOnArrival` and `ArrivalMarker` run from the root layout on the landing
  page's hash. They only matter for the served page.

## Cross-references get the page number at build time.

Every chapter-anchor href is built from `chapterUrlOf(chapter) + '#' + anchor` in a
handful of places. Each one switches to the page URL of the section that holds the
anchor. An entity's page comes from its `EmbeddingContext`: its section's page, page
1 for the prologue, and the last page for the epilogue.

| where | what |
|---|---|
| `lib/content/graph.ts` `resolveRefHrefs` (~L2068, L2087, L2112) | `RefEntry.href` for entity, claim or term, and section targets |
| `lib/content/graph.ts` `sectionBacklinkRow` (~L1590) | backlink rows on KB pages that point to a section |
| `lib/content/graph.ts` rendered-anchor map (~L1954–1962) | the `validateAnchors` side, so it expects each anchor on its page URL |
| `components/kb/panels/ContextPanel.tsx` (~L70) | the context panel link from an entity page to its section |

`chapterUrlOf` in `graph.ts` duplicates `urlForChapter`. It gets replaced by the
pagination helpers rather than growing a page parameter of its own. Links to a
chapter as a whole (breadcrumbs, `BookIndex`, chapter nav, `chapter` refs,
structured data `@id`) keep pointing at page 1.

`scripts/check-anchors.mjs` needs no logic change. It already follows a fragment to
the target file and checks it against that file's ids, so it proves every internal
link carries the right page number.

## Per-page metadata.

- `generateMetadata` resolves `chapter` plus page, and passes `buildPageMeta` the new
  URL key and a `PageMetaNode` built from the page's own `meta`. Canonical,
  `og:url`, and `hreflang` point at the page itself. No page sets its canonical to
  page 1.
- Title and description come from the page `meta`, the same way the chapter `meta`
  works today (`pageTitleOf` in `lib/i18n/metadata.ts`). Validation guarantees
  pages after page 1 have both on a published chapter.
- `rel="prev"` and `rel="next"` go in `<head>` as `<link>` elements. The Next
  Metadata API has no field for them, so confirm in the export that React 19 hoists
  them. Google has said since 2019 that it doesn't use these, so they're cheap
  extras. The in-body links are what crawlers follow.
- Stub chapters are unchanged (`stubRobots`).

### Which chapter fields feed SEO, and which feed the page.

| field | rendered on the page | used for SEO |
|---|---|---|
| `title` (root) | the chapter `<h1>`, breadcrumbs, the book index, KB context and reference panels, backlink rows | only as a fallback: `pageTitleOf` = `meta.title ?? title` |
| `excerpt` (root) | the chapter card on the book index (`ContentRow`) | only as a fallback: description = `meta.description ?? excerpt ?? locale default` |
| `meta` (now per page) | nothing | `<title>`, meta description, and `og:*` (`buildPageMeta` in `lib/i18n/metadata.ts`), plus the `Chapter` name in KB structured data (below) |

So the page's `<title>`, description, and Open Graph tags come from `meta`, with
`title` and `excerpt` used only when a `meta` field is missing. Validation requires
`meta.title` and `meta.description` on pages after page 1 of a published chapter, so
the fallbacks only matter for page 1 of a chapter without meta, and all 27 have it.
`title` and `excerpt` keep describing the whole chapter, because everything that
displays them lists the chapter as a whole.

**The one catch is the knowledge-base structured data.** `chapterNode` in
`lib/content/structured-data.ts` names the `Chapter` stub on every entity page with
`pageTitleOf(chapter)`, so that it matches the chapter page's `<title>`. `@id` is
the page 1 URL. Once meta moves to pages, the stub has to take its name from
somewhere else. Two options were considered:

- **(a) page 1's `meta.title`.** This keeps today's rule, since the stub matches the
  `<title>` of the URL in its `@id`. But in a split chapter it names the whole
  chapter by page 1's topics, even on an entity page for something introduced on
  page 2.
- **(b) the root `title`** ("Alice és Bob komolyabb fegyverekhez nyúl"). It's the
  chapter's own name, and the same string its `<h1>` and breadcrumbs show. It doesn't
  depend on how the chapter is split. The cost: every `Chapter` stub is renamed
  (about 390 entity pages), and the `pageTitleOf` comment in `structured-data.ts`
  changes to say why chapters are the exception.

**Decided: (b).** A `Chapter` node describes the whole chapter, and only the root
`title` still does. `chapterNode` uses `chapter.title` in phase three, and the
comment above it explains why chapters are the exception to the `pageTitleOf` rule.
Books keep `pageTitleOf`, because a book page's meta still describes the whole book.
`check-structured-data.mjs` requires a `name` but doesn't compare it with `<title>`,
so it passes unchanged.

## Route and static params.

- `resolvePath`: a chapter path of length 5 with a numeric last segment where
  `2 ≤ n ≤ pageCount` resolves to `{ kind: 'chapter', book, chapter, page: n }`.
  Anything else returns `null`. Length 4 means `page: 1`.
- `generateStaticParams`: one extra entry for each page 2…N of each chapter.
- The `chapter` case in `LocalizedRoute` passes `page` to `ChapterPage`, which
  renders that page's slice inside `ChapterPager`.

## Sitemap, llms.txt, and structured data.

- `app/sitemap.ts`: add pages 2…N of each published chapter, with the chapter
  lastmod. Check that `split-sitemap.mjs` puts them in the chapter child sitemap.
- `llms.txt` and structured data reference chapters by the page 1 URL, which doesn't
  change. Confirm `check-structured-data.mjs` and `check-llms-txt.mjs` still pass.

## Version bump.

This ships as a minor release. `apps/website/package.json` `version` goes from
`2.3.2` to `2.4.0`, and that's the only place it's declared. The footer reads it
through `next.config.ts` or the `YOUPROOF_VERSION` override, and
`check-build-version.mjs` checks that it rendered. The bump lands in its own commit
in phase one.

## Tests and gates.

- **Unit.**
  - The loader reads both shapes during the transition and rejects every invalid
    case under [Validation](#validation-and-where-it-fails). `check-pages.mjs` in
    the content repo agrees with it on the same fixtures.
  - Every section maps to exactly one page. The prologue maps to page 1 and the
    epilogue to the last page.
  - The URL builder rejects page 0, and page 1 gives the bare chapter URL.
  - `resolvePath` rejects `/1`, `/0`, out-of-range pages, and non-numeric segments.
  - The newsletter placement rule, as a pure function of `(S, a, b)`: the lattice,
    both edge limits, and slot `a` staying empty until a section loads above it.
  - The payload rewrite on a fixture page: same pushes, same order, one hashed file,
    and a loud failure on an unexpected shape.
- **Postbuild, in this order:**
  1. every existing check, which still reads the payload from the HTML;
  2. `externalize-flight.mjs`;
  3. `check-flight.mjs`, which compares each page's external payload with its `.txt`;
  4. `check-page-size.mjs`.

  `check-anchors.mjs` covers link correctness. `compare-exports.mjs` diffs the export
  before and after each phase.
- **e2e (Playwright), new `flight.test.ts`:** the direct hydration contract listed
  under [Testing it](#testing-it-so-a-breaking-nextjs-change-shows-up-early). Every
  existing KB suite also runs against the rewritten export.
- **e2e (Playwright), new `chapter-pagination.test.ts`:**
  - no-JS: placeholders are real links, and each page stands alone.
  - Scrolling down appends the next page. Scrolling up from a deep landing prepends
    the previous page with no visible jump.
  - The URL and title follow the page in view, with no history entries added.
  - Newsletter forms appear only at slots the rule allows, never move, and have
    unique ids. Confirming one doesn't switch another.
  - An in-chapter link to a loaded page scrolls without reloading.
  - Deep-linking to `/…/2#anchor` lands on the anchor.
  - Keep the KB flake lessons in mind: frame-clock traces, and no fixed sleeps.
- **After deploy.** Re-run the Ahrefs audit. No page should be flagged.

## Docs to update.

Each phase updates the docs its change affects, in the same pull request.

- `docs/content-site-and-static-generation.md`:
  - replace the "`__next_f` script tags are expected" section with the external
    payload file, why it exists, and the four assumptions it checks (phase one);
  - add a chapter page row to the canonical URL table;
  - explain which page an anchor lives on;
  - describe the size gate and the known-oversize list (phase one);
  - in the structured-data section, say that the `Chapter` stub is named by the
    chapter's root `title` (phase three).
- `docs/quality-gates-and-artifacts.md`: the new postbuild checks and
  `flight.test.ts` (phase one).
- `docs/i18n-design.md` §2: add the URL shape.
- `docs/newsletter.md`: the mid-content placement rule and instance keys.
- `docs/analytics-and-consent.md` and the two consent policy pages: page views now
  fire at page boundaries while scrolling.
- The content repo `docs/content-model.md`: the `pages` field, page meta, and
  `check-pages.mjs`.

## Phases.

Each phase is one pull request, and ships on its own.

1. **Version bump and payload rewrite.**
   - Bump to `2.4.0`, in its own commit.
   - Rebuild `out/` from current content and run the full e2e suite as a baseline.
   - Add `externalize-flight.mjs`, `check-flight.mjs`, and `check-page-size.mjs` with
     the known-oversize list, their unit tests, and `flight.test.ts`.
   - Add a comment on the `next` line of the `pnpm-workspace.yaml` catalog that points
     at these checks.

   This alone clears eight of the ten flagged chapters.
2. **Loader and model.** The loader accepts both YAML shapes, and `ChapterNode.pages`
   and validation are added. The export shouldn't change.
3. **Pagination core.** The URL key, route, static params, per-page metadata, sitemap,
   page-qualified hrefs in the graph and ContextPanel, the `Chapter` structured-data
   name, and the `<nav>` placeholders as plain links. Readers get linked pages with no loader yet.
4. **Content migration.**
   - In the content repo, run the mechanical migration and add `check-pages.mjs`.
   - Update the editor.
   - Author the page breaks and page meta for the four chapters.
   - Empty the known-oversize list.
5. **Client loader.** `ChapterPager`: append, prepend with scroll compensation, URL
   and title sync, newsletter slots and portals, instance keys, and in-chapter link
   interception.
6. **Cleanup.** Drop the old YAML shape, delete the known-oversize list, finish the
   e2e suite, update the policy pages, and re-run the Ahrefs audit.

## To verify during implementation.

These are assumptions the plan relies on but that I haven't confirmed yet:

- the CDN cache and pruning rules for `_next/static/*` also apply to
  `_next/static/flight/`, a directory Next.js doesn't create (phase one);
- `check-analytics-build.mjs` doesn't read the inline payload (phase one);
- Google's 2 MB limit applies to each fetched resource on its own (phase one);
- React 19 hoists `rel="prev"` and `rel="next"` `<link>` elements into `<head>` in
  the export (phase three);
- `DetailsBlock` renders native `<details>`, so it still works as injected HTML
  (phase five);
- scroll compensation on prepend behaves the same in Safari (phase five).
