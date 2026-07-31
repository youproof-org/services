import { confirmSubscription, getSubscriptionById } from "../lib/db";
import { json, redirect } from "../lib/http";
import { isAllowedOrigin } from "../lib/origin";
import { syncBrevoContact } from "../lib/sync";
import { homePath, siteUrl } from "../lib/urls";
import { verifyToken } from "../lib/tokens";
import type { Env } from "../types";

/**
 * Double-opt-in confirmation, split into a read-only landing and the write.
 *
 * THE GET WRITES NOTHING, and must stay that way. Mail-security gateways fetch
 * every link in an inbox before a human sees it, and RFC 8058 is blunt that
 * there is "no mechanical way for a sender to tell whether a request was made
 * automatically by anti-spam software or manually requested by a user" — so
 * header sniffing is not an option. A GET that confirmed would let a scanner
 * manufacture the proof of mailbox control that the double opt-in exists to
 * establish: the consent itself is recorded at the form (privacy checkbox,
 * Turnstile, privacy_content_sha), but it would be unverified.
 *
 * Detonation sandboxes render pages, so an auto-submitting page would not help
 * either; they do not fill in and submit forms, so the button does.
 */

/**
 * GET /api/v1/newsletter/subscriptions/{id}/confirm?token=…
 *
 * Read-only. Validates and bounces the reader back to the page they subscribed
 * from, where a one-button dialog issues the POST below.
 */
export async function handleConfirmLanding(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const sub = await getSubscriptionById(env.DB, id);

  const invalid = () =>
    redirect(siteUrl(env, homePath(env, sub?.locale), { newsletter_confirmed: "invalid" }));

  if (!sub || !verifyToken(token, sub.confirm_token)) return invalid();
  // A stale link must not resurrect a withdrawn or suppressed subscription.
  if (sub.status === "blocked" || sub.status === "unsubscribed") return invalid();

  // An already-confirmed row gets the same prompt as a pending one: the output
  // stays a pure function of (row, token), and the POST answers "already done"
  // with a 200 anyway.
  return redirect(
    siteUrl(env, sub.source_page ?? homePath(env, sub.locale), {
      newsletter_ask: "confirm",
      sid: sub.id,
      stok: token!,
      // Lets the dialog hand the reader back to the exact form instance they
      // used. Omitted rather than empty when unknown, so the dialog can tell.
      ...(sub.source_form_instance ? { sform: sub.source_form_instance } : {}),
    }),
  );
}

/**
 * POST /api/v1/newsletter/subscriptions/{id}/confirm?token=…
 *
 * The actual confirmation. Bodyless — the token rides in the query string, as
 * it already does for every other tokenized endpoint here.
 */
export async function handleConfirm(
  request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  // Browser-only, unlike the unsubscribe POST which must stay open to mailbox
  // providers. Defence in depth on top of the token.
  if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
    return json({ code: "forbidden_origin" }, 403);
  }

  const sub = await getSubscriptionById(env.DB, id);
  if (!sub) return json({ code: "not_found" }, 404);

  // Answer settled states BEFORE the token check, so a double submit or a second
  // tab reports success rather than an error right after the reader was told it
  // worked. (Same reasoning as the legacy converted/declined short-circuits.)
  if (sub.status === "confirmed") return json({ status: "confirmed" }, 200);
  if (sub.status === "blocked") return json({ code: "subscription_blocked" }, 409);
  if (sub.status === "unsubscribed") return json({ code: "subscription_unsubscribed" }, 409);

  if (!verifyToken(url.searchParams.get("token"), sub.confirm_token)) {
    return json({ code: "not_found" }, 404);
  }

  const now = new Date().toISOString();
  await confirmSubscription(env.DB, id, now);
  // Sync the confirmed contact into the Brevo list so it's eligible for future
  // campaign sends. Non-fatal: confirmation is already recorded in D1 (the
  // source of truth). A failure here is marked in D1 and retried by the
  // scheduled reconciliation (handlers/scheduled.ts).
  await syncBrevoContact(env, { ...sub, status: "confirmed" });

  return json({ status: "confirmed" }, 200);
}
