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
2. `path != "/"`, not ending in `/`, and **not ending in a known extension**
   (any of `zone/locals.tf`'s `asset_extensions`, or `.html`) → rewrite to
   `path + ".html"`.

So real assets (`/styles/app.css`, `/img/logo.svg`) are left untouched and served
directly from R2, while extensionless page paths get `.html` appended for the
origin fetch.

### Pages serve only at extensionless URLs (`.html` → 301)

Pages must be reachable at exactly one canonical URL — the extensionless one. A
directly-requested `.html` page URL (e.g. `/books/x/chapters/y.html`) is **301
redirected** to its extensionless path by a rule in the zone's dynamic-redirect
ruleset (`zone/redirects.tf`). That phase (`http_request_dynamic_redirect`) runs
**before** `http_request_transform`, so the rule matches the client's original
path and doesn't loop with the extensionless→`.html` rewrite above.

> A *true 404* for `.html` isn't cleanly achievable on the Free plan without a
> Worker (custom error status codes are Enterprise-only). A 301 to the canonical
> URL is the Free-compatible choice and is SEO-friendly (consolidates any stray
> `.html` link) — chosen over uploading pages under extensionless R2 keys (which
> would break `aws s3 sync`'s extension-based content-type inference).

> **Free-plan / no-regex note:** the extension check is written with
> `ends_with()` over an **enumerated** set of extensions (`zone/locals.tf`),
> **not** a regex. Cloudflare's regex `matches` operator is Business/Enterprise
> only (not available on Free or Pro), and this account is on the **Free** plan.
> Trade-off: it recognizes only the listed extensions, not "any extension" — fine
> for a Next.js static export (finite, known file types; pages are extensionless),
> but `local.asset_extensions` must be kept in sync with what the export emits.

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

> Rule 1's asset-extension match uses the same regex-free `ends_with()` set from
> `zone/locals.tf` (`local.asset_ext_match`) as the transform rule — see the
> Free-plan note above. Rule 2's `.html` match is a plain `ends_with` (any plan).

## Deploy-time cache purge (cache busting)

The chosen cache-busting mechanism is an **automatic CDN cache invalidation at
deploy time**, not content-hashed filenames. After uploading `out/` to the
content bucket, the [deploy pipeline](deploy-pipeline.md) calls the Cloudflare
cache-purge API so the just-deployed content is visible immediately. Because HTML
has browser TTL `0`, returning visitors pick up the purge on their next request.

The purge is **scoped to the environment's hostname** (`hosts: ["youproof.org"]`
or `["staging.youproof.org"]`), not `purge_everything` — staging and production
share one zone, so a full purge would needlessly wipe the other environment's
edge cache. Purge-by-hostname is available on all Cloudflare plans (since
2025-04). The zone id for the purge call comes from the `website` root's
`org_zone_id` output (sourced from the shared zone root's remote state), so no
separate GitHub variable is needed.

<a id="cache-pruning-validation"></a>
## Cache-pruning validation

When content is **removed, renamed, or updated in place**, the old bytes must stop
being served. There is no Workers KV and no content hashing except Next's own
`_next/static/*` bundles; everything else relies on two fail-closed deploy steps —
`aws s3 sync out/ … --delete` (reconciles the bucket to `out/`) and a
hostname-scoped `purge_cache` (clears the edge) — plus the HTML browser-TTL of `0`.

### Behaviour by change type

| Change | Origin (bucket) | Edge | Browser |
| --- | --- | --- | --- |
| **Removed / renamed path** | object deleted by `--delete` | evicted by purge | HTML TTL 0 → gone next request (bare [404](#custom-404-limitation), or 301 if a redirect rule exists) |
| **Updated HTML page** (same URL) | overwritten | evicted by purge | TTL 0 → fresh next request |
| **Updated hashed asset** (`_next/static/*` js/css) | new filename; old orphan removed by `--delete` | new URL, never stale | new URL → always fresh |
| **Updated stable-named asset** (images/figures/fonts under `/content`, `/assets`) | overwritten (same filename) | evicted by purge → fresh at edge | **1-day browser TTL** → a returning visitor may see the old copy for up to 24h |

The last row is the one staleness window: non-hashed assets keep their URL across
updates, and their 1-day browser cache ([Cache rules](#cache-rules)) is not cleared
by the edge purge. New visitors and the edge get the update immediately; only
returning visitors within 24h keep the old copy. To force an instant update for
everyone, change the filename (or add a `?v=` query) so it becomes a new URL — the
same effect Next's hashing gives its bundles.

### Automated vs. manual validation

- **Automated (already in place):** `--delete` and the purge are both fail-closed
  (either erroring fails the deploy), and the post-deploy
  [quality gate](quality-gates-and-artifacts.md) crawls the live host and fails on
  dead links / missing assets / unresolved manifest targets — so unreachable stale
  content is caught. No new check is needed for these.
- **Manual only (timing-sensitive — a CI assertion would be flaky):** confirming a
  *specific* pruned URL is gone from the edge, and the 24h stale-asset window above.

### Manual check (after a deploy that removes / renames / updates content)

The `--delete` step's log lists exactly which object keys were pruned. Use
`staging.youproof.org` for staging.

```sh
# Removed/renamed path — expect non-200 (or 301):
curl -sS -o /dev/null -w '%{http_code}\n' https://youproof.org/<old-path>
# Updated page/asset — edge served the new deploy (MISS/EXPIRED + small age), new body:
curl -sSI https://youproof.org/<changed-url> | grep -iE 'cf-cache-status|^age|cache-control'
```

> **Optional (proposal, not implemented):** capture the `--delete` output to log
> pruned keys per deploy for auditability. Deferred — it touches the deploy
> workflow on the eve of the first production release, and the fail-closed steps +
> crawler already cover the load-bearing cases.

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
  misses on this setup. This is the accepted behavior. If the account's plan tier
  ever exposes custom error responses for a proxied R2 origin, a Cloudflare
  **Custom Errors** ruleset (`serve_error`) added to the `zone/` root could serve
  the bucket's `404.html` on an origin 404. Not blocking.
