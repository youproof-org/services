# CDN & R2 (`youproof.org` zone)

The `youproof.org` site is served straight from a Cloudflare **R2 bucket**
through the CDN — there is **no Worker on this zone**. The generated static
export ([content site & static generation](content-site-and-static-generation.md))
is uploaded to the environment's content bucket at deploy time, and Cloudflare's
edge serves it via an R2 custom domain, applying zone-level transform and cache
rules. The zone-level rules live in the shared
[`zone/`](terraform-roots-and-layout.md#zone) root; the per-environment R2
resources live in the [`website/`](terraform-roots-and-layout.md#website) root.

## R2 buckets

Four buckets total, per environment × purpose (all in the EU jurisdiction,
matching the state bucket's `.eu.` endpoint):

| Bucket | Owner root | Purpose |
| --- | --- | --- |
| `youproof-staging-content` / `youproof-production-content` | `website/` (per env) | Generated `.html` pages + static assets, served publicly via the R2 custom domain. |
| `youproof-staging-test-artifacts` / `youproof-production-test-artifacts` | `website/` (per env) | Quality-gate JSON reports; not served publicly. See [quality gates](quality-gates-and-artifacts.md). |

## R2 custom domain (serving the content bucket)

The `website/` root binds the content bucket to the environment's public host
with a `cloudflare_r2_custom_domain` resource:

- production → `youproof.org`, staging → `staging.youproof.org`.
- Creating the resource makes Cloudflare **automatically provision the proxied
  CNAME DNS record** for that host (and the edge cert) — so the `website/` root
  does **not** create a separate `cloudflare_dns_record` for the site host (it would
  collide). See [DNS & TLS](dns-and-tls.md#youproof-org-zone).
- `min_tls = "1.2"`, `jurisdiction = "eu"` (matching the bound bucket).

## R2 object-key / URL-path mapping

The bucket's object keys mirror the public URL path, with a `.html` suffix:

- Public path → object key = path without the leading `/`, plus `.html`.
  - `/` → `index.html`
  - `/books/x/chapters/y` → `books/x/chapters/y.html`
- The generic not-found page is uploaded as `404.html`.

<a id="html-stripping"></a>
## `.html` stripping (Transform Rule)

Public URLs must **not** expose the `.html` extension, so a zone-level
**Transform Rule** (`http_request_transform` phase, in `zone/transform.tf`)
rewrites the request path at the edge to the corresponding object key before the
request reaches R2. A transform ruleset is a per-zone singleton, so it lives in
the shared `zone/` root and covers both hostnames automatically. Two
mutually-exclusive rules:

1. `path == "/"` → rewrite to `/index.html`.
2. `path != "/"`, not ending in `/`, and **no file extension** → rewrite to
   `path + ".html"`.

"No file extension" means the last path segment contains no `.`, so real assets
(`/styles/app.css`, `/img/logo.svg`) are left untouched and served directly from
R2. Detecting a dotted last segment cleanly uses the regex `matches` operator
(`\.[^/.]+$`).

> **Plan-tier note:** the `matches` (regex) operator requires a Cloudflare plan
> with regex support (Pro/Business+; not Free). On a regex-free plan, replace
> the extension check with an explicit `not (ends_with(path, ".css") or …)`
> chain over the known asset extensions (the regex-free style used in the
> www-redirect rule). The regex form is kept as the correct general form; see
> the `TODO verify plan tier` note in `transform.tf`.

## Cache rules

A zone-level **cache ruleset** (`http_request_cache_settings` phase, in
`zone/cache.tf`; also a per-zone singleton) runs **after** the transform
phase, so by the time it evaluates, extensionless page paths have already been
rewritten to `<path>.html`. Two mutually-exclusive rules:

1. **Static assets** (css/js/images/fonts, matched by extension) → long TTL: 30
   days at the edge, 1 day in the browser. Effectively immutable per deploy.
2. **HTML documents** (paths ending `.html`) → edge-cached (1 hour) but browser
   TTL `0`, so returning visitors always revalidate while the edge absorbs load.
   HTML is **busted at deploy time by an explicit CDN purge** — not content
   hashing.

> The same regex plan-tier caveat applies to the asset-extension match in rule 1.

## Deploy-time cache purge (cache busting)

The chosen cache-busting mechanism is an **automatic CDN cache invalidation at
deploy time**, not content-hashed filenames. After uploading `out/` to the
content bucket, the [deploy pipeline](deploy-pipeline.md) calls the Cloudflare
cache-purge API for the environment so the just-deployed content is visible
immediately. Because HTML has browser TTL `0`, returning visitors pick up the
purge on their next request.

<a id="custom-404-limitation"></a>
## Custom-404 limitation

The plan wants a generic "Sorry" object served for paths with no object in the
bucket. Because there is **no Worker** on this zone (the CDN serves R2 directly),
options for intercepting a bucket miss are limited:

- **Primary mechanism (no Terraform):** every referenced chapter/article has a
  YAML file, so the static export emits a real stub page at each such path
  (not-migrated / generic "Sorry"). Those stubs are objects in the bucket and
  are reachable at their extensionless paths via the transform rule — so the
  vast majority of "missing" pages resolve to a real, friendly page rather than
  a bare 404. See [stub behavior](content-site-and-static-generation.md#not-found--stub-behavior).
- **Genuinely non-existent paths** (no YAML, no object) fall through to R2's own
  404 for the missing key. A `404.html` object is uploaded to the bucket, but
  **R2 custom domains do not let you designate a custom error/fallback object
  without a Worker**, so that object is not automatically served for arbitrary
  misses on this setup. This is the accepted behavior; `zone/notfound.tf`
  documents where a Cloudflare **Custom Errors** ruleset (`serve_error`) would
  go if the account's plan tier exposes custom error responses for a proxied R2
  origin. Not blocking.
