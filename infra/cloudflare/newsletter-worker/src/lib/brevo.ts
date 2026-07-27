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
 * Upsert a contact and add it to the newsletter list (idempotent via
 * updateEnabled). Called on confirmation so the contact becomes eligible for
 * future campaign sends. ext_id carries our D1 id; the single "how may I
 * address you" name maps to FNAME. No-op if no list id is configured.
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
  };
  if (Number.isFinite(listId)) body.listIds = [listId];

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
 * Best-effort blocklist of an address at the Brevo platform level, as a backstop
 * to Brevo's own auto-suppression of hard bounces / spam complaints. D1 remains
 * the authoritative suppression store; failures here are logged, not fatal.
 */
export async function blocklistContact(env: Env, email: string): Promise<void> {
  const res = await fetch(`${BREVO_BASE}/contacts/${encodeURIComponent(email)}`, {
    method: "PUT",
    headers: headers(env),
    body: JSON.stringify({ emailBlacklisted: true }),
  });
  if (!res.ok && res.status !== 204) {
    throw new BrevoError(
      `Brevo blocklist failed (${res.status})`,
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
