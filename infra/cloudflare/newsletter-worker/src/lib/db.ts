/**
 * D1 query layer + the subscribe upsert/status-transition orchestration.
 *
 * The orchestration (subscribeUpsert) takes injectable deps (clock + id/token
 * generators) so its branching can be unit-tested against a fake D1 with
 * deterministic output. Row shapes use the DB's snake_case column names.
 */
import { newId, newToken } from "./tokens";
import type { SubscribeInput } from "./validate";
import type { SubscriptionStatus } from "../types";

export interface DbSubscription {
  id: string;
  email: string;
  name: string;
  locale: string;
  status: SubscriptionStatus;
  source_page: string | null;
  source_form_instance: string | null;
  confirm_token: string | null;
  unsubscribe_token: string;
  privacy_content_sha: string | null;
  brevo_message_id: string | null;
  subscribed_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
  // Brevo list-sync reconciliation markers.
  brevo_synced_at: string | null;
  brevo_sync_attempts: number;
  brevo_sync_last_error: string | null;
  brevo_alerted_at: string | null;
}

interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      // Real D1 resolves to a D1Result carrying meta.changes. Nearly every caller
      // ignores it; claimLegacyInvite needs it to tell a won compare-and-swap
      // from a lost one.
      run(): Promise<{ meta?: { changes?: number } } | unknown>;
      all<T = unknown>(): Promise<{ results: T[] }>;
    };
  };
}

/** Rows affected by the last write, or 0 when the driver doesn't report it. */
function changesOf(result: unknown): number {
  const meta = (result as { meta?: { changes?: number } } | null)?.meta;
  return meta?.changes ?? 0;
}

/** Deps injected for determinism; real implementations used in production. */
export interface UpsertDeps {
  now(): string;
  newId(): string;
  newToken(): string;
}

export const defaultDeps: UpsertDeps = {
  now: () => new Date().toISOString(),
  newId,
  newToken,
};

/**
 * What subscribeUpsert actually reads. Narrower than SubscribeInput so callers
 * that never saw a form (the legacy re-permission flow) don't have to invent a
 * turnstileToken and a privacyAccepted flag it would ignore anyway.
 */
export type UpsertInput = Pick<
  SubscribeInput,
  "name" | "email" | "locale" | "sourcePage" | "sourceFormInstance"
>;

export type SubscribeOutcome =
  | { kind: "blocked" }
  | { kind: "created"; subscription: DbSubscription }
  | { kind: "updated"; subscription: DbSubscription }
  | { kind: "resubscribed"; subscription: DbSubscription };

// --- reads ---

export async function getSubscriptionByEmail(
  db: D1Like,
  email: string,
): Promise<DbSubscription | null> {
  return db
    .prepare("SELECT * FROM subscriptions WHERE email = ?")
    .bind(email)
    .first<DbSubscription>();
}

export async function getSubscriptionById(
  db: D1Like,
  id: string,
): Promise<DbSubscription | null> {
  return db
    .prepare("SELECT * FROM subscriptions WHERE id = ?")
    .bind(id)
    .first<DbSubscription>();
}

export async function isSuppressed(db: D1Like, email: string): Promise<boolean> {
  const row = await db
    .prepare("SELECT email FROM email_suppressions WHERE email = ?")
    .bind(email)
    .first<{ email: string }>();
  return row !== null;
}

// --- writes ---

async function insertSubscription(db: D1Like, s: DbSubscription): Promise<void> {
  await db
    .prepare(
      `INSERT INTO subscriptions (
        id, email, name, locale, status, source_page, source_form_instance,
        confirm_token, unsubscribe_token, privacy_content_sha, brevo_message_id,
        subscribed_at, confirmed_at, unsubscribed_at, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      s.id, s.email, s.name, s.locale, s.status, s.source_page,
      s.source_form_instance, s.confirm_token, s.unsubscribe_token,
      s.privacy_content_sha, s.brevo_message_id, s.subscribed_at,
      s.confirmed_at, s.unsubscribed_at, s.created_at, s.updated_at,
    )
    .run();
}

/** Persist the Brevo transactional messageId of the confirmation send. */
export async function setBrevoMessageId(
  db: D1Like,
  id: string,
  messageId: string,
  now: string,
): Promise<void> {
  await db
    .prepare("UPDATE subscriptions SET brevo_message_id = ?, updated_at = ? WHERE id = ?")
    .bind(messageId, now, id)
    .run();
}

/** Mark a pending subscription confirmed (idempotent for already-confirmed). */
export async function confirmSubscription(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subscriptions
         SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, ?), updated_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, now, id)
    .run();
}

/**
 * Soft-delete via OUR unsubscribe endpoint: retain the row + history, flip to
 * unsubscribed, and RESET the Brevo-sync markers so the reconciliation propagates
 * the unsubscribe out to Brevo (blacklist the contact). Our List-Unsubscribe
 * points at this endpoint, so Brevo isn't in the loop and must be told. Idempotent.
 */
export async function unsubscribeSubscription(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subscriptions
         SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ?,
             brevo_synced_at = NULL, brevo_sync_attempts = 0,
             brevo_sync_last_error = NULL, brevo_alerted_at = NULL
       WHERE id = ? AND status != 'blocked'`,
    )
    .bind(now, now, id)
    .run();
}

