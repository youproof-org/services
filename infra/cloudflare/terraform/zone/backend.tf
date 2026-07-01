# Remote state in a Cloudflare R2 bucket via the S3-compatible Terraform
# backend. R2 speaks the S3 API but needs every AWS-specific check disabled.
#
# This root has a SINGLE, shared state file (there is no per-environment concept
# here). The bucket and `key` are supplied at init time via `-backend-config`
# (see README and the CI workflow), e.g.:
#
#   terraform init \
#     -backend-config="bucket=youproof-tfstate" \
#     -backend-config="key=cloudflare/zone.tfstate" \
#     -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com\"}" \
#     -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
#     -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
#
# The `cloudflare/zone.tfstate` key is distinct from the worker roots'
# `cloudflare/worker/{env}.tfstate` keys, so this root never shares or clobbers
# state with the per-environment worker deployments.
terraform {
  backend "s3" {
    region = "auto"

    # R2 is S3-compatible but not AWS: skip all AWS-specific validation/lookups.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    # R2 does not implement the same checksum behavior as S3; required on
    # recent Terraform versions to avoid checksum errors against R2.
    skip_s3_checksum = true
    # R2 requires path-style addressing (bucket in the path, not the host).
    use_path_style = true
    # Native state locking via a `.tflock` object next to the state (no DynamoDB).
    # Terraform writes it with an If-None-Match conditional PutObject, which R2's
    # S3 API supports — so this works on R2. Requires Terraform >= 1.11.
    use_lockfile = true
  }
}
