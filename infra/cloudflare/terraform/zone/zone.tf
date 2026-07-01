# The single `youproof.hu` Cloudflare zone.
#
# This root is the SOLE owner of the zone resource. DNS records are deliberately
# NOT managed here — they live in the per-environment `worker/` root
# (worker/dns_hu.tf) so that each environment's apply creates only its own
# (disjoint) records. This lets staging cut over to the Worker while production
# `youproof.hu` stays on legacy WordPress, until production is applied. See the
# README "Two Terraform roots" section.
resource "cloudflare_zone" "youproof_hu" {
  account = {
    id = var.cloudflare_account_id
  }
  name = "youproof.hu"
  type = "full"
}
