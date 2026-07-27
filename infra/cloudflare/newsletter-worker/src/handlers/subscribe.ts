import { buildinfo } from "../buildinfo";
import { sendTransactionalEmail } from "../lib/brevo";
import { setBrevoMessageId, subscribeUpsert } from "../lib/db";
import { buildConfirmationEmail } from "../lib/email";
import { json } from "../lib/http";
import { isAllowedOrigin } from "../lib/origin";
import { confirmUrl, unsubscribeUrl } from "../lib/urls";
import { validateSubscribeBody } from "../lib/validate";
import type { Env } from "../types";
import type { SubscribeOutcome } from "../lib/db";

/**
 * POST /api/v1/newsletter/subscriptions
 *
 * Origin-checked (CSRF-equivalent for a static site) validate + upsert +
 * suppression gate, then send/resend the double-opt-in email. The response is
 * uniform ("pending") for created/updated/resubscribed so it never reveals
 * whether an email is already subscribed; only the suppressed case is distinct.
 *
 * TODO(phase 4): Turnstile verify (env.TURNSTILE_SECRET) + per-email/IP rate
 * limiting, added after the origin check below.
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
