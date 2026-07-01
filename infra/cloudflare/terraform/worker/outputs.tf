output "worker_script_name" {
  description = "Name of the deployed Worker script for this environment."
  value       = cloudflare_workers_script.migration.script_name
}

output "worker_route_pattern" {
  description = "Route pattern the Worker is bound to (null before production cut-over, when no route exists)."
  value       = one(cloudflare_workers_route.migration[*].pattern)
}

output "environment" {
  description = "Environment this state/apply corresponds to (sanity check before apply)."
  value       = var.environment
}

output "serving_via_worker" {
  description = "Whether this environment's public domain is currently served through the Worker (staging always; production only once cut over)."
  value       = local.serve_via_worker
}
