# www -> apex 301 redirect for both zones (youproof.hu and youproof.org).
#
# A dynamic-redirect ruleset is a ZONE-LEVEL SINGLETON (one entrypoint per phase
# per zone), so each zone gets its own ruleset here in the single-state zone root
# rather than per environment.
#
# A SINGLE generic rule per zone covers every environment: it matches any host
# beginning with "www." and redirects to the same host without that prefix, over
# https, preserving the path (and query, via preserve_query_string). So it needs
# NO hardcoded domains — e.g. `www.youproof.hu` -> `https://youproof.hu`,
# `www.staging.youproof.org` -> `https://staging.youproof.org`, all fall out of
# the one rule. The per-environment `www.<domain>` records (worker/website roots)
# are what make the rule reachable; the rule is dormant for hosts that don't exist.
#
# Uses only concat()/substring() (no regex), so it works on all Cloudflare plans
# (regex functions like regex_replace require Business+).

# --- youproof.hu ---
resource "cloudflare_ruleset" "www_redirect" {
  zone_id     = cloudflare_zone.youproof_hu.id
  name        = "www to apex redirect"
  description = "301 any www.<host> to its https://<host> equivalent, preserving path and query"
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    {
      description = "www.<host> -> https://<host> (strip leading www.)"
      expression  = "starts_with(http.host, \"www.\")"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            # substring(http.host, 4) drops the leading "www." (4 bytes); prepend
            # https:// and append the original path.
            expression = "concat(\"https://\", substring(http.host, 4), http.request.uri.path)"
          }
        }
      }
    }
  ]
}

# --- youproof.org ---
resource "cloudflare_ruleset" "www_redirect_org" {
  zone_id     = cloudflare_zone.youproof_org.id
  name        = "www to apex redirect"
  description = "301 any www.<host> to its https://<host> equivalent, preserving path and query"
  kind        = "zone"
  phase       = "http_request_dynamic_redirect"

  rules = [
    {
      description = "www.<host> -> https://<host> (strip leading www.)"
      expression  = "starts_with(http.host, \"www.\")"
      action      = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            # substring(http.host, 4) drops the leading "www." (4 bytes); prepend
            # https:// and append the original path.
            expression = "concat(\"https://\", substring(http.host, 4), http.request.uri.path)"
          }
        }
      }
    }
  ]
}
