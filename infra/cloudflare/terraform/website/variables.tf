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

variable "google_site_verification" {
  type    = string
  default = ""
  # Intentionally NOT sensitive: this token is published in public DNS the moment
  # it applies — anyone can `dig TXT youproof.org` and read it. Marking it
  # sensitive would only redact `terraform plan` output and make the value harder
  # to compare against live DNS, gaining nothing. Same reasoning as the worker
  # root's legacy_guard_value, which is likewise a var and not a secret.
  #
  # Holds the TOKEN ONLY — the `google-site-verification=` prefix lives in the
  # resource, so there is exactly one way to get this wrong and the validation
  # below catches it.
  description = <<-EOT
    Google Search Console / GA4 domain-verification token for youproof.org
    (production only; empty on staging, which creates no record). Sourced from the
    production GitHub Environment variable GOOGLE_SITE_VERIFICATION.

    To rotate: add the new verification in Search Console, update the variable,
    re-apply, then remove the old verification on Google's side.
  EOT

  validation {
    condition     = var.google_site_verification == "" || can(regex("^[A-Za-z0-9_-]+$", var.google_site_verification))
    error_message = "Token only — do not include the \"google-site-verification=\" prefix."
  }
}

variable "bing_site_verification" {
  type    = string
  default = ""
  # Non-sensitive for the same reason as google_site_verification above.
  #
  # Bing verifies via a CNAME whose NAME is the token (a 32-hex label under the
  # apex) pointing at a fixed target — so unlike the Google TXT, rotating this
  # replaces the record's name, not its content.
  description = <<-EOT
    Bing Webmaster Tools domain-verification host label for youproof.org
    (production only; empty creates no record). The bare label WITHOUT the domain
    suffix, e.g. "3dab192a39dad72f18190e343e18df3e" — the resource appends
    ".youproof.org" and points it at verify.bing.com. Sourced from the production
    GitHub Environment variable BING_SITE_VERIFICATION.
  EOT

  validation {
    condition     = var.bing_site_verification == "" || can(regex("^[a-z0-9-]+$", var.bing_site_verification))
    error_message = "Host label only — no dots, and no \".youproof.org\" suffix."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment: \"production\" or \"staging\". Drives the site host and R2 bucket names."

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be either \"production\" or \"staging\"."
  }
}
