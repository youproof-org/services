import { getSubscriptionById, unsubscribeSubscription } from "../lib/db";
import { json, redirect } from "../lib/http";
import { syncBrevoContact } from "../lib/sync";
import { homePath, siteUrl } from "../lib/urls";
import { verifyToken } from "../lib/tokens";
import type { Env } from "../types";

/**
 * Unsubscribe, split into a read-only landing and the write.
 *
 * This URL ships in the List-Unsubscribe header AND as the visible body link of
 * every email we send, which makes it the worst case for automated fetching:
 * a scanner that followed it used to unsubscribe the reader silently, on every
 * send, invisibly to both sides. RFC 8058 was written for exactly this — "mail
 * software sometimes fetches URLs in mail header fields, and thereby
 * accidentally triggers unsubscriptions" — and its answer is that only the POST
 * acts. So: GET asks, POST does.
 */

/**
 * GET /api/v1/newsletter/subscriptions/{id}/unsubscribe?token=…
 *
 * Read-only. The visible link in the email body lands here, and the confirmation
 * happens on the site.
 */
export async function handleUnsubscribeLanding(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const sub = await getSubscriptionById(env.DB, id);

  if (!sub || !verifyToken(token, sub.unsubscribe_token)) {
    return redirect(
      siteUrl(env, homePath(env, sub?.locale), { newsletter_unsubscribed: "error" }),
    );
  }

  // Already-unsubscribed and blocked rows get the prompt too; the POST is
  // idempotent and tells the reader the truth either way.
  return redirect(
    siteUrl(env, homePath(env, sub.locale), {
      newsletter_ask: "unsubscribe",
      sid: sub.id,
      stok: token!,
    }),
  );
}

/**
 * POST | DELETE /api/v1/newsletter/subscriptions/{id}/unsubscribe?token=…
 *
 * The actual opt-out, and the RFC 8058 one-click target. Soft-delete (row and
 * history retained), idempotent.
 */
export async function handleUnsubscribe(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  // DELIBERATELY NO ORIGIN CHECK — do not add one. RFC 8058 one-click requests
  // are issued by the mailbox provider's own infrastructure, cross-origin, with
  // no Origin we control; rejecting them would break Gmail/Yahoo one-click
  // unsubscribe and the bulk-sender requirements that depend on it. The 256-bit
  // token in the query string is the auth. Pinned by test/unsubscribe.test.mjs.
  const sub = await getSubscriptionById(env.DB, id);
  if (!sub || !verifyToken(url.searchParams.get("token"), sub.unsubscribe_token)) {
    return json({ code: "not_found" }, 404);
  }

  // Short-circuit AFTER the token check, unlike the confirm handler: the
  // unsubscribe token is never burned, so answering before verifying would hand
  // an unauthenticated caller a state oracle. One-click clients retry, and
  // without this each retry would reset brevo_synced_at and re-enqueue a
  // blacklist push the reconciliation may already have completed.
  if (sub.status === "unsubscribed") return json({ status: "unsubscribed" }, 200);

  const now = new Date().toISOString();
  await unsubscribeSubscription(env.DB, id, now);
  // Propagate out to Brevo (blacklist the contact) so campaign sends stop.
  // Best-effort: unsubscribeSubscription cleared the sync markers, so a failure
  // here is retried by the scheduled reconciliation (handlers/scheduled.ts).
  await syncBrevoContact(env, { ...sub, status: "unsubscribed" });

  // Never a redirect: RFC 8058 §3.2, "redirected POST actions have historically
  // not worked reliably".
  return json({ status: "unsubscribed" }, 200);
}
