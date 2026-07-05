# Custom 404 ("Sorry" page) for youproof.org — decision & limitation note (no
# resources here).
#
# The plan wants a generic "Sorry" object served for paths that have no object in
# the R2 content bucket. On the youproof.org zone there is deliberately no Worker
# (the CDN serves the R2 bucket directly via an R2 custom domain, created in
# website/), which limits the options for intercepting a bucket miss:
#
#   * Primary mechanism (implemented elsewhere, no TF here): every referenced
#     chapter/article has a YAML file, so Next.js's static export emits a real
#     stub page at each such path (not-migrated / generic "Sorry"). Those stubs
#     ARE objects in the bucket and are reachable at their extensionless paths
#     via the transform rule (transform.tf). So the vast majority of "missing"
#     pages resolve to a real, friendly page rather than a bare 404.
#
#   * Genuinely non-existent paths (no YAML, no object) fall through to R2's own
#     404 for the missing key. A `404.html` object is uploaded to the bucket at
#     deploy time (see docs/cdn-and-r2.md "R2 object keys"), but R2 custom domains
#     do NOT let you designate a custom error/fallback object without a Worker, so
#     that object is not automatically served for arbitrary misses on this setup.
#
# Where a custom-error rule WOULD go if the plan tier allows it:
#   Cloudflare "Custom Errors" (a Ruleset in the `http_response_headers_transform`
#   / custom-error-response feature, and on some plans a `serve_error` action)
#   can serve a fixed asset or a fetched object for a given origin status. If
#   this account's plan exposes custom error responses for a proxied R2 origin,
#   add a ruleset here that serves the bucket's `404.html` on a 404 from origin.
#   TODO verify plan tier: custom error assets are gated by plan; on Free the
#   bare-R2-404 fallback above is the accepted behavior. Not blocking.
