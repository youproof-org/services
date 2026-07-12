# Dynamic-redirect rulesets for both zones (youproof.hu and youproof.org).
#
# youproof.hu: a single www->apex rule.
# youproof.org: the www->apex rule PLUS a `.html`->extensionless canonicalization
# rule (pages are only served at extensionless URLs; see the org ruleset below).
#
# A dynamic-redirect ruleset is a ZONE-LEVEL SINGLETON (one entrypoint per phase
# per zone), so each zone gets ONE ruleset here in the single-state zone root
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
# Two rules in the single dynamic-redirect ruleset (this phase is a per-zone
# singleton, so both rules live in one resource): the www->apex rule, plus a
# `.html`->extensionless canonicalization rule so pages are only served at their
# extensionless URL. This phase runs BEFORE http_request_transform, so the
# `.html` rule sees the client's ORIGINAL path (not the transform's internal
# `/foo` -> `/foo.html` rewrite) — no redirect/rewrite loop.
resource "cloudflare_ruleset" "www_redirect_org" {
  zone_id     = cloudflare_zone.youproof_org.id
  name        = "canonical URL redirects"
  description = "301 www.<host> to apex, and strip .html so pages serve only at extensionless URLs"
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
    },
    {
      description = "apex root '/' -> '/<default_locale>' (locale prefix entrypoint)"
      # The site serves every page under a locale prefix; the bare root has no
      # page. Redirect it to the default locale's homepage. This edge rule is the
      # seam to later swap for a geo/preference-cookie aware worker; for now it is
      # a single default-locale redirect (no Accept-Language / geo-IP logic). The
      # statically-exported out/index.html is the fallback for non-edge serving.
      #
      # 302 (TEMPORARY), unlike the 301 canonicalization rules above: the root's
      # target is a *current default*, not permanent. A 301 here would be cached
      # indefinitely by browsers and would prevent a future locale-negotiation
      # worker from ever running for return visitors. Per-page canonical + hreflang
      # + x-default already point search engines at /<locale>, so SEO is unaffected.
      expression = "http.request.uri.path eq \"/\""
      action     = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 302
          preserve_query_string = true
          target_url = {
            expression = "concat(\"https://\", http.host, \"/${var.default_locale}\")"
          }
        }
      }
    },
    {
      description = "strip .html -> extensionless canonical URL"
      # A directly-requested .html page URL (e.g. /books/x/chapters/y.html) is not
      # canonical; 301 it to the extensionless path. Regex-free (Free plan).
      expression = "ends_with(http.request.uri.path, \".html\")"
      action     = "redirect"
      action_parameters = {
        from_value = {
          status_code           = 301
          preserve_query_string = true
          target_url = {
            # substring(path, 0, -5) drops the trailing ".html" (5 bytes); keep the
            # same host over https.
            expression = "concat(\"https://\", http.host, substring(http.request.uri.path, 0, -5))"
          }
        }
      }
    }
  ]
}
