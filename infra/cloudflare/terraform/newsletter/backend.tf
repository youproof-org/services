# Remote state in a Cloudflare R2 bucket via the S3-compatible Terraform
# backend. R2 speaks the S3 API but needs every AWS-specific check disabled.
#
# The bucket and per-environment state `key` are supplied at init time via
# `-backend-config` (see docs/terraform-roots-and-layout.md and the CI workflow):
#
#   terraform init \
#     -backend-config="bucket=youproof-tfstate" \
#     -backend-config="key=cloudflare/newsletter/production.tfstate" \
#     -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com\"}" \
#     -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
#     -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
#
# A distinct `key` per environment (production.tfstate / staging.tfstate) keeps
# the two environments from ever sharing or clobbering state.
terraform {
  backend "s3" {
    region = "auto"

    # R2 is S3-compatible but not AWS: skip all AWS-specific validation/lookups.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    # Native state locking via a `.tflock` object (no DynamoDB). Terraform >= 1.11.
    use_lockfile = true
  }
}
