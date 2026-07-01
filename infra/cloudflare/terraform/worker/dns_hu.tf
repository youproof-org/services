# DNS records for this environment, in the shared `youproof.hu` zone.
#
# The zone itself is owned by the separate `zone/` root; here we only create
# records, and we read the zone ID from that root's remote state (see data.tf).
#
# State-sharing note: each environment's apply manages a DISJOINT set of records
# (derived from that environment's `worker_domain` / `legacy_proxy_host`), so the
# two worker states never manage the same record, and neither touches the zone
# root:
#   production apply -> youproof.hu, www.youproof.hu, legacy.youproof.hu
#   staging apply    -> staging.youproof.hu, www.staging.youproof.hu, legacy.staging.youproof.hu
# The www -> apex redirect RULE for both lives in the zone root (zone/redirects.tf).
#
# Intentionally NOT recreated from the old Rackhost zone: www.legacy.*, MX, SPF,
# and DMARC records — youproof.hu is not used as an email domain.

locals {
  zone_id = data.terraform_remote_state.zone.outputs.zone_id

  # Whether this environment's public domain is served through the Worker.
  # Staging always is; production only once cut over (before that it stays on
  # legacy WordPress so youproof.hu keeps working after the NS switch).
  serve_via_worker = var.environment == "staging" || var.production_cutover

  # Placeholder origin for proxied (orange-cloud) records. Cloudflare intercepts
  # all matching traffic at the edge (Worker route / redirect rule) before the
  # origin is contacted, so this IP is never reached. 192.0.2.1 is from the RFC
  # 5737 TEST-NET-1 documentation range (guaranteed unroutable).
  placeholder_origin_ip = "192.0.2.1"
}

# The environment's public domain (apex youproof.hu in production,
# staging.youproof.hu in staging).
#   - served via Worker -> proxied (orange) to the placeholder origin
#   - otherwise (production pre-cutover) -> gray-cloud direct to Rackhost, so the
#     live site keeps serving legacy WordPress
resource "cloudflare_dns_record" "worker_host" {
  zone_id = local.zone_id
  name    = var.worker_domain
  type    = "A"
  content = local.serve_via_worker ? local.placeholder_origin_ip : var.rackhost_server_ip
  proxied = local.serve_via_worker
  ttl     = 1 # 1 = automatic (required for proxied records)
  comment = local.serve_via_worker ? "Worker-fronted host (${var.environment})" : "Pre-cutover: ${var.worker_domain} still served by legacy WordPress (Rackhost)"
}

# Legacy origin for this environment. Gray-cloud (NOT proxied) so it resolves
# directly to Rackhost — this is the host the Worker's outbound fetch() uses, and
# the only way to reach legacy WordPress directly.
resource "cloudflare_dns_record" "legacy_host" {
  zone_id = local.zone_id
  name    = var.legacy_proxy_host
  type    = "A"
  content = var.rackhost_server_ip
  proxied = false
  ttl     = 1 # 1 = automatic
  comment = "Legacy WordPress origin (${var.environment}); direct to Rackhost, not proxied"
}

# --- www.<domain> -> apex 301 redirect target ---
#
# The A record so `www.<worker_domain>` resolves (proxied, so the redirect rule
# runs at the edge — its origin is never contacted). The redirect RULE itself
# lives in the zone root (zone/redirects.tf), because a dynamic-redirect ruleset
# is a zone-level singleton and can't be owned per-environment. The rule there is
# dormant until this record exists.
#
# Created unconditionally: it always redirects to its apex, so it's harmless
# before cut-over (www -> apex, which is still legacy WordPress) and correct after
# (www -> apex, now the Worker). Keeping it ungated keeps this simple.
resource "cloudflare_dns_record" "www" {
  zone_id = local.zone_id
  name    = "www.${var.worker_domain}"
  type    = "A"
  content = local.placeholder_origin_ip
  proxied = true
  ttl     = 1
  comment = "www -> apex redirect target (${var.environment}); redirect rule is in the zone root"
}
