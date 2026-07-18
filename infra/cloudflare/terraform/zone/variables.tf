variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID that will own both the youproof.hu and youproof.org zones."
}

variable "default_locale" {
  type        = string
  description = "Default locale for youproof.org. The apex root path '/' 302-redirects to '/<default_locale>' at the edge (the seam for a future geo/preference-aware worker). Sourced from TF_VAR_default_locale (GitHub Environment var DEFAULT_LOCALE) in CI; must match DEFAULT_LOCALE in apps/website/lib/i18n/locales.json. The 'hu' default is a fallback so this zone root stays self-contained (it is promoted in its own PR, separate from the deploy.yml wiring — see docs/deploy-pipeline.md)."
  default     = "hu"
}
