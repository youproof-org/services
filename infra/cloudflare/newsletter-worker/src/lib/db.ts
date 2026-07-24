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
}

interface D1Like {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
      all<T = unknown>(): Promise<{ results: T[] }>;
    };
  };
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

/** Soft-delete: retain the row + history, flip to unsubscribed. Idempotent. */
export async function unsubscribeSubscription(
  db: D1Like,
  id: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE subscriptions
         SET status = 'unsubscribed', unsubscribed_at = COALESCE(unsubscribed_at, ?), updated_at = ?
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
  input: SubscribeInput,
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
             updated_at = ?
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
    },
  };
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