/**
 * Upsert by email, encoding the resubscription/update rules (planfile §3.3):
 *  - suppressed email → blocked (no send)
 *  - no record → create fresh pending
 *  - active (pending/confirmed) → update name in place
 *  - unsubscribed (not suppressed) → reset to a fresh pending (re-run opt-in)
 */
export async function subscribeUpsert(
  db: D1Like,
  input: UpsertInput,
  contentSha: string,
  deps: UpsertDeps = defaultDeps,
): Promise<SubscribeOutcome> {
  if (await isSuppressed(db, input.email)) return { kind: "blocked" };

  const existing = await getSubscriptionByEmail(db, input.email);
  const now = deps.now();

  if (!existing) {
    const s: DbSubscription = {
      id: deps.newId(),
      email: input.email,
      name: input.name,
      locale: input.locale,
      status: "pending",
      source_page: input.sourcePage,
      source_form_instance: input.sourceFormInstance,
      confirm_token: deps.newToken(),
      unsubscribe_token: deps.newToken(),
      privacy_content_sha: contentSha || null,
      brevo_message_id: null,
      subscribed_at: now,
      confirmed_at: null,
      unsubscribed_at: null,
      created_at: now,
      updated_at: now,
      brevo_synced_at: null,
      brevo_sync_attempts: 0,
      brevo_sync_last_error: null,
      brevo_alerted_at: null,
    };
    await insertSubscription(db, s);
    return { kind: "created", subscription: s };
  }

  if (existing.status === "blocked") return { kind: "blocked" };

  if (existing.status === "pending" || existing.status === "confirmed") {
    await db
      .prepare("UPDATE subscriptions SET name = ?, updated_at = ? WHERE id = ?")
      .bind(input.name, now, existing.id)
      .run();
    return {
      kind: "updated",
      subscription: { ...existing, name: input.name, updated_at: now },
    };
  }

  // status === 'unsubscribed' → reset in place to a fresh pending subscription.
  const confirmToken = deps.newToken();
  const unsubscribeToken = deps.newToken();
  await db
    .prepare(
      `UPDATE subscriptions
         SET name = ?, locale = ?, status = 'pending',
             source_page = ?, source_form_instance = ?,
             confirm_token = ?, unsubscribe_token = ?, privacy_content_sha = ?,
             brevo_message_id = NULL,
             subscribed_at = ?, confirmed_at = NULL, unsubscribed_at = NULL,
             updated_at = ?,
             brevo_synced_at = NULL, brevo_sync_attempts = 0,
             brevo_sync_last_error = NULL, brevo_alerted_at = NULL
       WHERE id = ?`,
    )
    .bind(
      input.name, input.locale, input.sourcePage, input.sourceFormInstance,
      confirmToken, unsubscribeToken, contentSha || null, now, now, existing.id,
    )
    .run();
  return {
    kind: "resubscribed",
    subscription: {
      ...existing,
      name: input.name,
      locale: input.locale,
      status: "pending",
      source_page: input.sourcePage,
      source_form_instance: input.sourceFormInstance,
      confirm_token: confirmToken,
      unsubscribe_token: unsubscribeToken,
      privacy_content_sha: contentSha || null,
      brevo_message_id: null,
      subscribed_at: now,
      confirmed_at: null,
      unsubscribed_at: null,
      updated_at: now,
      brevo_synced_at: null,
      brevo_sync_attempts: 0,
      brevo_sync_last_error: null,
      brevo_alerted_at: null,
    },
  };
}

// --- Brevo-sync reconciliation ---

