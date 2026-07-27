variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the zone, Worker, and D1 database."
}

variable "tfstate_bucket" {
  type        = string
  description = <<-EOT
    Name of the R2 bucket holding Terraform state. Used by the
    `terraform_remote_state` data source (data.tf) to read the shared `zone/`
    root's `org_zone_id` output. Should match the `bucket` passed to
    `terraform init`.
  EOT
}

variable "environment" {
  type        = string
  description = "Deployment environment: \"production\" or \"staging\". Drives the worker/D1 names and the site host."

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be either \"production\" or \"staging\"."
  }
}

variable "site_host" {
  type        = string
  description = "Public .org host the newsletter route is bound to, e.g. \"youproof.org\" or \"staging.youproof.org\". The route pattern becomes \"<site_host>/api/v1/newsletter/*\"."
}

variable "default_locale" {
  type        = string
  default     = "hu"
  description = "Default locale for the post-unsubscribe homepage redirect (/{locale}). Bound to the Worker as DEFAULT_LOCALE."
}

variable "allowed_origins" {
  type        = string
  description = "Comma-separated allowlist of acceptable Origin/Referer origins for the subscribe POST, e.g. \"https://youproof.org,https://www.youproof.org\". Bound to the Worker as ALLOWED_ORIGINS."
}

variable "content_sha" {
  type        = string
  default     = ""
  description = <<-EOT
    Commit SHA of youproof-org/content this deploy was built against (the
    accepted privacy-policy version). Bound to the Worker as the plain-text
    CONTENT_SHA — a readable copy of the value also inlined into the bundle via
    buildinfo.json. Sourced in CI from the deploy pipeline's pinned content_sha.
  EOT
}

variable "brevo_sender_email" {
  type        = string
  description = "Verified Brevo sender email used for the confirmation email. Bound to the Worker as BREVO_SENDER_EMAIL."
}

variable "brevo_list_id" {
  type        = string
  description = "Brevo list id confirmed subscribers are synced into. Bound to the Worker as BREVO_LIST_ID (string)."
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Admin recipient for operational alerts (e.g. a confirmed contact repeatedly failing to sync into the Brevo list). Bound to the Worker as ALERT_EMAIL; empty disables alert emails."
}

variable "brevo_api_key" {
  type        = string
  sensitive   = true
  description = "Brevo REST API key. Bound to the Worker as a secret_text binding (BREVO_API_KEY). Sourced from a GitHub Environment secret (TF_VAR_brevo_api_key)."
}

variable "brevo_webhook_token" {
  type        = string
  sensitive   = true
  description = "Shared secret embedded in the Brevo webhook URL as ?token= and validated on inbound webhook POSTs (Brevo offers no HMAC). Bound as secret_text BREVO_WEBHOOK_TOKEN. Sourced from a GitHub Environment secret."
}

variable "turnstile_secret" {
  type        = string
  sensitive   = true
  description = "Cloudflare Turnstile secret key for server-side siteverify. Bound as secret_text TURNSTILE_SECRET. Sourced from a GitHub Environment secret."
}

variable "worker_dist_path" {
  type        = string
  default     = "../../newsletter-worker/dist/worker.js"
  description = "Path to the bundled Worker script produced by `pnpm --filter @youproof.org/newsletter-worker build`, relative to this Terraform root (terraform/newsletter/)."
}
