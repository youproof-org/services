import { buildinfo } from "../buildinfo";
import { sendTransactionalEmail } from "../lib/brevo";
import {
  countRecentAttempts,
  recordSubscribeAttempt,
  setBrevoMessageId,
  subscribeUpsert,
} from "../lib/db";
import { buildConfirmationEmail } from "../lib/email";
import { json } from "../lib/http";
import { isAllowedOrigin } from "../lib/origin";
import { verifyTurnstile } from "../lib/turnstile";
import { confirmUrl, unsubscribeUrl } from "../lib/urls";
import { validateSubscribeBody } from "../lib/validate";
import type { Env } from "../types";
import type { SubscribeOutcome } from "../lib/db";

// Rate-limit window and caps (per rolling hour), keyed on client IP and email.
// The per-IP cap allows for shared NAT; the per-email cap curbs targeting one
// address. Both are backed by the subscribe_attempts ledger in D1.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 5;

/**
 * POST /api/v1/newsletter/subscriptions
 *
 * Abuse-gated (Origin allowlist + rate limit + Turnstile — the anti-forgery/bot
 * layer for a session-less static site) validate + upsert + suppression gate,
 * then send/resend the double-opt-in email. The response is uniform ("pending")
 * for created/updated/resubscribed so it never reveals whether an email is
 * already subscribed; only the suppressed case is distinct.
 */
export async function handleSubscribe(
  request: Request,
  env: Env,
  _url: URL,
): Promise<Response> {
  if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
    return json({ code: "forbidden_origin" }, 403);
  }

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

  // Rate limit (cheap D1 counts) before spending a Turnstile verification.
  const clientIp = request.headers.get("CF-Connecting-IP");
  const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const [ipCount, emailCount] = await Promise.all([
    clientIp
      ? countRecentAttempts(env.DB, "client_ip", clientIp, windowStart)
      : Promise.resolve(0),
    countRecentAttempts(env.DB, "email", result.value.email, windowStart),
  ]);
  if ((clientIp && ipCount >= MAX_PER_IP) || emailCount >= MAX_PER_EMAIL) {
    return json({ code: "rate_limited" }, 429);
  }
  await recordSubscribeAttempt(env.DB, result.value.email, clientIp, new Date().toISOString());

  // Turnstile proves a human submitted our form (fails closed on any error).
  if (!(await verifyTurnstile(env, result.value.turnstileToken, clientIp))) {
    return json({ code: "turnstile_failed" }, 403);
  }

  const outcome = await subscribeUpsert(env.DB, result.value, buildinfo.contentSha);

  if (outcome.kind === "blocked") {
    // Distinct, identifiable outcome so the frontend shows an explicit
    // "resubscription not accepted" message (planfile §3.3).
    return json({ code: "subscription_blocked" }, 409);
  }

  // Send the confirmation email for a new/resubscribed record, and re-send when
  // an existing record is still pending (the user may have lost the first one).
  if (needsConfirmationEmail(outcome)) {
    const sub = outcome.subscription;
    const confirm = confirmUrl(env, sub.id, sub.confirm_token!);
    const unsubscribe = unsubscribeUrl(env, sub.id, sub.unsubscribe_token);
    const email = buildConfirmationEmail({ name: sub.name, confirmUrl: confirm, unsubscribeUrl: unsubscribe });
    try {
      const { messageId } = await sendTransactionalEmail(env, {
        toEmail: sub.email,
        toName: sub.name,
        subject: email.subject,
        htmlContent: email.htmlContent,
        textContent: email.textContent,
        listUnsubscribeUrl: unsubscribe,
      });
      if (messageId) {
        await setBrevoMessageId(env.DB, sub.id, messageId, new Date().toISOString());
      }
    } catch (err) {
      // The record is persisted as pending; a retry is idempotent and re-sends.
      console.error("newsletter confirmation send failed", err);
      return json({ code: "send_failed" }, 502);
    }
  }

  return json({ status: "pending" }, 202);
}

function needsConfirmationEmail(outcome: SubscribeOutcome): boolean {
  if (outcome.kind === "created" || outcome.kind === "resubscribed") return true;
  return outcome.kind === "updated" && outcome.subscription.status === "pending";
}
