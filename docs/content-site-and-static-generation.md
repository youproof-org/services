# Content site & static generation (`youproof.org`)

The `youproof.org` site (`apps/website`) is a Next.js **static export**: the
build produces a directory of static `.html` files and assets in `out/`, which
is uploaded to an R2 bucket and served through the CDN (see
[CDN & R2](cdn-and-r2.md)). There is no server runtime — no Worker on this zone.

## Static export configuration

- `next.config.ts`: `output: 'export'`, `images: { unoptimized: true }`, output
  directory `out/`.
- Build env vars:
  - `CONTENT_DIR` — path to the content repo's `content/` subdir (the same var
    the [worker manifest generator](migration-worker.md#the-migration-manifest-generated-from-content)
    reads).
  - `SITE_ENV` — `staging` | `production`, controls [what is
    indexable](#what-is-indexable) **and** the
    [knowledge-base page set](#knowledge-base-pages): unset (local dev) exports a
    page for every entity, `staging`/`production` only for those whose embedding
    chapter is published.
  - `NEXT_PUBLIC_GA_MEASUREMENT_ID` — GA4 measurement id for this environment's
    property, inlined into the bundle at build time. Empty disables analytics and
    the consent banner entirely (see [analytics & consent](analytics-and-consent.md)).
- The build runner needs **TeX Live** (`pdflatex` + `dvisvgm`) for figure
  compilation.
- Analytics never appears in the exported **HTML** — the measurement id and the
  consent components are inlined into the JS chunks, and no markup references
  `googletagmanager.com` (that is what makes "GA4 cannot load before consent"
  checkable, and `scripts/check-analytics-build.mjs` enforces it). Grepping `out/`
  for `gtag` will find nothing in the pages.

<a id="rsc-payload"></a>
### The RSC payload is served as an external file

Next.js inlines every App Router page's **RSC (Flight) hydration payload** as a run
of `<script>self.__next_f.push(…)</script>` tags after the footer. It scales with the
serialized React tree, and a math chapter serializes its server-rendered KaTeX HTML
into it, so it was most of every chapter file. Ahrefs flags a page whose HTML is over
2 MiB, on the reasoning that Googlebot reads only the first 2 MB of a file
([Googlebot docs](https://developers.google.com/search/docs/crawling-indexing/googlebot)).
Next 15.5 has no option to stop inlining the payload, so the postbuild
`scripts/externalize-flight.mjs` moves it out of every exported page:

```html
<!-- before -->
<script src="/_next/static/chunks/webpack-….js" id="_R_" async=""></script>
<script>(self.__next_f=self.__next_f||[]).push([0])</script>
<script>self.__next_f.push([1,"1:\"$Sreact.fragment\"\n…"])</script>
…
</body></html>

<!-- after -->
<script src="/_next/static/chunks/webpack-….js" id="_R_" async=""></script>
<script src="/_next/static/flight/<hash>.js"></script>
</body></html>
```

- **The file holds the same statements, byte for byte, in the same order**, one per
  line. Nothing is decoded or re-encoded; only the `<script>` wrappers change.
- **It's named by a hash of its content**, so a cached copy can never pair a new page
  with an old payload.
- **Why a classic script works.** The client feeds every entry pushed onto the global
  `self.__next_f` into the stream React hydrates from, and closes that stream at
  `DOMContentLoaded` (`next/dist/client/app-index.js`). A `<script src>` that isn't
  `async`, `defer`, or a module blocks the parser, so it runs before that event,
  exactly like the inline scripts it replaces. A `fetch` of the page's `.txt` would
  resolve too late.
- **The `.txt` files stay.** Next.js writes them beside the pages for client-side
  navigation, and nothing about that changes.
- On a local export, the rewrite took the total HTML from 148.3 MiB to 52.1 MiB.

**What the rewrite assumes, and how each assumption is checked.** It relies on how
Next.js emits the payload, so it checks the shape of every page and stops the build
with the page and the broken assumption named. It plans every page before writing
any, so a failure leaves the export untouched.

| assumption | checked by |
|---|---|
| exactly one `(self.__next_f=self.__next_f\|\|[]).push([0])` init script | `externalize-flight.mjs`: fails on zero or several |
| the pushes form one contiguous block ending at `</body></html>` | `externalize-flight.mjs`: fails on any other markup inside the block, or any `__next_f` before it |
| each push argument is a JSON array starting with a number | `externalize-flight.mjs`: parses every argument |
| the payload is complete: nothing is lost or reordered | `check-flight.mjs`: decodes each page's external file's `[1, …]` chunks and compares them with the page's `.txt` |

`check-flight.mjs` also checks that no inline `__next_f` script is left, and that each
page loads exactly one flight file, which exists and is named by its hash. `404.html`
is the one page Next.js writes no `.txt` for, so it gets every check except the
comparison. Any other page without a `.txt` fails. The shape rules and the decoder are
pure functions in `scripts/lib/flight.mjs`, unit-tested in `test/flight.test.mjs`,
and `e2e/flight.test.ts` checks in Chromium that the rewritten pages still hydrate.

**Order in `postbuild`.** `check-anchors.mjs` reads hrefs out of the inline payload,
and `check-deferred-panels.mjs` and `check-structured-data.mjs` strip `<script>`
elements to tell markup from payload. `check-analytics-build.mjs` scans each whole
`.html` file for `googletagmanager.com` and the banner class, which included the
inline payload. So every existing check runs first, then `externalize-flight.mjs`,
then `check-flight.mjs` and `check-page-size.mjs`.

**Re-running `postbuild` on an export it already rewrote fails.** The rewrite finds
no init script and says so. Rebuild with `pnpm build` instead, which writes a fresh
`out/`.

**On the CDN**, the flight files are ordinary `.js` assets. The zone's asset rules for
the transform and the cache match by extension, not by path (`asset_extensions` in
`infra/cloudflare/terraform/zone/locals.tf`), so `/_next/static/flight/` gets the
same long TTL as Next's own chunks ([cache rules](cdn-and-r2.md#cache-rules)).
`aws s3 sync --delete` in the deploy removes an earlier deploy's flight files, as it
does any object that's no longer in `out/`. The non-production `X-Robots-Tag` rule
matches by host, so it covers them too.

<a id="size-gate"></a>
### Size gate

`scripts/check-page-size.mjs` fails the build if any exported HTML page is over
**1,990,000 bytes** (`PAGE_SIZE_LIMIT` in `scripts/lib/page-size.mjs`), just under
the 2 MiB Ahrefs measures. It runs after the payload rewrite, so it measures what a
crawler downloads, and it reports each offending page with its size.

- **It covers every page**, not only chapters.
- **It measures HTML only.** The flight files aren't gated. Ahrefs flags HTML pages,
  and Google's docs say each resource referenced in the HTML is fetched separately,
  with its own 2 MB limit.
- **A known-oversize list allows the chapters that are still too large** until they're
  split into pages. `KNOWN_OVERSIZE` names the published ones. Each is reported as a
  warning, not an error.
  - A listed page that's under the limit, or missing from the export, fails the
    build, so the list can only shrink.
  - Any other oversize page fails the build.
- **`KNOWN_OVERSIZE_UNPUBLISHED` names unpublished chapters**, which only a local
  build renders in full (`stubKindFor` in `lib/content/stub.ts`). It applies only
  when `SITE_ENV` is neither `staging` nor `production`. On a deployed build, such a
  chapter is a stub, and publishing it before it's split fails the build.

## Content model fields

Chapter YAML files in the content repo carry three fields the pipeline depends on
(the website loader normalizes kebab → camel: `publishedAt`, `legacyPath`):

- **`published-at`** (optional, a quoted `'YYYY-MM-DD HH:MM:SS'` UTC string) — a
  chapter that has one is published (`ChapterNode.published`), and served as real
  content on `youproof.org`. On a deployed environment it also
  decides whether the knowledge-base entities that chapter embeds get pages of
  their own (see [knowledge-base pages](#knowledge-base-pages)).
- **`legacy-path`** (optional) — the chapter's old path on the `youproof.hu`
  domain.
- **`pages`** — the chapter's sections, grouped into pages, each with its own
  optional `meta` (`title`, `description`, `open-graph`). The loader
  (`loadChapter` in `lib/content/loader.ts`) still accepts the older shape, a flat
  `sections` list next to a chapter-level `meta`, and reads it as one page that
  carries that meta. The chapter route renders every page's sections at the
  chapter URL, with page 1's metadata (`chapterPageMetaNode` in
  `lib/content/chapter-pages.ts`).

<a id="chapter-pages"></a>
### Chapter pages

In the graph, `ChapterNode.pages` lists the pages in order, numbered from 1, and
each `SectionNode` points at its `page`. `chapter.sections` stays the flat list of
every page's sections, so section numbers, embed indices and figure indices are
chapter-global. Page 1 also holds the abstract, the prerequisite warning and the
prologue, and the last page holds the epilogue (`pageHolding`). An entity's
`EmbeddingContext.page` is the page its embed renders on.

The build fails when the graph loads, with an error naming the `chapter.yaml`, if:

- a section is listed on more than one page, or twice on one page;
- a section file in the chapter's directory is on no page;
- a page has no sections, or `pages` is empty;
- `sections` or a chapter-level `meta` sits next to `pages`;
- on a published chapter (one with `published-at`), a page after page 1 lacks
  `meta.title` or `meta.description`;
- a page after page 1 has an `open-graph.title` that doesn't end in its own page
  number, such as `(2. rész)` (the `chapterPagePart` label in
  `lib/i18n/locales.json`).

The rules are unit-tested in `test/chapter-pages.test.mjs`. "Published" here is the
content's own status, not what the environment renders. A local build renders drafts
in full, but a draft may still leave its later pages without meta. That keeps the rule a fact about the content alone, so a check in the
content repo can apply it the same way.

<a id="canonical-url-rule"></a>
## Canonical URL rule

One rule maps content-model position to public path — used by both the static
export routes and the [worker manifest generator](migration-worker.md), so they
always agree. Every page is **locale-prefixed**, and every segment after the locale
is a **`slug`**, never a `name`; the container segments (`konyvek`, `fejezetek`, …)
are localized data in `lib/i18n/locales.json`. `lib/i18n/url.ts` is the single
constructor — nothing string-concatenates a path.

| content-model position | public path |
|---|---|
| home | `/{locale}` |
| book | `/{locale}/{book}/{book-slug}` |
| chapter | `/{locale}/{book}/{book-slug}/{chapter}/{chapter-slug}` |
| article / newsletter / landing | `/{locale}/{container}/{slug}` |
| page | `/{locale}/{slug}` — at the locale root, so a page slug may not collide with a container segment |
| listing pages | `/{locale}/{container}` |
| knowledge-base root | `/{locale}/tudasbazis` |
| definition / theorem index | `/{locale}/tudasbazis/{definiciok\|tetelek}` |
| glossary | `/{locale}/tudasbazis/fogalmak` |
| definition, theorem | `/{locale}/tudasbazis/{definiciok\|tetelek}/{slug}` — flat, no namespace |
| proof | `/{locale}/tudasbazis/tetelek/{theorem-slug}/bizonyitasok/{slug}` |
| remark | `…/{owner-path}/megjegyzesek/{slug}` — under its definition, theorem or proof |

Parts and sections are **not** part of a public URL: a part is flattened out of
chapter paths and a section is a fragment on its item's page (see
[Anchor rule](#anchor-rule)). `legacy-path` is a chapter-level field, so it maps a
legacy `.hu` URL straight to the chapter's canonical `.org` path.

Knowledge-base entities (`definition`, `theorem`, `proof`, `remark`) nest owned
types under their owner and keep namespaces out of the path entirely — a node's URL
must survive a namespace reorganization, which is why definitions and theorems are
flat. See [i18n design §4a](i18n-design.md#4a-addendum--knowledge-base-entities) for
the reasoning and [§2](i18n-design.md#2-url-shape-generalized) for the full shape
list.

<a id="knowledge-base-pages"></a>
### Knowledge-base pages, and which entities get one

Every knowledge-base entity is *also* rendered inline inside a chapter, via
`embed`/`recall` blocks, so it has two addresses: the in-chapter anchor and its own
page. Which one a cross-reference resolves to depends on the **rendering context**,
not on the target, and both are resolved at build time (`RefEntry.href` /
`RefEntry.kbHref`).

An entity gets a page of its own under two conditions, and `kbPageExists` in
`lib/content/graph.ts` is the one place they live — `generateStaticParams`, the two
type indexes, the glossary, the backlink index, the ownership-chain links and the
sitemap all ask it, because a disagreement would mean an internally generated link
that works locally and 404s on staging:

1. the entity is **embedded in a chapter** — one rendered nowhere in the narrative
   has no context to show and nothing linking to it;
2. on `staging`/`production`, that **chapter is published**. Locally the gate is
   off, so drafts are previewable — the same environment switch the chapter stubs
   already use.

The consequence is a deliberate divergence in page sets, which is why the gate is
centralized rather than repeated:

| build | HTML pages | of which knowledge-base | entity pages |
|---|---|---|---|
| local dev (`SITE_ENV` unset) | 587 | 541 | 537 |
| `staging` / `production` | 439 | 393 | 389 |

The 46 pages that are not knowledge-base pages are the same in both. The 4
knowledge-base pages that are not entity pages are the root, the definition and
theorem indexes, and the glossary.

Three layers keep the divergence from producing dead links. Where a link is
*optional* — a backlink row, an ownership-chain link — the gate simply drops it, so
a page never advertises a page this build does not have. Where it is a
**cross-reference**, dropping it would silently lose an authored citation, so
`validateKbLinks` throws: every resolved knowledge-base href must land on a
generated page or the build fails. The postbuild `check-anchors.mjs` then resolves
the internal fragment links against the exported HTML, and the live crawl on staging
is the last layer — it is the only one that sees whole-path links, which
`check-anchors` does not validate (see
[quality gates](quality-gates-and-artifacts.md)).

### What an entity page serves in its markup, and what it does not

Anything a crawler should follow is in the served HTML, with one exception: an
inbound-reference list. The three panel contents that are such a list — `incoming`
(the whole entity), `term` (one selected term) and `claim` (one selected claim) —
are still built on the server and still travel in the RSC payload, but they are held
out of the HTML pass until the reader opens the panel
(`components/kb/panels/DeferredPanelContent.tsx`, wired in
`components/kb/Panel.tsx`; `DEFERRED_PANEL_KINDS` in
`components/kb/KbEntityPage.tsx` is the one place that says which contents those
are). They are the transpose of edges the citing pages already state in their own
markup, so serving them here repeats what a crawler can already read, at length: on
the busiest entity page they were most of the document. Everything else is served as
it always was — the body, the ownership chain, the `context` panel, the `reference`
panels, the indexes, the glossary, and every section's own shell, heading and data
attributes. Two consequences follow. A reader with no JavaScript loses the three
lists and is given one sentence saying so in the `incoming` section, rather than the
same sentence under every empty section (`KbPanelSection.noJsNote` and `noJsCss` in
`components/kb/Panel.tsx`). And the rows have changed channel rather than left the
export, so both channels are gated: `scripts/check-deferred-panels.mjs` holds the
markup to this rule, and `scripts/check-anchors.mjs` reads hrefs out of the payload
as well as the markup, which is what keeps the deferred rows' fragment targets
checked.

### The structured data a knowledge-base page carries

What the markup states in Hungarian prose and CSS classes, every knowledge-base page
also states in a form that needs no inference: one `application/ld+json` block,
holding a single `@graph` of nodes whose `@id`s are the canonical URLs of the things
they describe (`lib/content/structured-data.ts` builds it,
`components/kb/StructuredData.tsx` renders it, and a browser neither executes nor
draws it). An entity page describes itself as a `WebPage` whose main entity is a
`CreativeWork` — carrying the Wikidata concept URI for "theorem", "proof" or
"mathematical definition" as its `additionalType`, because schema.org has no type for
any of them — plus its `BreadcrumbList`, `Chapter` and `Book` stubs for the place in
the narrative it was lifted from, and a `DefinedTerm` for each term it introduces. The
four index pages are `CollectionPage`s: the definition and theorem indexes over an
`ItemList` that is named and counted but whose members are not enumerated, the
glossary over the `DefinedTermSet` those terms belong to, and the knowledge-base root
over nothing but its trail. The locale root carries the two site-scope nodes,
`Organization` and `WebSite`, that every other page's `isPartOf` points at. That is 542
blocks in a full export: 537 entity pages, the 4 index pages, and the locale root.

Two rules govern what may go in. It is **derived, never authored** — every string
comes from the graph through the same helpers the visible page uses, so no content
file will ever grow a `jsonld:` field and the block cannot disagree with the page it
sits on. And it states **outgoing edges only**: no page declares what cites it, for
the same reason the inbound lists are held out of the markup above. The whole graph is
still recoverable in both directions by reading the pages, and the busiest page's
block stays a couple of kilobytes instead of a couple of hundred.
`scripts/check-structured-data.mjs` holds the export to both — it parses every block,
requires exactly one per page that serves the entity panel, requires each `@id` to be
declared once, resolves every address on our own origin against the files the export
actually contains, and rejects an edge the page's own markup does not already make,
which is what an inbound reference would be.

`llms.txt` is the other machine-facing artefact of this kind and works the same way: a
short curated map of the site written from the graph at prebuild by
`scripts/gen-llms-txt.mjs`, shipped as an ordinary file in `public/`, and checked
after the build by `scripts/check-llms-txt.mjs` — every link resolves in the export
and every count in it is re-derived from the graph, because a generated file whose
generator stopped running looks exactly like one that is current.

`app/robots.ts` allows the whole site on production and singles out nothing. The
per-page `*.txt` RSC payloads — a second complete copy of every page's prose, 59 MiB
in the export — were disallowed for a while on duplicate-content grounds, and are not
any more. Nothing publishes their URLs: no `<a>`, no `<link rel="prefetch">`, no
sitemap entry, not even a literal in the framework JS, which appends `.txt` to a
pathname at navigation time. So the rule guarded a crawl that needs the client router
driven or the path guessed, while `/*.txt` also matched `/robots.txt` and left the file
disallowing itself. Should payload indexing ever show up in a real report,
`X-Robots-Tag: noindex` on `*.txt` from the response-header ruleset in
[`../infra/cloudflare/terraform/zone/response-headers.tf`](../infra/cloudflare/terraform/zone/response-headers.tf)
is the tool for it — it stops indexing without blocking access.

<a id="anchor-rule"></a>
## Anchor rule

The companion of the canonical URL rule, for everything that has an address but no
page of its own: a **part**, a **section**, a **claim**, a **terms entry**, and a
knowledge-base entity rendered inside a chapter rather than on its own page.

An anchor is a dotted path of `{localized-container}.{slug}` steps, taken
**relative to the page it is rendered on** — except that a knowledge-base entity is
always rooted at its own type container, exactly as its URL is, because its address
must not depend on where it happens to be embedded.

| page | anchors it emits |
|---|---|
| book index | `reszek.{part}` |
| chapter / standalone item | `szakaszok.{section}`; per embedded entity `definiciok.{d}`, `tetelek.{t}`, `tetelek.{t}.bizonyitasok.{p}`, `…​.megjegyzesek.{r}`, each optionally followed by `.fogalmak.{term}` or `.allitasok.{claim}` |
| knowledge-base entity page | `fogalmak.{term}`, `allitasok.{claim}` |

Both halves are localized: the container segments come from the same
`locales.json` `containers` dictionary the URL segments come from, and the key is
the node's `slug`. A fragment is URL text a reader sees and copies, so it reads in
the page's language.

`.` is the separator, which is why no `name` or `slug` may contain one — see
[i18n design §9](i18n-design.md#9-identifier-rules--names-and-slugs). A `.` in an
HTML `id` is valid and needs no URL encoding, but it *is* a class separator in a CSS
selector: `getElementById`, `:target` and `[id="…"]` are fine,
`querySelector('#' + id)` is not.

The anchor builders live in `lib/content/urls.ts` and the localized segments in
`lib/i18n/locales.json` — the same dictionary the URL segments come from, so an
anchor segment and a URL segment for the same concept cannot drift apart. The
cross-reference targets in the content YAML use the identical path shape with
canonical English segments and `name` keys instead; the content repo's
`docs/content-model.md` specifies that grammar for authors.

## Not-found & stub behavior

Migrated chapters can link to chapters that aren't migrated yet. To avoid hard
404s on internal links, `generateStaticParams` enumerates **all** chapters
(published or not), so every referenced chapter path resolves to a real static
page. Behavior by case:

| Case | Page generated | Robots directive on production |
| --- | --- | --- |
| `published: true` | Normal chapter content. | none (indexable) |
| `published: false` + `legacyPath` | `NotMigratedStub` — "not migrated yet", with a link to `https://youproof.hu{legacyPath}` (legacy host). | `noindex, follow` |
| `published: false`, no `legacyPath` | `UnavailableStub` — generic "Sorry" not-found page (no legacy link). | `noindex, nofollow` |
| Path with no YAML at all | Next.js `not-found.tsx` (generic Sorry) at build; a genuinely non-existent path with no object falls through to the [CDN/bare-404 case](cdn-and-r2.md#custom-404-limitation). | `noindex, nofollow` |

The two container-root dead ends — `/{locale}/konyvek` and `/{locale}/landing`, which
have no directory page to serve — render `UnavailableStub` too, and carry its directive.

This means **every referenced chapter/article needs a YAML file** (at minimum
`published: false` + `legacy-path` if applicable) so the export has something to
generate a stub from. Only genuinely non-existent paths (no YAML at all) fall
through to the CDN-level/bare-404 case.

The generic "Sorry" not-found page is also emitted as `404.html` and uploaded to
the content bucket so the CDN can reference it as a fallback object where the
plan tier allows (see [CDN & R2](cdn-and-r2.md#custom-404-limitation)).

## What is indexable

Production is the only indexable environment, and on production the stub pages are
the only pages held out of the index. Both halves are gated by the `SITE_ENV` build
var, read at build time and baked into the static export.

### Off production — nothing is indexable

`SITE_ENV` is checked for the exact value `production`, so staging, a preview, and an
unset or misspelled value all take this branch. That is the fail-safe direction: a
mistake in the variable noindexes a site that should have been indexable, which is
recoverable, rather than exposing one that should not have been.

- The root layout emits `<meta name="robots" content="noindex, nofollow">` on **every**
  page.
- `app/robots.ts` emits a disallow-all `robots.txt`.
- A zone response-header rule adds `X-Robots-Tag: noindex, nofollow` on every non-apex
  `.org` host, covering the asset types that cannot carry a meta tag — see
  [`../infra/cloudflare/terraform/zone/response-headers.tf`](../infra/cloudflare/terraform/zone/response-headers.tf).

Three layers, because they fail differently: `robots.txt` stops a crawler that reads
it, the meta tag stops the one that crawled anyway, and the header covers what has no
`<head>`.

### On production — the stubs, and only the stubs

`robots.txt` is `Allow: /` with a `Sitemap:` line, no page-level directive is emitted,
and the [stub pages](#not-found--stub-behavior) carry one apiece:

| Page | Directive | Why |
| --- | --- | --- |
| `not-migrated` stub | `noindex, follow` | The page has no content of its own to index, but its one link goes to the legacy `.hu` page that does — and production keeps that page indexable (`SEO_NOINDEX="false"` on the migration worker), so `follow` is what keeps the content discoverable. |
| `unavailable` stub | `noindex, nofollow` | A dead end with nothing behind it. |
| everything else | none | Indexable. |

**`robots.txt` and the meta tag are different layers, not alternatives.**
`robots.txt` governs crawling, the meta tag governs indexing, and the second only
takes effect if the first permitted the fetch. A URL disallowed in `robots.txt` can
still be indexed from inbound links alone — Search Console reports it as "indexed,
though blocked by `robots.txt`" — and the `noindex` on it is never read. So
`Allow: /` on production is not in tension with noindexing the stubs; it is the
precondition for it. Disallowing those paths instead would leave them indexed
indefinitely.

`noindex` also only takes effect on a recrawl, so a page already in the index leaves
it over days to weeks. Search Console's **Removals** tool gives a temporary hide if
that is too slow.

The rule lives in `stubRobots` in `lib/i18n/metadata.ts`, and which stub a page renders
in `stubKindFor` in `lib/content/stub.ts` — one definition, read by both the routes that
render the stub and the `generateMetadata` that describes it. `scripts/check-robots-meta.mjs`
gates the result in the built export on every build.

`/sitemap.xml` is a `<sitemapindex>` over per-type child sitemaps, split out of the
single exported `<urlset>` by a postbuild step — see
[i18n design §7](i18n-design.md#sitemap).