/**
 * Rows that owe Brevo a state update (`brevo_synced_at IS NULL`). The desired
 * Brevo state depends on status, applied by syncBrevoContact:
 *   - confirmed   → in list + emailBlacklisted:false (covers confirm AND the
 *                   re-confirm after a resubscribe)
 *   - unsubscribed → emailBlacklisted:true (our-endpoint unsubscribe)
 * Fewest-attempts first so a few permanently-failing rows can't starve fresh
 * ones out of the LIMIT-bounded batch.
 */
export async function listPendingBrevoSync(
  db: D1Like,
  limit: number,
): Promise<DbSubscription[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
        WHERE brevo_synced_at IS NULL AND status IN ('confirmed', 'unsubscribed')
        ORDER BY brevo_sync_attempts ASC, subscribed_at ASC
        LIMIT ?`,
    )
    .bind(limit)
    .all<DbSubscription>();
  return results;
}

export async function markContactSynced(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE subscriptions SET brevo_synced_at = ?, brevo_sync_last_error = NULL, updated_at = ? WHERE id = ?",
    )
    .bind(now, now, id)
    .run();
}

export async function recordContactSyncFailure(
  db: D1Like,
  id: string,
  error: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE subscriptions SET brevo_sync_attempts = brevo_sync_attempts + 1, brevo_sync_last_error = ?, updated_at = ? WHERE id = ?",
    )
    .bind(error.slice(0, 500), now, id)
    .run();
}

export async function markSyncAlerted(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare("UPDATE subscriptions SET brevo_alerted_at = ?, updated_at = ? WHERE id = ?")
    .bind(now, now, id)
    .run();
}

// --- webhook-side writes (Brevo delivery/bounce/spam/unsubscribe events) ---

/**
 * Append a webhook event. Idempotent via the (message_id, event) unique index —
 * a redelivered event is silently ignored, so callers can safely retry.
 */
export async function insertEmailEvent(
  db: D1Like,
  e: {
    email: string;
    messageId: string | null;
    event: string;
    reason: string | null;
    occurredAt: string | null;
    raw: string;
    receivedAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO email_events
         (id, email, message_id, event, reason, raw, occurred_at, received_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .bind(newId(), e.email, e.messageId, e.event, e.reason, e.raw, e.occurredAt, e.receivedAt)
    .run();
}

/**
 * Record a bounce/spam suppression for an email, keyed by email so it survives
 * across subscription records. Upsert: first_seen_at is preserved, last_event_at
 * and reason are refreshed.
 */
export async function upsertSuppression(
  db: D1Like,
  email: string,
  reason: "bounce" | "spam",
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO email_suppressions (email, reason, first_seen_at, last_event_at)
       VALUES (?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET
         reason = excluded.reason,
         last_event_at = excluded.last_event_at`,
    )
    .bind(email, reason, now, now)
    .run();
}

/** Mark every subscription for an email as blocked (terminal). */
export async function setBlockedByEmail(
  db: D1Like,
  email: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE subscriptions SET status = 'blocked', updated_at = ? WHERE email = ? AND status != 'blocked'",
    )
    .bind(now, email)
    .run();
}

/** Soft-delete by email (Brevo-side unsubscribe). Never touches blocked rows. */
export async function unsubscribeByEmail(
  db: D1Like,
  email: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subscriptions
         SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ?
       WHERE email = ? AND status NOT IN ('blocked', 'unsubscribed')`,
    )
    .bind(now, now, email)
    .run();
}

// --- rate-limit ledger (used by the subscribe handler in Phase 4) ---

export async function recordSubscribeAttempt(
  db: D1Like,
  email: string | null,
  clientIp: string | null,
  now: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO subscribe_attempts (id, email, client_ip, attempted_at) VALUES (?,?,?,?)",
    )
    .bind(newId(), email, clientIp, now)
    .run();
}

export async function countRecentAttempts(
  db: D1Like,
  column: "email" | "client_ip",
  value: string,
  sinceIso: string,
): Promise<number> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM subscribe_attempts WHERE ${column} = ? AND attempted_at >= ?`,
    )
    .bind(value, sinceIso)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Delete rate-limit ledger rows older than the cutoff (called from the cron). */
export async function pruneSubscribeAttempts(
  db: D1Like,
  cutoffIso: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM subscribe_attempts WHERE attempted_at < ?")
    .bind(cutoffIso)
    .run();
}

