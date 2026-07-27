import { confirmSubscription, getSubscriptionById } from "../lib/db";
import { redirect } from "../lib/http";
import { syncConfirmedContact } from "../lib/sync";
import { homePath, siteUrl } from "../lib/urls";
import { verifyToken } from "../lib/tokens";
import type { Env } from "../types";

/**
 * GET /api/v1/newsletter/subscriptions/{id}/confirm?token=…
 *
 * Verify the confirm token, mark the subscription confirmed (idempotent), then
 * 302 back to the originating page so the frontend can scroll to the exact form
 * instance and show the confirmed state in place. Invalid/unknown → redirect to
 * the homepage with an error marker (we can't know the originating page).
 */
export async function handleConfirm(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const sub = await getSubscriptionById(env.DB, id);

  if (!sub || !verifyToken(token, sub.confirm_token)) {
    return redirect(siteUrl(env, homePath(env), { newsletter_confirmed: "invalid" }));
  }

  if (sub.status === "pending") {
    const now = new Date().toISOString();
    await confirmSubscription(env.DB, id, now);
    // Sync the confirmed contact into the Brevo list so it's eligible for future
    // campaign sends. Non-fatal: confirmation is already recorded in D1 (the
    // source of truth). A failure here is marked in D1 and retried by the
    // scheduled reconciliation (handlers/scheduled.ts) — it must not break the
    // user's landing.
    await syncConfirmedContact(env, sub);
  }

  // Blocked/unsubscribed rows should not resurrect via a stale confirm link.
  if (sub.status === "blocked" || sub.status === "unsubscribed") {
    return redirect(siteUrl(env, homePath(env, sub.locale), { newsletter_confirmed: "invalid" }));
  }

  const landing = sub.source_page ?? homePath(env, sub.locale);
  return redirect(
    siteUrl(env, landing, {
      newsletter_confirmed: sub.source_form_instance ?? "1",
      sid: sub.id,
    }),
  );
}
