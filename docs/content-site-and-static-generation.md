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
- The build runner needs **TeX Live** (`pdflatex` + `dvisvgm`) for figure
  compilation.

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
always agree:

- Home → `/`
- Book → `/books/{book}` where `{book}` is the book's `name` field.
- Chapter → `/books/{book}/chapters/{chapter}` where `{chapter}` is the
  chapter's `name` field. (`name` = folder/file basename with the leading `NN-`
  numeric prefix stripped.)
- Parts and sections are **not** part of the public URL — the chapter page is
  the deepest routed page. `legacy-path` is a chapter-level field, so it maps a
  legacy `.hu` URL straight to the chapter's canonical `.org` path.

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
