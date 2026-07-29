/**
 * Minimal Brevo (formerly Sendinblue) REST client — plain fetch, no SDK.
 * Base URL https://api.brevo.com/v3, auth via the `api-key` header. We use Brevo
 * only to SEND the double-opt-in email and to SYNC confirmed contacts into a
 * list; all subscription state lives in D1. Delivery/bounce/spam come back via
 * the webhook (see handlers/webhook.ts).
 */
import type { Env } from "../types";

const BREVO_BASE = "https://api.brevo.com/v3";
const SENDER_NAME = "youproof.org";

export class BrevoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "BrevoError";
  }
}

function headers(env: Env): Record<string, string> {
  return {
    "api-key": env.BREVO_API_KEY,
    "content-type": "application/json",
    accept: "application/json",
  };
}

export interface TransactionalEmail {
  toEmail: string;
  toName: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  /** Our own tokenized unsubscribe URL, surfaced in the List-Unsubscribe header. */
  listUnsubscribeUrl: string;
}

/**
 * Send a single transactional email. Returns Brevo's messageId (the webhook
 * join key). We also set our own List-Unsubscribe / one-click header — note
 * Brevo injects its own List-Unsubscribe too, so whether ours wins vs.
 * duplicates is verified against a live account (see docs/newsletter.md); the
 * body always carries a visible unsubscribe link we fully control.
 */
export async function sendTransactionalEmail(
  env: Env,
  msg: TransactionalEmail,
): Promise<{ messageId: string }> {
  const res = await fetch(`${BREVO_BASE}/smtp/email`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: msg.toEmail, name: msg.toName }],
      subject: msg.subject,
      htmlContent: msg.htmlContent,
      textContent: msg.textContent,
      headers: {
        "List-Unsubscribe": `<${msg.listUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      tags: ["newsletter-doi"],
    }),
  });
  if (!res.ok) {
    throw new BrevoError(
      `Brevo send failed (${res.status})`,
      res.status,
      await safeBody(res),
    );
  }
  const data = (await res.json()) as { messageId?: string };
  return { messageId: data.messageId ?? "" };
}

/**
 * Verify a Brevo list id exists. 404 → throw (misconfigured BREVO_LIST_ID);
 * other non-2xx → throw (transient — the caller retries via reconciliation).
 * Not memoized: it runs only on the confirm/reconcile path (never on subscribe),
 * so one extra GET per confirmation is negligible.
 */
async function ensureListExists(env: Env, listId: number): Promise<void> {
  const res = await fetch(`${BREVO_BASE}/contacts/lists/${listId}`, {
    headers: headers(env),
  });
  if (res.status === 404) {
    throw new BrevoError(
      `BREVO_LIST_ID ${listId} does not exist in Brevo`,
      404,
      await safeBody(res),
    );
  }
  if (!res.ok) {
    throw new BrevoError(`Brevo list check failed (${res.status})`, res.status, await safeBody(res));
  }
}

/**
 * Upsert a contact and add it to the newsletter list (idempotent via
 * updateEnabled). Called on confirmation so the contact becomes eligible for
 * future campaign sends. ext_id carries our D1 id; the single "how may I
 * address you" name maps to FNAME. No-op if no list id is configured.
 *
 * Sets `emailBlacklisted: false` so a re-confirmed subscriber (who had
 * previously unsubscribed, and was therefore blacklisted in Brevo) is
 * REACTIVATED — otherwise they'd be re-added to the list but silently excluded
 * from all sends. Safe: bounce/spam-suppressed emails are rejected at subscribe
 * (409) long before they reach confirm, so this only reactivates voluntary
 * resubscribers.
 */
export async function upsertContact(
  env: Env,
  args: { email: string; name: string; extId: string },
): Promise<void> {
  const listId = Number.parseInt(env.BREVO_LIST_ID, 10);
  const body: Record<string, unknown> = {
    email: args.email,
    ext_id: args.extId,
    attributes: { FNAME: args.name },
    updateEnabled: true,
    emailBlacklisted: false,
  };
  if (Number.isFinite(listId)) {
    // Verify the configured list actually exists FIRST. Brevo silently accepts a
    // contact upsert with a non-existent listId (2xx, list assignment ignored),
    // which would otherwise mark the row "synced" while the contact never joins a
    // list. Throwing here surfaces a misconfigured BREVO_LIST_ID as a failed sync
    // → reconciled + alerted, instead of silently dropping subscribers.
    await ensureListExists(env, listId);
    body.listIds = [listId];
  }

  const res = await fetch(`${BREVO_BASE}/contacts`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify(body),
  });
  // 201 created or 204 updated are both success.
  if (!res.ok && res.status !== 204) {
    throw new BrevoError(
      `Brevo contact upsert failed (${res.status})`,
      res.status,
      await safeBody(res),
    );
  }
}

/**
 * Mark an address `emailBlacklisted: true` in Brevo — i.e. unsubscribed from all
 * campaign sends. Used for BOTH a voluntary unsubscribe (propagating our
 * D1 soft-delete out to Brevo, since our List-Unsubscribe points at our own
 * endpoint and bypasses Brevo) AND as a backstop to Brevo's auto-suppression on
 * hard bounce / spam. D1 stays authoritative; callers treat failures as
 * non-fatal. A 404 (contact doesn't exist in Brevo — e.g. unsubscribing a
 * never-confirmed pending row) is treated as success: nothing to suppress.
 */
export async function setEmailBlacklisted(env: Env, email: string): Promise<void> {
  const res = await fetch(`${BREVO_BASE}/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: headers(env),
    body: JSON.stringify({ emailBlacklisted: true }),
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new BrevoError(
      `Brevo blacklist failed (${res.status})`,
      res.status,
      await safeBody(res),
    );
  }
}

