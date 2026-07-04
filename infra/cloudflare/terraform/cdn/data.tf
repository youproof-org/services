# Read the youproof.org zone ID straight from the `org-zone/` root's remote
# state, so this root references the zone WITHOUT a hand-copied ID. Mirrors
# worker/data.tf. This requires:
#   - the `org-zone/` root to have been applied first (its state exists), and
#   - the same R2 credentials used for `terraform init` (AWS_ACCESS_KEY_ID /
#     AWS_SECRET_ACCESS_KEY env vars) — the data source reuses them.
# If the org-zone state doesn't exist yet, this fails at plan time, which
# correctly enforces the apply order (org-zone before cdn).
data "terraform_remote_state" "org_zone" {
  backend = "s3"
  config = {
    bucket    = var.tfstate_bucket
    key       = "cloudflare/org-zone.tfstate"
    region    = "auto"
    endpoints = { s3 = "https://${var.cloudflare_account_id}.eu.r2.cloudflarestorage.com" }

    # Same R2/S3-compatibility flags as backend.tf.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}
