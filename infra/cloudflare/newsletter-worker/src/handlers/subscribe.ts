import { json } from "../lib/http";
import type { Env } from "../types";

/**
 * POST /api/v1/newsletter/subscriptions
 *
 * Phase 2 will: validate Origin/Referer + Turnstile + rate limit, validate the
 * body, check the suppression list (bounce/spam history → `subscription_blocked`),
 * upsert by email, generate a confirm token, and send the Brevo confirmation
 * email pointing back to the originating page + form instance.
 */
export async function handleSubscribe(
  _request: Request,
  _env: Env,
  _url: URL,
): Promise<Response> {
  return json({ code: "not_implemented" }, 501);
}
