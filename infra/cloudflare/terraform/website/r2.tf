# Per-environment website (CDN) resources in the shared `youproof.org` zone.
#
# The zone itself (and its zone-level rulesets) is owned by the shared `zone/`
# root; here we only create this environment's R2 buckets and the R2 custom
# domain that fronts the content bucket. The zone ID is read from that root's
# remote state (see data.tf). No Worker resources exist on this zone.
#
# State-sharing note: each environment's apply manages a DISJOINT set of
# resources (bucket names + custom-domain host are derived from var.environment),
# so the two website states never manage the same object, and neither touches
# the shared zone root:
#   production apply -> youproof-production-content, youproof-production-test-artifacts, youproof.org custom domain
#   staging apply    -> youproof-staging-content,    youproof-staging-test-artifacts,    staging.youproof.org custom domain

locals {
  zone_id   = data.terraform_remote_state.zone.outputs.org_zone_id
  zone_apex = "youproof.org"

  # Public host served by the CDN for this environment. Mirrors how the worker
  # root derives per-env hostnames: production -> apex, staging -> a subdomain.
  site_host = var.environment == "production" ? local.zone_apex : "staging.${local.zone_apex}"

  content_bucket_name        = "youproof-${var.environment}-content"
  test_artifacts_bucket_name = "youproof-${var.environment}-test-artifacts"
}

# Content bucket: the generated Next.js static export (`.html` pages + static
# assets) is uploaded here at deploy time; the CDN serves it via the R2 custom
# domain below.
#
# jurisdiction = "eu": matches the EU R2 endpoint the Terraform state bucket
# already uses (`<account>.eu.r2.cloudflarestorage.com`) and keeps content data
# in the EU. (The optional `location` hint is a finer-grained region preference
# — e.g. "weur" — and is left unset; jurisdiction is the EU-vs-default control
# that corresponds to the `.eu.` endpoint.)
# TODO verify v5 attr: jurisdiction accepted values ("default" | "eu" | "fedramp");
# confirm "eu" is the intended value to mirror the state bucket's EU endpoint.
resource "cloudflare_r2_bucket" "content" {
  account_id   = var.cloudflare_account_id
  name         = local.content_bucket_name
  jurisdiction = "eu"
}

# Test-artifacts bucket: holds the quality-gate JSON reports for this
# environment's `(services_sha, content_sha)` pairs. Not served publicly.
resource "cloudflare_r2_bucket" "test_artifacts" {
  account_id   = var.cloudflare_account_id
  name         = local.test_artifacts_bucket_name
  jurisdiction = "eu"
}

# R2 custom domain: binds the content bucket to this environment's public host
# within the youproof.org zone, so requests to that host are served from R2
# through Cloudflare's CDN (proxied).
#
# IMPORTANT: creating this resource makes Cloudflare AUTOMATICALLY provision the
# proxied CNAME DNS record for `domain` in the zone (and the edge cert). We
# therefore do NOT create a separate cloudflare_dns_record for the site host —
# see dns.tf for the rationale and the commented-out mirror of the worker root's
# record shape.
#
# jurisdiction must match the bound bucket's jurisdiction ("eu", above).
# TODO verify v5 attr: cloudflare_r2_custom_domain fields
# (account_id, bucket_name, domain, zone_id, enabled, min_tls, jurisdiction) —
# confirmed against the v5.21 provider schema, but re-check `min_tls` accepted
# values ("1.0" | "1.1" | "1.2" | "1.3").
resource "cloudflare_r2_custom_domain" "content" {
  account_id   = var.cloudflare_account_id
  bucket_name  = cloudflare_r2_bucket.content.name
  domain       = local.site_host
  zone_id      = local.zone_id
  enabled      = true
  min_tls      = "1.2"
  jurisdiction = "eu"
}
