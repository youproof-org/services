import { getSubscriptionById, unsubscribeSubscription } from "../lib/db";
import { json, redirect } from "../lib/http";
import { homePath, siteUrl } from "../lib/urls";
import { verifyToken } from "../lib/tokens";
import type { Env } from "../types";

/**
 * GET | POST | DELETE /api/v1/newsletter/subscriptions/{id}/unsubscribe?token=…
 *
 * Auth is the unguessable per-subscription unsubscribe token (no Turnstile/CSRF):
 * GET is the visible email link, POST is RFC 8058 one-click, DELETE is the REST
 * verb. Soft-delete (retain row + history), idempotent. GET redirects to the
 * subscription's own locale homepage; POST/DELETE return JSON.
 */
export async function handleUnsubscribe(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
  method: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const sub = await getSubscriptionById(env.DB, id);
  const valid = sub !== null && verifyToken(token, sub.unsubscribe_token);

  if (valid) {
    const now = new Date().toISOString();
    await unsubscribeSubscription(env.DB, id, now);
    if (method === "GET") {
      return redirect(siteUrl(env, homePath(env, sub.locale), { newsletter_unsubscribed: "1" }));
    }
    return json({ status: "unsubscribed" }, 200);
  }

  if (method === "GET") {
    return redirect(siteUrl(env, homePath(env), { newsletter_unsubscribed: "error" }));
  }
  return json({ code: "not_found" }, 404);
}
