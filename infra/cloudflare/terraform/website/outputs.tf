output "environment" {
  description = "Environment this state/apply corresponds to (sanity check before apply)."
  value       = var.environment
}

output "site_host" {
  description = "Public host the CDN serves for this environment (youproof.org / staging.youproof.org)."
  value       = local.site_host
}

output "content_bucket_name" {
  description = "R2 bucket the static export is uploaded to at deploy time."
  value       = cloudflare_r2_bucket.content.name
}

output "test_artifacts_bucket_name" {
  description = "R2 bucket holding this environment's quality-gate test artifacts."
  value       = cloudflare_r2_bucket.test_artifacts.name
}

output "custom_domain" {
  description = "The R2 custom domain (host) binding the content bucket to the CDN."
  value       = cloudflare_r2_custom_domain.content.domain
}
