import { json } from "../lib/http";
import type { Env } from "../types";

/**
 * POST /api/v1/newsletter/webhooks/brevo?token=…
 *
 * Brevo transactional webhook receiver. Brevo offers no HMAC signing, so auth is
 * the shared `?token=` secret (+ optional Brevo IP-range check). Handling must be
 * idempotent (keyed on message-id/email).
 *
 * Phase 2/3 will: verify the token, record the event in email_events, and on
 * hardBounce/spam upsert email_suppressions + set the subscription `blocked`
 * (with a Brevo blocklist backstop); on Brevo-side unsubscribed → soft-delete.
 * Always returns 200 once recorded to avoid Brevo retries.
 */
export async function handleWebhook(
  _request: Request,
  _env: Env,
  _url: URL,
): Promise<Response> {
  return json({ code: "not_implemented" }, 501);
}
