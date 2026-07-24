import { json } from "../lib/http";
import type { Env } from "../types";

/**
 * GET | POST | DELETE /api/v1/newsletter/subscriptions/{id}/unsubscribe?token=…
 *
 * Reachable from the email's visible link (GET), RFC 8058 one-click
 * (POST, List-Unsubscribe-Post), and REST clients (DELETE). Auth is the
 * unguessable per-subscription unsubscribe token — no Turnstile/CSRF.
 *
 * Phase 2 will: verify the token, soft-delete (status=unsubscribed, retain the
 * row + history). GET → 302 to `/{locale}` homepage with `?newsletter_unsubscribed=1`;
 * POST/DELETE → 200.
 */
export async function handleUnsubscribe(
  _request: Request,
  _env: Env,
  _url: URL,
  _id: string,
  _method: string,
): Promise<Response> {
  return json({ code: "not_implemented" }, 501);
}
