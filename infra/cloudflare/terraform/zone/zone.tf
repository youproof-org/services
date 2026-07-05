# The two Cloudflare zones owned by this root: youproof.hu and youproof.org.
#
# This root owns BOTH zones plus each zone's zone-level singletons (settings.tf,
# redirects.tf, and — for youproof.org — transform.tf + cache.tf). DNS records
# are deliberately NOT managed here: the .hu records live in the per-environment
# `worker/` root (worker/dns_hu.tf), and the .org site-host record is
# auto-provisioned by the R2 custom domain in the per-environment `website/`
# root. That split lets each environment's apply create only its own (disjoint)
# records — e.g. staging can cut over to the Worker while production `youproof.hu`
# stays on legacy WordPress until production is applied. See
# docs/terraform-roots-and-layout.md.

# The youproof.hu zone (legacy domain, fronted by the migration Worker).
resource "cloudflare_zone" "youproof_hu" {
  account = {
    id = var.cloudflare_account_id
  }
  name = "youproof.hu"
  type = "full"
}

# The youproof.org zone (content site). Unlike youproof.hu there is NO Worker on
# this zone: the CDN serves the R2 content bucket directly via an R2 custom
# domain (created in the per-environment `website/` root).
resource "cloudflare_zone" "youproof_org" {
  account = {
    id = var.cloudflare_account_id
  }
  name = "youproof.org"
  type = "full"
}