// --- retention (storage limitation; see the privacy policy's retention section) ---

/**
 * Delete webhook-event log rows older than the cutoff. Keyed on received_at (when
 * we recorded it) rather than occurred_at, which is nullable when Brevo omits a
 * timestamp — a null there must not make a row immortal.
 */
export async function pruneEmailEvents(db: D1Like, cutoffIso: string): Promise<void> {
  await db
    .prepare("DELETE FROM email_events WHERE received_at < ?")
    .bind(cutoffIso)
    .run();
}

/**
 * Subscriptions whose retention window has expired: unsubscribed longer ago than
 * the cutoff. Deliberately restricted to `status = 'unsubscribed'` — `blocked` rows
 * are the bounce/spam suppression state and must survive, as must
 * `email_suppressions` (kept while needed for deliverability).
 *
 * Batched like listPendingBrevoSync because each row costs a Brevo round-trip.
 */
export async function listPurgeableUnsubscribed(
  db: D1Like,
  cutoffIso: string,
  limit: number,
): Promise<DbSubscription[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
        WHERE status = 'unsubscribed' AND unsubscribed_at IS NOT NULL AND unsubscribed_at < ?
        ORDER BY unsubscribed_at ASC
        LIMIT ?`,
    )
    .bind(cutoffIso, limit)
    .all<DbSubscription>();
  return results;
}

/**
 * Subscriptions that were never confirmed and are past the confirmation window.
 *
 * Nothing else purges these: listPurgeableUnsubscribed only covers rows that
 * were confirmed and later withdrawn, so without this an address that subscribed
 * and never clicked the link would be retained forever — while the policy says
 * subscriber data is kept "amíg fel vagy iratkozva", and a pending row was never
 * a subscription.
 *
 * Keyed on subscribed_at, which the resubscribe branch of subscribeUpsert resets,
 * so an address that unsubscribes and signs up again gets a fresh window.
 */
export async function listPurgeablePending(
  db: D1Like,
  cutoffIso: string,
  limit: number,
): Promise<DbSubscription[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM subscriptions
        WHERE status = 'pending' AND subscribed_at < ?
        ORDER BY subscribed_at ASC
        LIMIT ?`,
    )
    .bind(cutoffIso, limit)
    .all<DbSubscription>();
  return results;
}

/** Hard-delete a subscription row. Only called once Brevo has dropped the contact. */
export async function deleteSubscription(db: D1Like, id: string): Promise<void> {
  await db.prepare("DELETE FROM subscriptions WHERE id = ?").bind(id).run();
}

// --- legacy re-permission campaign ---
//
// One-shot: see docs/newsletter-legacy-repermission.md. Everything below is
// deleted along with the table when the campaign is decommissioned, which is why
// it sits in one block rather than interleaved with the subscription queries.

export type LegacyContactStatus =
  | "pending"
  | "paused"
  | "invited"
  | "converted"
  | "declined"
  | "failed";

export interface DbLegacyContact {
  id: string;
  email: string;
  locale: string;
  status: LegacyContactStatus;
  invite_token: string | null;
  imported_at: string;
  invited_at: string | null;
  responded_at: string | null;
  send_attempts: number;
  last_error: string | null;
  brevo_message_id: string | null;
  subscription_id: string | null;
}

export async function getLegacyContactById(
  db: D1Like,
  id: string,
): Promise<DbLegacyContact | null> {
  return db
    .prepare("SELECT * FROM legacy_contacts WHERE id = ?")
    .bind(id)
    .first<DbLegacyContact>();
}

/**
 * The send worklist: imported-but-unmailed rows still under the attempt cap.
 *
 * The two NOT EXISTS clauses are the runtime safety net for addresses that
 * subscribed normally, or hard-bounced/complained, AFTER the import. The webhook
 * handler already writes email_suppressions on a bounce, so filtering here is
 * what closes the bounce feedback loop with no extra code: yesterday's bounces
 * suppress today's sends. Keeping the check in SQL (not in the caller) means it
 * cannot be forgotten by a future code path.
 *
 * Fewest attempts first so a few permanently-failing rows can't starve fresh ones
 * out of the LIMIT-bounded batch — same rationale as listPendingBrevoSync.
 */
