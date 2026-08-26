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
    [noindex gate](#noindex-on-staging).
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
  served as real content on `youproof.org`.
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

Parts and sections are **not** part of a public URL: a part is flattened out of
chapter paths and a section is a fragment on its item's page (see
[Anchor rule](#anchor-rule)). `legacy-path` is a chapter-level field, so it maps a
legacy `.hu` URL straight to the chapter's canonical `.org` path.

Knowledge-base entities (`definition`, `theorem`, `proof`, `remark`) have their own
URL shapes, nesting owned types under their owner and keeping namespaces out of the
path entirely — see [i18n design §4a](i18n-design.md#4a-addendum--knowledge-base-entities).
Those URLs are constructed and cross-referenced today; the **routes that would serve
them are not generated yet**, so the export currently contains no knowledge-base
pages.

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
