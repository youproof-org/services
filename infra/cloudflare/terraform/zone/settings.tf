# Zone-level settings for both zones owned by this root (youproof.hu and
# youproof.org). The two zones' settings are identical in shape; each just points
# at its own zone_id.

# --- youproof.hu ---

# Force HTTP -> HTTPS for the whole zone. Cloudflare replies to any http:// request
# for a proxied hostname with a 301 to the https:// equivalent, at the edge, before
# the Worker or the www redirect ruleset runs. This covers every proxied host
# uniformly — apex `youproof.hu`, `www.youproof.hu`, `staging.youproof.hu`,
# `www.staging.youproof.hu` — so no scheme handling is needed in the Worker.
#
# (Gray-cloud `legacy.*` hosts are DNS-only, so Cloudflare is not in their path and
# this setting does not apply to them — the Worker always calls them over HTTPS
# regardless, and direct http->https there would be Rackhost's concern.)
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = cloudflare_zone.youproof_hu.id
  setting_id = "always_use_https"
  value      = "on"
}

# HSTS (Strict-Transport-Security) — tells browsers to only ever reach the host
# over HTTPS, protecting against downgrade/SSL-strip attacks.
#
# include_subdomains is deliberately FALSE: the free Universal SSL cert only
# covers youproof.hu + *.youproof.hu (one label), so www.staging.youproof.hu has
# no valid edge cert. With include_subdomains = true, HSTS would make every
# subdomain HTTPS-only with no browser click-through — turning that cert gap into
# a hard block. Scoping HSTS to the apex hardens youproof.hu without that risk.
# Revisit include_subdomains only once every subdomain has a valid cert (ACM /
# Total TLS). preload is FALSE too — preloading is effectively irreversible and
# implies include_subdomains.
resource "cloudflare_zone_setting" "security_header" {
  zone_id    = cloudflare_zone.youproof_hu.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000 # 1 year (recommended production value)
      include_subdomains = false
      preload            = false
      nosniff            = false
    }
  }
}

# --- youproof.org ---

# Force HTTP -> HTTPS for the whole zone. Cloudflare replies to any http:// request
# for a proxied hostname with a 301 to the https:// equivalent, at the edge, before
# the cache/transform rulesets run. This covers every proxied host uniformly —
# apex `youproof.org`, `www.youproof.org`, `staging.youproof.org`,
# `www.staging.youproof.org`.
resource "cloudflare_zone_setting" "always_use_https_org" {
  zone_id    = cloudflare_zone.youproof_org.id
  setting_id = "always_use_https"
  value      = "on"
}

# HSTS (Strict-Transport-Security) — tells browsers to only ever reach the host
# over HTTPS, protecting against downgrade/SSL-strip attacks.
#
# include_subdomains is deliberately FALSE: the free Universal SSL cert only
# covers youproof.org + *.youproof.org (one label), so www.staging.youproof.org
# has no valid edge cert. With include_subdomains = true, HSTS would make every
# subdomain HTTPS-only with no browser click-through — turning that cert gap into
# a hard block. Scoping HSTS to the apex hardens youproof.org without that risk.
# Revisit include_subdomains only once every subdomain has a valid cert (ACM /
# Total TLS). preload is FALSE too — preloading is effectively irreversible and
# implies include_subdomains. (Same rationale as the youproof.hu zone.)
resource "cloudflare_zone_setting" "security_header_org" {
  zone_id    = cloudflare_zone.youproof_org.id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000 # 1 year (recommended production value)
      include_subdomains = false
      preload            = false
      nosniff            = false
    }
  }
}
