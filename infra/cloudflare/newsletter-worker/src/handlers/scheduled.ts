import { sendAdminAlert } from "../lib/brevo";
import { listPendingBrevoSync, markSyncAlerted, pruneSubscribeAttempts } from "../lib/db";
import { syncBrevoContact } from "../lib/sync";
import type { Env } from "../types";

// How many unsynced rows to reconcile per cron tick, and after how many failed
// attempts to escalate with an admin email (once per subscription).
const BATCH = 50;
const ALERT_THRESHOLD = 3;
// Rate-limit ledger rows older than this are pruned each tick.
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;

/**
 * Scheduled reconciliation (Cron Trigger). Retries any subscription that owes
 * Brevo a state update — a confirm/resubscribe that failed to sync into the list,
 * or an unsubscribe that failed to blacklist the contact. Most failures are
 * transient, so this self-heals; if a row keeps failing past ALERT_THRESHOLD
 * attempts, email the admin once (brevo_alerted_at) for manual handling.
 */
export async function handleScheduled(env: Env): Promise<void> {
  // Keep the rate-limit ledger from growing unbounded.
  await pruneSubscribeAttempts(
    env.DB,
    new Date(Date.now() - ATTEMPT_RETENTION_MS).toISOString(),
  );

  const pending = await listPendingBrevoSync(env.DB, BATCH);

  for (const sub of pending) {
    const ok = await syncBrevoContact(env, sub);
    if (ok) continue;

    // syncBrevoContact just incremented the attempt counter in D1.
    const attempts = sub.brevo_sync_attempts + 1;
    if (attempts >= ALERT_THRESHOLD && !sub.brevo_alerted_at) {
      const desired =
        sub.status === "unsubscribed"
          ? "unsubscribed (blacklisted) in Brevo"
          : "synced into the Brevo list";
      try {
        await sendAdminAlert(
          env,
          "[youproof] newsletter Brevo sync failing",
          [
            `Subscription ${sub.id} (${sub.email}, status=${sub.status}) has failed`,
            `to be ${desired} ${attempts} times.`,
            `Last error: ${sub.brevo_sync_last_error ?? "(see worker logs)"}.`,
            "",
            "D1 is the source of truth but Brevo is out of sync; manual",
            "intervention may be needed (see docs/brevo-setup.md).",
          ].join("\n"),
        );
        await markSyncAlerted(env.DB, sub.id, new Date().toISOString());
      } catch (err) {
        console.error("newsletter admin alert failed", sub.id, err);
      }
    }
  }
}
