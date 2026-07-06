# DNS for the site host — managed by the R2 custom domain, NOT here.
#
# Unlike the youproof.hu `worker/` root (which creates explicit A records in
# worker/dns_hu.tf), the CDN's site host record is created AUTOMATICALLY by the
# cloudflare_r2_custom_domain resource (r2.tf): attaching a bucket to a custom
# domain provisions the proxied CNAME and the edge certificate. Creating our own
# cloudflare_dns_record for the same host would collide with it. So there is no
# dns_record resource for local.site_host here — the R2 custom domain owns it.
#
# For reference, the equivalent explicit record (mirroring worker/dns_hu.tf:
# ttl = 1, proxied = true) that we would create IF the custom domain did not
# manage its own DNS would look like this:
#
#   resource "cloudflare_dns_record" "site" {
#     zone_id = local.zone_id
#     name    = local.site_host
#     type    = "CNAME"                     # R2 custom domain publishes a CNAME
#     content = "<r2-custom-domain-target>" # supplied by Cloudflare
#     proxied = true
#     ttl     = 1 # 1 = automatic (required for proxied records)
#     comment = "CDN site host (${var.environment}) -> R2 content bucket"
#   }
#
# The www.<site_host> -> apex 301 redirect RULE lives in the shared zone root
# (zone/redirects.tf) and is generic; the R2 custom domain does not create a
# `www` record, so we create the proxied record below to make that rule reachable.

locals {
  # Placeholder origin for the proxied www record. Cloudflare runs the www->apex
  # redirect rule (zone/redirects.tf) at the edge before the origin is contacted,
  # so this IP is never reached. 192.0.2.1 is RFC 5737 TEST-NET-1 (unroutable) —
  # same convention as worker/dns_hu.tf.
  placeholder_origin_ip = "192.0.2.1"
}

# --- www.<site_host> -> apex 301 redirect target ---
#
# A proxied record so `www.<site_host>` resolves to Cloudflare's edge, where the
# generic www->apex dynamic-redirect rule (zone/redirects.tf) 301s it to the
# apex. The rule is dormant until this record exists. Mirrors the worker root's
# `www` record. Its own name with only an A record — no MX/TXT — so no
# CNAME-coexistence issue. Created per environment: production -> www.youproof.org,
# staging -> www.staging.youproof.org.
resource "cloudflare_dns_record" "www" {
  zone_id = local.zone_id
  name    = "www.${local.site_host}"
  type    = "A"
  content = local.placeholder_origin_ip
  proxied = true
  ttl     = 1 # 1 = automatic (required for proxied records)
  comment = "www -> apex redirect target (${var.environment}); redirect rule is in the zone root"
}

# --- Email hardening for staging.youproof.org (staging apply only) ---
#
# staging.youproof.org is served by the R2 custom domain (a PROXIED CNAME), and
# Cloudflare does not allow MX or TXT records on the same name as a proxied CNAME
# — so a null-MX and an SPF `-all` cannot live on staging.youproof.org while it
# serves the site. Spoofed mail as @staging.youproof.org is already rejected by
# the apex DMARC's subdomain policy (`_dmarc.youproof.org` has sp=reject, which
# covers all subdomains lacking their own DMARC). This explicit subdomain DMARC
# is the one hardening record that CAN coexist (it's a different name,
# `_dmarc.staging.youproof.org`, with no CNAME) — belt-and-suspenders over the
# apex sp=reject. Gated to the staging apply; production never manages it.
resource "cloudflare_dns_record" "staging_dmarc" {
  count   = var.environment == "staging" ? 1 : 0
  zone_id = local.zone_id
  name    = "_dmarc.staging.youproof.org"
  type    = "TXT"
  # Quoted per Cloudflare's zone-file convention (matches worker/dns_hu.tf).
  content = "\"v=DMARC1; p=reject; sp=reject; adkim=s; aspf=s;\""
  ttl     = 1 # 1 = automatic
  comment = "DMARC (staging): reject all mail claiming to be @staging.youproof.org"
}