export async function listSendableLegacyContacts(
  db: D1Like,
  maxAttempts: number,
  limit: number,
): Promise<DbLegacyContact[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM legacy_contacts
        WHERE status = 'pending' AND send_attempts < ?
          AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.email = legacy_contacts.email)
          AND NOT EXISTS (SELECT 1 FROM email_suppressions x WHERE x.email = legacy_contacts.email)
        ORDER BY send_attempts ASC, imported_at ASC
        LIMIT ?`,
    )
    .bind(maxAttempts, limit)
    .all<DbLegacyContact>();
  return results;
}

/**
 * Claim a row for sending (compare-and-swap) and mint its invite token. Returns
 * false when another cron tick already took it.
 *
 * This is what makes "exactly one email per address" true rather than merely
 * likely: overlapping ticks both read the same worklist, but only one UPDATE can
 * match `status = 'pending'`. Claiming BEFORE the send also means a crash between
 * claim and send loses that invite rather than risking a duplicate — for a
 * re-permission mail to a stale list, silence is the safer failure.
 */
export async function claimLegacyInvite(
  db: D1Like,
  id: string,
  inviteToken: string,
  now: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      `UPDATE legacy_contacts
         SET status = 'invited', invited_at = ?, invite_token = ?,
             send_attempts = send_attempts + 1, last_error = NULL
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, inviteToken, id)
    .run();
  return changesOf(res) === 1;
}

/** Record the Brevo messageId of the invite (webhook join key). */
export async function setLegacyMessageId(
  db: D1Like,
  id: string,
  messageId: string,
): Promise<void> {
  await db
    .prepare("UPDATE legacy_contacts SET brevo_message_id = ? WHERE id = ?")
    .bind(messageId, id)
    .run();
}

/**
 * Retryable send failure: back to 'pending' for the next tick. send_attempts was
 * already incremented by the claim, so the worklist's cap bounds how many copies
 * a Brevo-delivered-then-timed-out call can produce.
 */
export async function releaseLegacyInvite(
  db: D1Like,
  id: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE legacy_contacts
         SET status = 'pending', invited_at = NULL, invite_token = NULL, last_error = ?
       WHERE id = ?`,
    )
    .bind(error, id)
    .run();
}

/** Terminal send failure (a Brevo 4xx that retrying cannot fix). Needs a human. */
export async function failLegacyInvite(
  db: D1Like,
  id: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE legacy_contacts SET status = 'failed', invite_token = NULL, last_error = ? WHERE id = ?",
    )
    .bind(error, id)
    .run();
}

/**
 * The contact re-subscribed. The row is MARKED, not deleted: a second click (or a
 * double-submit, or a back-button resubmit) must still find it and answer
 * "already done" rather than 404 after the user just saw a success message. The
 * 90-day retention sweep collects it.
 *
 * Nulling invite_token is the single-use enforcement — verifyToken(x, null) is
 * false, so the emailed link stops working here rather than in a status check.
 */
export async function markLegacyConverted(
  db: D1Like,
  id: string,
  subscriptionId: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE legacy_contacts
         SET status = 'converted', responded_at = COALESCE(responded_at, ?),
             subscription_id = ?, invite_token = NULL
       WHERE id = ?`,
    )
    .bind(now, subscriptionId, id)
    .run();
}

/** The contact opted out. Same mark-don't-delete reasoning as markLegacyConverted. */
export async function markLegacyDeclined(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE legacy_contacts
         SET status = 'declined', responded_at = COALESCE(responded_at, ?), invite_token = NULL
       WHERE id = ?`,
    )
    .bind(now, id)
    .run();
}

/**
 * Legacy contacts past their retention window, in any status.
 *
 * Keyed on imported_at, not invited_at: the clock starts when the personal data
 * entered our systems, not when we got around to mailing it. That also means a
 * batch imported and then never sent still expires on schedule instead of sitting
 * here indefinitely — and, because the cron purges before it sends, such a row is
 * erased rather than cold-contacted three months late.
 */
export async function listPurgeableLegacyContacts(
  db: D1Like,
  cutoffIso: string,
  limit: number,
): Promise<DbLegacyContact[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM legacy_contacts
        WHERE imported_at < ?
        ORDER BY imported_at ASC
        LIMIT ?`,
    )
    .bind(cutoffIso, limit)
    .all<DbLegacyContact>();
  return results;
}

/** Hard-delete a legacy contact. Only called once Brevo has dropped the contact. */
export async function deleteLegacyContact(db: D1Like, id: string): Promise<void> {
  await db.prepare("DELETE FROM legacy_contacts WHERE id = ?").bind(id).run();
}
