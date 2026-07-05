# Cache rules for the youproof.org zone.
#
# A cache-settings ruleset (phase http_request_cache_settings) is a ZONE-LEVEL
# SINGLETON, so it lives in this shared root and covers both hostnames.
#
# This phase runs AFTER http_request_transform (transform.tf), so by the time
# these expressions evaluate the extensionless page paths have already been
# rewritten to `<path>.html`. The two rules below are mutually exclusive:
#
#   1. Static assets (css/js/images/fonts) -> long edge + browser TTL. These are
#      effectively immutable per deploy; a longer TTL keeps them at the edge.
#   2. HTML documents -> cached at the edge but revalidated by the browser, and
#      busted at deploy time via an explicit CDN purge (no content hashing, per
#      docs/cdn-and-r2.md). Short/zero browser TTL so a visitor always
#      revalidates while the edge serves the cached copy until the deploy purge.
#
# Cache-busting mechanism: deploy-time purge (see the deploy workflow), NOT
# content-hashed filenames — so HTML must not be pinned in browsers for long.
#
# TODO verify plan tier: the `matches` (regex) operator used for the asset
# extension match requires a Cloudflare plan with regex support (Pro/Business+).
# On a regex-free plan, replace the rule-1 expression with an
# `ends_with(...) or ends_with(...)` chain over the same extensions.
resource "cloudflare_ruleset" "cache" {
  zone_id     = cloudflare_zone.youproof_org.id
  name        = "youproof.org cache policy"
  description = "Long TTL for static assets; edge-cached + revalidated HTML (busted by deploy-time purge)"
  kind        = "zone"
  phase       = "http_request_cache_settings"

  rules = [
    {
      description = "static assets -> long edge + browser TTL"
      expression  = "http.request.uri.path matches \"\\\\.(css|js|mjs|jpg|jpeg|png|gif|svg|webp|avif|ico|woff|woff2|ttf|otf|eot|map)$\""
      action      = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 2592000 # 30 days at the edge
        }
        browser_ttl = {
          mode    = "override_origin"
          default = 86400 # 1 day in the browser
        }
      }
    },
    {
      description = "HTML documents -> edge cache + browser revalidation"
      # Matches the .html objects (page paths after the transform rewrite, plus
      # any directly-requested .html). Deploy-time purge is what invalidates it.
      expression = "ends_with(http.request.uri.path, \".html\")"
      action     = "set_cache_settings"
      action_parameters = {
        cache = true
        edge_ttl = {
          mode    = "override_origin"
          default = 3600 # 1 hour at the edge; deploy purge busts it immediately
        }
        browser_ttl = {
          # 0 => browser always revalidates, so a purge is reflected instantly
          # for returning visitors while the edge absorbs the load.
          mode    = "override_origin"
          default = 0
        }
      }
    },
  ]
}
