# Bind the newsletter Worker to the newsletter API path on this environment's
# public .org host. Production: youproof.org/api/v1/newsletter/*
# Staging:    staging.youproof.org/api/v1/newsletter/*
#
# This is the FIRST worker route on the youproof.org zone. Everything else on the
# zone is served static from R2 via the r2 custom domain (website/ root). A
# Workers route with a specific path pattern is evaluated ahead of the bucket's
# custom-domain origin, so only /api/v1/newsletter/* reaches the worker while all
# other paths keep serving from R2. Verify this precedence on staging early.
resource "cloudflare_workers_route" "newsletter" {
  zone_id = local.org_zone_id
  pattern = "${var.site_host}/api/v1/newsletter/*"
  script  = cloudflare_workers_script.newsletter.script_name
}
