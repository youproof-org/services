# Adoption of the two search-engine verification records (dns.tf), which were
# created by hand in the Cloudflare dashboard long before this root managed any
# apex DNS.
#
# Why import rather than create: Terraform's state is the only thing connecting a
# resource block to a real Cloudflare object. With no state entry, an apply would
# try to CREATE — producing a second google-site-verification TXT on the apex, and
# an outright API error for the Bing CNAME (duplicate name). Import writes the state
# entry and changes nothing at Cloudflare, so a correct plan reports NO CHANGES.
#
# Cloudflare addresses DNS records by an opaque id rather than by name+type — it has
# to, since the apex already holds three TXT records. Provider v5 wants
# "<zone_id>/<record_id>"; the ids are fetched once (see the record-id variables in
# variables.tf for the exact curl commands).
#
# THIS FILE IS TRANSIENT. Import blocks are a migration aid, not permanent config:
# once the production apply has adopted both records, delete this file and the two
# *_record_id variables in a follow-up commit. Leaving it costs nothing functionally
# but implies the records are still unmanaged, which they no longer are.
#
# for_each rather than a bare block because the resources are count-gated to the
# production apply: on a staging plan (and on any plan before the tokens are set)
# there is no instance to import into, and an ungated import block would fail there.

import {
  for_each = local.adopt_google_verification ? toset(["apex"]) : toset([])
  to       = cloudflare_dns_record.google_site_verification[0]
  id       = "${local.zone_id}/${var.google_site_verification_record_id}"
}

import {
  for_each = local.adopt_bing_verification ? toset(["apex"]) : toset([])
  to       = cloudflare_dns_record.bing_site_verification[0]
  id       = "${local.zone_id}/${var.bing_site_verification_record_id}"
}

locals {
  is_production             = var.environment == "production"
  adopt_google_verification = local.is_production && var.google_site_verification != "" && var.google_site_verification_record_id != ""
  adopt_bing_verification   = local.is_production && var.bing_site_verification != "" && var.bing_site_verification_record_id != ""
}
