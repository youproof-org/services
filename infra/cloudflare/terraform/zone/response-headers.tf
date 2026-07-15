# `X-Robots-Tag: noindex` on every NON-PRODUCTION .org host.
#
# Unlike youproof.hu, the .org content site has NO Worker (R2 -> CDN direct;
# see zone.tf), so noindex for NON-HTML responses — assets like images, PDFs,
# the sitemap, etc., which can't carry a `<meta name="robots">` tag — is enforced
# here, at the edge, with a response-header transform rule. HTML pages on staging
# are already noindexed by the static site's meta + robots.txt gate (SITE_ENV);
# this rule covers everything the host serves, asset types included.
#
# FAIL-SAFE posture (mirrors the migration worker's seo_noindex default): rather
# than naming the staging host, we noindex EVERY host on the .org zone EXCEPT the
# production apex. The zone spans all *.youproof.org hosts, so "not the apex"
# means staging.youproof.org, www.youproof.org (which only 301s -> apex, so the
# header is harmless there), and ANY future non-production subdomain — all
# noindexed by default. Only the exact production apex is indexable (sends no
# X-Robots-Tag). A new preview/staging host therefore can never accidentally leak
# into search indexes.
#
# The production host is derived from the managed zone's own name (no hardcoded
# hostname). Host equality needs no regex, so it is Free-plan compatible (the
# `matches` regex operator is not; see the note in transform.tf / locals.tf).
#
# A response-header transform ruleset (phase http_response_headers_transform) is
# a ZONE-LEVEL SINGLETON (one entrypoint per phase per zone), so it lives in this
# shared zone root.
resource "cloudflare_ruleset" "org_nonprod_noindex" {
  zone_id     = cloudflare_zone.youproof_org.id
  name        = "X-Robots-Tag noindex on non-production .org hosts"
  description = "Serve noindex,nofollow on every .org host except the production apex (assets included)"
  kind        = "zone"
  phase       = "http_response_headers_transform"

  rules = [
    {
      description = "non-production .org host -> X-Robots-Tag: noindex, nofollow"
      expression  = "http.host != \"${cloudflare_zone.youproof_org.name}\""
      action      = "rewrite"
      action_parameters = {
        headers = {
          "X-Robots-Tag" = {
            operation = "set"
            value     = "noindex, nofollow"
          }
        }
      }
    },
  ]
}
