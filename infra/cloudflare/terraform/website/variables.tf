variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the zone and R2 buckets."
}

variable "tfstate_bucket" {
  type        = string
  description = <<-EOT
    Name of the R2 bucket holding Terraform state. Used by the
    `terraform_remote_state` data source (data.tf) to read the shared `zone/`
    root's `org_zone_id` output (the youproof.org zone ID) — this root references
    the zone rather than owning it, and gets the ID straight from the zone root's
    output instead of a hand-copied value. Should match the `bucket` passed to
    `terraform init`.
  EOT
}

variable "environment" {
  type        = string
  description = "Deployment environment: \"production\" or \"staging\". Drives the site host and R2 bucket names."

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be either \"production\" or \"staging\"."
  }
}
