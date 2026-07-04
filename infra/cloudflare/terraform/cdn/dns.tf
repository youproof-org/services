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
# The www.<site_host> -> apex 301 redirect RULE lives in the org-zone root
# (org-zone/redirects.tf) and is generic; if a `www.` host record is ever wanted
# for this environment it would be added here as a proxied record (mirroring the
# worker root's `www` record), but the R2 custom domain does not create one.
