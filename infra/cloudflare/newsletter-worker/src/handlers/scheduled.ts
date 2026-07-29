import { deleteContact, sendAdminAlert } from "../lib/brevo";
import {
  deleteSubscription,
  listPendingBrevoSync,
  listPurgeableUnsubscribed,
  markSyncAlerted,
  pruneEmailEvents,
  pruneSubscribeAttempts,
} from "../lib/db";
import { syncBrevoContact } from "../lib/sync";
import type { Env } from "../types";

// How many unsynced rows to reconcile per cron tick, and after how many failed
// attempts to escalate with an admin email (once per subscription).
const BATCH = 50;
const ALERT_THRESHOLD = 3;

// --- retention windows -------------------------------------------------------
// These are the periods published in the privacy policy's retention section
// (content/pages/adatkezeles) — keep the two in step.
//
// Rate-limit ledger: transient abuse-protection state only.
const ATTEMPT_RETENTION_MS = 24 * 60 * 60 * 1000;
// Webhook delivery/bounce/spam log: 24 months.
const EVENT_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;
// Unsubscribed subscriptions: 5 years from the unsubscribe, to evidence that the
// consent was given and later withdrawn, then erased from D1 *and* Brevo.
const UNSUBSCRIBED_RETENTION_MS = 5 * 365 * 24 * 60 * 60 * 1000;
// Purge batch size: each row costs a Brevo round-trip, so keep it well under the
// reconciliation batch.
const PURGE_BATCH = 20;

/**
 * Scheduled reconciliation (Cron Trigger). Retries any subscription that owes
 * Brevo a state update — a confirm/resubscribe that failed to sync into the list,
 * or an unsubscribe that failed to blacklist the contact. Most failures are
 * transient, so this self-heals; if a row keeps failing past ALERT_THRESHOLD
 * attempts, email the admin once (brevo_alerted_at) for manual handling.
 */
export async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now();

  // Keep the rate-limit ledger from growing unbounded.
  await pruneSubscribeAttempts(env.DB, new Date(now - ATTEMPT_RETENTION_MS).toISOString());
  await pruneEmailEvents(env.DB, new Date(now - EVENT_RETENTION_MS).toISOString());
  await purgeExpiredSubscriptions(env, new Date(now - UNSUBSCRIBED_RETENTION_MS).toISOString());

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

/**
 * Erase subscriptions whose retention window has expired, from Brevo first and
 * only then from D1.
 *
 * The order is load-bearing: D1 is the only place that records which addresses owe
 * Brevo a deletion, so dropping the row first and then failing the Brevo call would
 * orphan the contact there with nothing left to retry from. On failure the row
 * stays put and the next tick tries again — the same best-effort-plus-reconcile
 * shape as the sync path, and safe to repeat because Brevo treats a 404 as success.
 */
async function purgeExpiredSubscriptions(env: Env, cutoffIso: string): Promise<void> {
  const expired = await listPurgeableUnsubscribed(env.DB, cutoffIso, PURGE_BATCH);

  for (const sub of expired) {
    try {
      await deleteContact(env, sub.email);
    } catch (err) {
      // Leave the row for the next tick rather than losing the only pointer to a
      // contact that still needs deleting.
      console.error("newsletter retention purge: Brevo delete failed", sub.id, err);
      continue;
    }
    await deleteSubscription(env.DB, sub.id);
  }
}
