locals {
  # Environment-specific D1 name so production and staging are distinct databases.
  d1_database_name = "youproof-newsletter-${var.environment}"
}

# The subscription store. Terraform OWNS creation of the database; the SCHEMA is
# applied separately by `wrangler d1 migrations apply` in the deploy pipeline
# (see docs/newsletter.md). On a real deploy this resource is created by a
# targeted apply FIRST, then migrations run, then the full apply uploads the
# worker — so the worker never serves before its schema exists.
resource "cloudflare_d1_database" "newsletter" {
  account_id = var.cloudflare_account_id
  name       = local.d1_database_name

  # EU data residency, matching the R2 content/test-artifact buckets
  # (jurisdiction = "eu"). When jurisdiction is set, primary_location_hint is
  # ignored — the database is pinned to the EU jurisdiction.
  jurisdiction = "eu"

  # Set explicitly: the v5 provider otherwise sends `read_replication: null` on
  # the update PUT, which the D1 API rejects with 400 "Expected object, received
  # null". "disabled" = no read replicas (fine for this low-traffic DB).
  read_replication = {
    mode = "disabled"
  }
}
