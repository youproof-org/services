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
