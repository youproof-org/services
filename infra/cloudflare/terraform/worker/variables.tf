variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that owns the zone and Worker."
}

variable "tfstate_bucket" {
  type        = string
  description = <<-EOT
    Name of the R2 bucket holding Terraform state. Used by the
    `terraform_remote_state` data source (data.tf) to read the `zone/` root's
    outputs (the youproof.hu zone ID) — this root references the zone rather than
    owning it, and gets the ID straight from the zone root's output instead of a
    hand-copied value. Should match the `bucket` passed to `terraform init`.
  EOT
}

variable "production_cutover" {
  type        = bool
  default     = false
  description = <<-EOT
    Production cut-over switch. Ignored for staging (staging is always served via
    the Worker). For PRODUCTION:
      - false (default): `youproof.hu` resolves gray-cloud directly to Rackhost,
        so the live site keeps running on legacy WordPress even after the
        nameserver switch. No Worker route, no www redirect.
      - true: `youproof.hu` is proxied to the Worker (placeholder origin), the
        route is bound, and the www -> apex redirect is provisioned — i.e. the
        cut-over to the Worker concept.
    Typical flow: apply production with false right after the NS switch (keeps
    production live), then re-apply with true once staging is fully tested.
  EOT
}

variable "legacy_guard_value" {
  type = string
  # Intentionally NOT sensitive: this is a long-lived access token, not a true
  # secret. It gates direct access to the legacy host (and keeps `legacy.*` out
  # of search indexes), but the user needs to read it back out of GitHub to log
  # into legacy WordPress admin without regenerating it. Leaving it non-sensitive
  # keeps `terraform plan` output un-redacted and the value easy to retrieve.
  # It is still kept out of git (sourced from a GitHub Environment variable) and
  # must never be printed to CI logs (it won't get GitHub's secret log-masking).
  description = <<-EOT
    Long-lived access token bound to the Worker as the plain-text binding
    LEGACY_GUARD_VALUE and injected as the `X-Legacy-Guard` header on proxied
    requests. Sourced from a GitHub Environment variable
    (TF_VAR_legacy_guard_value) — kept out of git, but not a Terraform-sensitive
    value and not GitHub-masked, so it must never be logged.
  EOT
}

variable "environment" {
  type        = string
  description = "Deployment environment: \"production\" or \"staging\". Used in the Worker script name and tags."

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "environment must be either \"production\" or \"staging\"."
  }
}

variable "worker_domain" {
  type        = string
  description = "Public legacy domain the Worker is bound to, e.g. \"youproof.hu\" or \"staging.youproof.hu\". The route pattern becomes \"<worker_domain>/*\"."
}

variable "redirect_target_host" {
  type        = string
  description = "Host migrated paths are 301-redirected to, e.g. \"youproof.org\" or \"staging.youproof.org\". Bound to the Worker as REDIRECT_TARGET_HOST."
}

variable "legacy_proxy_host" {
  type        = string
  default     = ""
  description = <<-EOT
    Legacy origin host unmigrated paths are proxied to, e.g. "legacy.youproof.hu"
    or "legacy.staging.youproof.hu". Bound to the Worker as LEGACY_PROXY_HOST.

    Clearing it (empty string) switches the environment to POST-MIGRATION mode:
    the `legacy.*` A record is not created (see dns_hu.tf) and the Worker returns
    410 Gone for unmigrated paths instead of proxying. Set this to empty once the
    legacy WordPress site is decommissioned.
  EOT
}

variable "seo_noindex" {
  type    = bool
  default = true
  description = <<-EOT
    Whether this environment's reverse-proxied legacy content is served with an
    `X-Robots-Tag: noindex, nofollow` response header (bound to the Worker as the
    plain-text SEO_NOINDEX = "true"/"false", read in src/proxy.ts).

    Defaults to TRUE (noindex) so a missing/misconfigured value can never
    accidentally expose staging/legacy to search engines. PRODUCTION must set it
    to FALSE explicitly: we deliberately want search engines to keep indexing the
    still-unmigrated legacy content proxied through youproof.hu until it is
    migrated to .org. Staging leaves it true. Only affects the proxied response;
    301 redirects, 410 Gone and admin 404s are unaffected.
  EOT
}

variable "rackhost_server_ip" {
  type        = string
  description = <<-EOT
    Public IPv4 of the Rackhost shared host serving the legacy WordPress site
    (e.g. "91.227.138.40"). Used as the content of the gray-cloud (non-proxied)
    `legacy.*` A records, which the Worker's outbound fetch reaches directly over
    the public internet. Sourced from a GitHub Environment variable.
  EOT
}

variable "worker_dist_path" {
  type        = string
  description = "Path to the bundled Worker script produced by `pnpm --filter @youproof.org/migration-worker build`, relative to this Terraform root (terraform/worker/)."
  default     = "../../worker/dist/worker.js"
}
