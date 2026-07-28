output "worker_script_name" {
  description = "Name of the deployed newsletter Worker script for this environment."
  value       = cloudflare_workers_script.newsletter.script_name
}

output "worker_route_pattern" {
  description = "Route pattern the newsletter Worker is bound to."
  value       = cloudflare_workers_route.newsletter.pattern
}

output "d1_database_id" {
  description = "Id of the D1 database. The CI migration step injects this into wrangler config before `wrangler d1 migrations apply --remote`."
  value       = cloudflare_d1_database.newsletter.id
}

output "d1_database_name" {
  description = "Name of the D1 database (also used as the wrangler migration target)."
  value       = cloudflare_d1_database.newsletter.name
}

output "environment" {
  description = "Environment this state/apply corresponds to (sanity check before apply)."
  value       = var.environment
}
