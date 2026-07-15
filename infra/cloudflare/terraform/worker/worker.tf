locals {
  # Environment-specific Worker script name so production and staging are
  # distinct scripts in the account (and never collide in state/routes).
  worker_script_name = "redirect-worker-${var.environment}"
}

# The bundled Worker (single ESM module). Built by esbuild into
# ../../worker/dist/worker.js before `terraform apply` (the CI workflow runs the
# build first). content_sha256 lets Terraform detect script changes and reupload.
resource "cloudflare_workers_script" "migration" {
  account_id  = var.cloudflare_account_id
  script_name = local.worker_script_name

  content        = file("${path.module}/${var.worker_dist_path}")
  content_sha256 = filesha256("${path.module}/${var.worker_dist_path}")
  main_module    = "worker.js"

  # Pin a recent compatibility date so runtime behavior is stable across deploys.
  compatibility_date = "2026-06-23"

  # Environment-specific bindings. These are read in src/index.ts as
  # `env.REDIRECT_TARGET_HOST` / `env.LEGACY_PROXY_HOST` / `env.LEGACY_GUARD_VALUE`
  # and are the reason the same codebase can be deployed to both environments
  # without hardcoded domains.
  bindings = [
    {
      name = "REDIRECT_TARGET_HOST"
      type = "plain_text"
      text = var.redirect_target_host
    },
    {
      name = "LEGACY_PROXY_HOST"
      type = "plain_text"
      text = var.legacy_proxy_host
    },
    {
      # Bound as plain_text (NOT a Workers secret): the guard value is a
      # long-lived access token, not sensitive data, and is meant to stay
      # readable so it can be retrieved to log into legacy WordPress admin
      # directly. See variables.tf for the rationale.
      name = "LEGACY_GUARD_VALUE"
      type = "plain_text"
      text = var.legacy_guard_value
    },
    {
      # Whether proxied legacy content is served noindex. Bindings are string-only,
      # so the bool is stringified; src/proxy.ts treats anything but "false" as
      # noindex (safe default). staging = "true", production = "false".
      name = "SEO_NOINDEX"
      type = "plain_text"
      text = tostring(var.seo_noindex)
    },
  ]
}
