import { sendAdminAlert } from "../lib/brevo";
import { listConfirmedUnsynced, markSyncAlerted } from "../lib/db";
import { syncConfirmedContact } from "../lib/sync";
import type { Env } from "../types";

// How many unsynced rows to reconcile per cron tick, and after how many failed
// attempts to escalate with an admin email (once per subscription).
const BATCH = 50;
const ALERT_THRESHOLD = 3;

/**
 * Scheduled reconciliation (Cron Trigger). Retries confirmed subscriptions whose
 * Brevo list-sync failed at confirmation time — most failures are transient, so
 * this self-heals. If a row keeps failing past ALERT_THRESHOLD attempts, email
 * the admin once (brevo_alerted_at) so it can be handled manually.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const pending = await listConfirmedUnsynced(env.DB, BATCH);

  for (const sub of pending) {
    const ok = await syncConfirmedContact(env, sub);
    if (ok) continue;

    // syncConfirmedContact just incremented the attempt counter in D1.
    const attempts = sub.brevo_sync_attempts + 1;
    if (attempts >= ALERT_THRESHOLD && !sub.brevo_alerted_at) {
      try {
        await sendAdminAlert(
          env,
          "[youproof] newsletter contact sync failing",
          [
            `Subscription ${sub.id} (${sub.email}) is confirmed but has failed to`,
            `sync into the Brevo list ${attempts} times.`,
            `Last error: ${sub.brevo_sync_last_error ?? "(see worker logs)"}.`,
            "",
            "The subscriber is confirmed in D1 but not in the Brevo campaign list;",
            "manual intervention may be needed (see docs/brevo-setup.md).",
          ].join("\n"),
        );
        await markSyncAlerted(env.DB, sub.id, new Date().toISOString());
      } catch (err) {
        console.error("newsletter admin alert failed", sub.id, err);
      }
    }
  }
}
