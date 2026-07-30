import {
  BrevoError,
  deleteContact,
  sendAdminAlert,
  senderName,
  sendTransactionalEmail,
} from "../lib/brevo";
import {
  claimLegacyInvite,
  deleteLegacyContact,
  deleteSubscription,
  failLegacyInvite,
  listPendingBrevoSync,
  listPurgeableLegacyContacts,
  listPurgeableUnsubscribed,
  listSendableLegacyContacts,
  markSyncAlerted,
  pruneEmailEvents,
  pruneSubscribeAttempts,
  releaseLegacyInvite,
  setLegacyMessageId,
} from "../lib/db";
import { buildLegacyInviteEmail } from "../lib/email";
import { syncBrevoContact } from "../lib/sync";
import { newToken } from "../lib/tokens";
import { legacyDeclineUrl, legacyResubscribeUrl, privacyUrl } from "../lib/urls";
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
// Legacy re-permission contacts: 90 days from IMPORT, not from the send — the
// clock starts when the data entered our systems. See
// docs/newsletter-legacy-repermission.md; the same number is quoted to the
// recipient in the invite email, which reads it from this constant.
const LEGACY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

// --- legacy re-permission campaign ---
// One-shot; this whole block goes away with the table when the campaign ends.
//
// Deliberately a far smaller batch than BATCH/PURGE_BATCH: this mails a
// years-old list whose hard-bounce rate is unknown, and burning through it fast
// would damage the sending domain's reputation for the *real* newsletter. At
// 5 per tick on the 15-minute schedule that's ~480/day, which also leaves time
// for one day's bounce webhooks to land in email_suppressions and take those
// addresses out of the next day's worklist automatically.
const LEGACY_INVITE_BATCH = 5;
const LEGACY_MAX_SEND_ATTEMPTS = 3;
// Purely a DELETE (these contacts were never added to the Brevo list), so this
// can run wider than PURGE_BATCH.
const LEGACY_PURGE_BATCH = 100;

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

  // Purge legacy contacts BEFORE sending to them. A batch imported long ago and
  // never mailed satisfies both queries; erasing it is the right answer, since
  // cold-contacting an address we have been sitting on for three months is
  // exactly what the retention window exists to prevent.
  await purgeExpiredLegacyContacts(env, new Date(now - LEGACY_RETENTION_MS).toISOString());
  await sendLegacyInvites(env);

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

/**
 * Erase legacy contacts past the 90-day window, in whatever status — invited
 * non-responders, decliners, converted rows kept only for click idempotency, and
 * permanently-failed sends alike.
 *
 * D1 only. Unlike purgeExpiredSubscriptions this makes NO Brevo call, and that
 * is deliberate — do not "fix" it by adding one:
 *
 *  - These addresses are never added to the Brevo list. Brevo sees them solely
 *    as the recipient of one transactional message, so there is nothing of ours
 *    to erase there, and the retention period published for them is about our
 *    own database.
 *  - A delete here would be actively dangerous. This query selects expired rows
 *    in EVERY status, and a 'converted' row is kept past conversion purely so a
 *    repeated click stays idempotent — its address is by then a confirmed
 *    subscriber sitting in the Brevo list. Deleting that contact would drop a
 *    live subscriber permanently: their brevo_synced_at is already set, so the
 *    reconciliation would never notice they had gone. The same trap applies to
 *    anyone who declined here, or was never mailed, and later signed up through
 *    the ordinary form.
 *
 * If Brevo ever does hold a contact for one of these addresses, it is because
 * the recipient opened or clicked and Brevo identified them into
 * `identified_contacts` — an account-level tracking behaviour, switched off with
 * Settings → Automations → Transactional emails → Tracking → Anonymous email
 * tracking. That is the right place to solve it; see
 * docs/newsletter-legacy-repermission.md.
 */
async function purgeExpiredLegacyContacts(env: Env, cutoffIso: string): Promise<void> {
  const expired = await listPurgeableLegacyContacts(env.DB, cutoffIso, LEGACY_PURGE_BATCH);

  for (const row of expired) {
    await deleteLegacyContact(env.DB, row.id);
  }
}

/**
 * Send the one-shot re-permission invite to a small batch of legacy contacts.
 *
 * There is no feature flag: an empty table sends nothing, so this ships dark and
 * the campaign starts when addresses are imported. Pausing is a one-line UPDATE
 * to 'paused' in the D1 console — faster than a redeploy and available from the
 * same place the import happens.
 *
 * The claim is a compare-and-swap taken BEFORE the send, so two overlapping ticks
 * cannot both mail the same address. The trade is deliberate: a crash between
 * claim and send silently drops that invite rather than risking a duplicate,
 * which is the right way round for an unsolicited mail to a stale list.
 */
async function sendLegacyInvites(env: Env): Promise<void> {
  const batch = await listSendableLegacyContacts(
    env.DB,
    LEGACY_MAX_SEND_ATTEMPTS,
    LEGACY_INVITE_BATCH,
  );

  for (const row of batch) {
    const token = newToken();
    const claimed = await claimLegacyInvite(env.DB, row.id, token, new Date().toISOString());
    if (!claimed) continue; // another tick took it

    const declineUrl = legacyDeclineUrl(env, row.id, token);
    const content = buildLegacyInviteEmail({
      resubscribeUrl: legacyResubscribeUrl(env, row.id, token),
      declineUrl,
      privacyUrl: privacyUrl(env, row.locale),
      // Same identity as the From name, so the sign-off can't contradict it.
      senderName: senderName(env),
      retentionDays: Math.round(LEGACY_RETENTION_MS / (24 * 60 * 60 * 1000)),
    });

    try {
      const { messageId } = await sendTransactionalEmail(env, {
        toEmail: row.email,
        subject: content.subject,
        htmlContent: content.htmlContent,
        textContent: content.textContent,
        listUnsubscribeUrl: declineUrl,
        tags: ["newsletter-legacy-invite"],
      });
      if (messageId) await setLegacyMessageId(env.DB, row.id, messageId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A 4xx that isn't rate limiting won't fix itself (bad recipient, rejected
      // payload) — park it for a human instead of burning the attempt budget.
      const retryable =
        !(err instanceof BrevoError) || err.status >= 500 || err.status === 429;
      if (retryable) {
        await releaseLegacyInvite(env.DB, row.id, message);
      } else {
        await failLegacyInvite(env.DB, row.id, message);
      }
      console.error("legacy invite send failed", row.id, retryable ? "(will retry)" : "(terminal)", err);
    }
  }
}