/**
 * Permanently delete a contact from Brevo. Used by the retention purge: once a
 * subscription's retention window expires we erase the address from BOTH stores,
 * so blacklisting (which merely stops sends) isn't enough — the contact itself has
 * to go, or the email would outlive its own retention period in Brevo.
 *
 * 404 is success: a row that never confirmed never became a contact, and a repeat
 * purge attempt after a partial failure should converge rather than jam.
 *
 * Note this also drops the address from Brevo's blocklist. Harmless here, because
 * only `unsubscribed` rows are ever purged — bounce/spam addresses are `blocked`,
 * kept in our own email_suppressions, and rejected at subscribe long before any
 * Brevo call.
 */
export async function deleteContact(env: Env, email: string): Promise<void> {
  const res = await fetch(`${BREVO_BASE}/contacts/${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: headers(env),
  });
  // 204 No Content on success; 200 tolerated in case Brevo echoes a body.
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new BrevoError(
      `Brevo contact delete failed (${res.status})`,
      res.status,
      await safeBody(res),
    );
  }
}

/**
 * Send a plain-text operational alert to the admin address via the same
 * transactional API. No-op if ALERT_EMAIL is unset. Best-effort — the caller
 * treats failures as non-fatal (they're already in an error path).
 */
export async function sendAdminAlert(
  env: Env,
  subject: string,
  text: string,
): Promise<void> {
  if (!env.ALERT_EMAIL) return;
  const res = await fetch(`${BREVO_BASE}/smtp/email`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: SENDER_NAME },
      to: [{ email: env.ALERT_EMAIL }],
      subject,
      textContent: text,
      tags: ["newsletter-ops-alert"],
    }),
  });
  if (!res.ok) {
    throw new BrevoError(`Brevo alert send failed (${res.status})`, res.status, await safeBody(res));
  }
}

/** Category of a Brevo transactional webhook event that drives a state change. */
export type BrevoEventKind = "bounce" | "spam" | "unsubscribe" | "other";

/**
 * Classify a raw Brevo event string. Case/format varies between Brevo surfaces
 * (`hard_bounce` vs `hardBounce`), so we normalize to letters-only first. Only
 * HARD bounces suppress; soft bounces are transient → "other" (recorded only).
 */
export function classifyBrevoEvent(event: string): BrevoEventKind {
  const e = event.toLowerCase().replace(/[^a-z]/g, "");
  if (e.includes("hardbounce")) return "bounce";
  if (e.includes("spam")) return "spam";
  if (e.includes("unsubscrib")) return "unsubscribe";
  return "other";
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
