locals {
  # Environment-specific script name so production and staging are distinct
  # scripts in the account (and never collide in state/routes).
  worker_script_name = "newsletter-worker-${var.environment}"
}

# The bundled Worker (single ESM module). Built by esbuild into
# ../../newsletter-worker/dist/worker.js before `terraform apply` (CI builds it
# first, after generating buildinfo.json). content_sha256 lets Terraform detect
# script changes and reupload.
resource "cloudflare_workers_script" "newsletter" {
  account_id  = var.cloudflare_account_id
  script_name = local.worker_script_name

  content        = file("${path.module}/${var.worker_dist_path}")
  content_sha256 = filesha256("${path.module}/${var.worker_dist_path}")
  main_module    = "worker.js"

  # Pin a recent compatibility date so runtime behavior is stable across deploys
  # (kept in sync with wrangler.jsonc).
  compatibility_date = "2026-06-23"

  bindings = [
    # D1 subscription store (read in src as env.DB).
    {
      name = "DB"
      type = "d1"
      id   = cloudflare_d1_database.newsletter.id
    },

    # --- secret_text: never printed, sourced from GitHub Environment secrets ---
    {
      name = "BREVO_API_KEY"
      type = "secret_text"
      text = var.brevo_api_key
    },
    {
      name = "BREVO_WEBHOOK_TOKEN"
      type = "secret_text"
      text = var.brevo_webhook_token
    },
    {
      name = "TURNSTILE_SECRET"
      type = "secret_text"
      text = var.turnstile_secret
    },

    # --- plain_text ---
    {
      name = "CONTENT_SHA"
      type = "plain_text"
      text = var.content_sha
    },
    {
      name = "SITE_HOST"
      type = "plain_text"
      text = var.site_host
    },
    {
      name = "DEFAULT_LOCALE"
      type = "plain_text"
      text = var.default_locale
    },
    {
      name = "ALLOWED_ORIGINS"
      type = "plain_text"
      text = var.allowed_origins
    },
    {
      name = "BREVO_LIST_ID"
      type = "plain_text"
      text = var.brevo_list_id
    },
    {
      name = "BREVO_SENDER_EMAIL"
      type = "plain_text"
      text = var.brevo_sender_email
    },
  ]
}
