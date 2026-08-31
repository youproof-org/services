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
  - `SITE_ENV` — `staging` | `production`, controls the
    [noindex gate](#noindex-on-staging) **and** the
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

### `__next_f` script tags are expected (not a bug)

Generated pages contain many `<script>(self.__next_f=…).push(…)</script>` tags —
~10–14 on light pages, ~70 on a math-dense chapter. These are the App Router's
**RSC (Flight) hydration payload**, chunked into small `push()` calls; the count
scales with the serialized React tree, and math chapters serialize the
server-rendered KaTeX HTML (hundreds of spans) into that payload. It's inherent to
App Router static export — nothing in `next.config.ts` inflates it, hydration
needs it, and removing it isn't possible without leaving App Router. Investigated
under YP-122 item 9: **expected boilerplate, no action.**

## Content model fields

Chapter YAML files in the content repo carry two fields the pipeline depends on
(the website loader normalizes kebab → camel: `published`, `legacyPath`):

- **`published`** (bool, default `false` when absent) — whether the chapter is
  served as real content on `youproof.org`. On a deployed environment it also
  decides whether the knowledge-base entities that chapter embeds get pages of
  their own (see [knowledge-base pages](#knowledge-base-pages)).
- **`legacy-path`** (optional) — the chapter's old path on the `youproof.hu`
  domain.

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

| Case | Page generated |
| --- | --- |
| `published: true` | Normal chapter content. |
| `published: false` + `legacyPath` | `NotMigratedStub` — "not migrated yet", with a link to `https://youproof.hu{legacyPath}` (legacy host). |
| `published: false`, no `legacyPath` | `UnavailableStub` — generic "Sorry" not-found page (no legacy link). |
| Path with no YAML at all | Next.js `not-found.tsx` (generic Sorry) at build; a genuinely non-existent path with no object falls through to the [CDN/bare-404 case](cdn-and-r2.md#custom-404-limitation). |

This means **every referenced chapter/article needs a YAML file** (at minimum
`published: false` + `legacy-path` if applicable) so the export has something to
generate a stub from. Only genuinely non-existent paths (no YAML at all) fall
through to the CDN-level/bare-404 case.

The generic "Sorry" not-found page is also emitted as `404.html` and uploaded to
the content bucket so the CDN can reference it as a fallback object where the
plan tier allows (see [CDN & R2](cdn-and-r2.md#custom-404-limitation)).

## Noindex on staging

Search-engine indexing must be prevented on `staging.youproof.org`; production
is the only indexable environment. The `SITE_ENV` build var gates this, and the
gate **defaults to the indexable (production) behavior** so a missing or
non-`staging` value can never accidentally noindex production:

- `SITE_ENV=staging` → the root layout emits
  `<meta name="robots" content="noindex,nofollow">` **and** `app/robots.ts`
  emits a disallow-all `robots.txt` to `out/`.
- Default / `SITE_ENV=production` → an indexable `robots.txt` + sitemap;
  **never** emits noindex.

`/sitemap.xml` is a `<sitemapindex>` over per-type child sitemaps, split out of the
single exported `<urlset>` by a postbuild step — see
[i18n design §7](i18n-design.md#sitemap).
