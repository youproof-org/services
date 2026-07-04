output "zone_id" {
  description = <<-EOT
    The youproof.org zone ID. The per-environment cdn root reads this
    automatically from this root's remote state (see cdn/data.tf) — it does not
    need to be copied anywhere. Exposed here for visibility / manual reference.
  EOT
  value       = cloudflare_zone.youproof_org.id
}

output "name_servers" {
  description = <<-EOT
    Cloudflare's assigned nameservers for youproof.org. Enter these two at the
    registrar to delegate DNS to Cloudflare. Read after apply with
    `terraform output name_servers`.
  EOT
  value       = cloudflare_zone.youproof_org.name_servers
}
