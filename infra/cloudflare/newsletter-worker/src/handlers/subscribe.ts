import { buildinfo } from "../buildinfo";
import { subscribeUpsert } from "../lib/db";
import { json } from "../lib/http";
import { validateSubscribeBody } from "../lib/validate";
import type { Env } from "../types";

/**
 * POST /api/v1/newsletter/subscriptions
 *
 * Phase 2: validate + upsert by email + suppression gate. The Turnstile check +
 * rate limiting (Phase 4) and the Brevo confirmation-email send (Phase 3) attach
 * where marked; until then a created/resubscribed record is persisted as pending
 * but no email is sent.
 */
export async function handleSubscribe(
  request: Request,
  env: Env,
  _url: URL,
): Promise<Response> {
  // TODO(phase 4): Origin/Referer allowlist (env.ALLOWED_ORIGINS) + Turnstile
  // verify (env.TURNSTILE_SECRET) + per-email/IP rate limiting before parsing.

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: "invalid_request" }, 400);
  }

  const result = validateSubscribeBody(body);
  if (!result.ok) {
    return json({ code: "validation_error", errors: result.errors }, 400);
  }

  const outcome = await subscribeUpsert(env.DB, result.value, buildinfo.contentSha);

  if (outcome.kind === "blocked") {
    // Distinct, identifiable outcome so the frontend shows an explicit
    // "resubscription not accepted" message (planfile §3.3) — never a silent
    // success/pending state.
    return json({ code: "subscription_blocked" }, 409);
  }

  // TODO(phase 3): for created | resubscribed, send the Brevo confirmation email
  // to outcome.subscription with a confirm link carrying confirm_token, then
  // persist the returned messageId (setBrevoMessageId).

  // `updated` reflects an already-active record (pending or confirmed); created
  // and resubscribed are always pending. Return the actual status so the form
  // can render the right state.
  return json({ status: outcome.subscription.status }, 202);
}
