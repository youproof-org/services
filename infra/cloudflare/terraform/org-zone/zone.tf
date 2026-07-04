# The single `youproof.org` Cloudflare zone.
#
# This root is the SOLE owner of the zone resource and of the zone-level
# singletons (settings, the www->apex redirect ruleset, the .html transform
# ruleset, and the cache ruleset). DNS records are deliberately NOT managed here
# — they live in the per-environment `cdn/` root, mirroring how the `youproof.hu`
# `zone/` root delegates records to `worker/`. That split lets each environment's
# apply create only its own (disjoint) records without touching this shared root.
#
# Unlike the youproof.hu zone, there is NO Worker on this zone: the CDN serves
# the R2 content bucket directly via an R2 custom domain (created in cdn/).
resource "cloudflare_zone" "youproof_org" {
  account = {
    id = var.cloudflare_account_id
  }
  name = "youproof.org"
  type = "full"
}
