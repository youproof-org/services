# Cron Trigger driving the scheduled reconciliation (src/handlers/scheduled.ts):
# retry confirmed subscribers whose Brevo list-sync failed, and alert once a row
# keeps failing. Every 15 minutes. Kept in sync with wrangler.jsonc's triggers
# (which is used only for local dev).
resource "cloudflare_workers_cron_trigger" "newsletter" {
  account_id  = var.cloudflare_account_id
  script_name = cloudflare_workers_script.newsletter.script_name
  schedules = [
    { cron = "*/15 * * * *" },
  ]
}
