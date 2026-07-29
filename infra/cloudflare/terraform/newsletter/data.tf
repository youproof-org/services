# Read the youproof.org zone ID from the shared `zone/` root's remote state, so
# this root references the zone WITHOUT a hand-copied ID (mirrors website/data.tf
# and worker/data.tf). Requires the `zone/` root to have been applied first, and
# the same R2 credentials used for `terraform init`. If the zone state doesn't
# exist yet this fails at plan time, correctly enforcing apply order (zone first).
#
# The `zone/` root exposes TWO zone IDs (`zone_id` = youproof.hu,
# `org_zone_id` = youproof.org); the newsletter route binds to the .org zone, so
# this root reads `org_zone_id`.
data "terraform_remote_state" "zone" {
  backend = "s3"
  config = {
    bucket    = var.tfstate_bucket
    key       = "cloudflare/zone.tfstate"
    region    = "auto"
    endpoints = { s3 = "https://${var.cloudflare_account_id}.eu.r2.cloudflarestorage.com" }

    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

locals {
  org_zone_id = data.terraform_remote_state.zone.outputs.org_zone_id
}
