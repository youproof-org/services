# Bind the Worker to all paths on this environment's public .hu domain.
# Production: youproof.hu/*   Staging: staging.youproof.hu/*
#
# Only created when the domain is actually served via the Worker (staging always;
# production once cut over). Before production cut-over the apex is a gray-cloud
# record pointing straight at Rackhost, so a route would never fire anyway — we
# skip it to keep the pre-cutover state unambiguous. The Worker script itself is
# still uploaded (worker.tf), just not routed yet.
resource "cloudflare_workers_route" "migration" {
  count = local.serve_via_worker ? 1 : 0

  zone_id = local.zone_id
  pattern = "${var.worker_domain}/*"
  script  = cloudflare_workers_script.migration.script_name
}
