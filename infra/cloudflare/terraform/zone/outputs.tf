output "zone_id" {
  description = <<-EOT
    The youproof.hu zone ID. The worker root reads this automatically from this
    root's remote state (see worker/data.tf) — it does not need to be copied
    anywhere. Exposed here for visibility / manual reference.
  EOT
  value       = cloudflare_zone.youproof_hu.id
}

output "name_servers" {
  description = <<-EOT
    Cloudflare's assigned nameservers for youproof.hu. Enter these two at the
    registrar (Rackhost) to delegate DNS to Cloudflare. Read after apply with
    `terraform output name_servers`.
  EOT
  value       = cloudflare_zone.youproof_hu.name_servers
}

output "org_zone_id" {
  description = <<-EOT
    The youproof.org zone ID. The per-environment `website/` root reads this
    automatically from this root's remote state (see website/data.tf) — it does
    not need to be copied anywhere. Also used by the deploy workflow's CDN
    cache-purge step (as the ORG_ZONE_ID variable). Exposed here for manual
    reference: `terraform output org_zone_id`.
  EOT
  value       = cloudflare_zone.youproof_org.id
}

output "org_name_servers" {
  description = <<-EOT
    Cloudflare's assigned nameservers for youproof.org. Enter these two at the
    registrar to delegate DNS to Cloudflare. Read after apply with
    `terraform output org_name_servers`.
  EOT
  value       = cloudflare_zone.youproof_org.name_servers
}
