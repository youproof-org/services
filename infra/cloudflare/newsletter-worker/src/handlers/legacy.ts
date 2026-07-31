import { buildinfo } from "../buildinfo";
import {
  confirmSubscription,
  countRecentAttempts,
  getLegacyContactById,
  markLegacyConverted,
  markLegacyDeclined,
  recordSubscribeAttempt,
  subscribeUpsert,
} from "../lib/db";
import { json, redirect } from "../lib/http";
import { isAllowedOrigin } from "../lib/origin";
import { syncBrevoContact } from "../lib/sync";
import { verifyToken } from "../lib/tokens";
import { homePath, siteUrl } from "../lib/urls";
import { validateLegacyResubscribeBody } from "../lib/validate";
import type { Env } from "../types";

/**
 * Endpoints for the one-shot legacy re-permission campaign.
 * Runbook and rationale: docs/newsletter-legacy-repermission.md.
 *
 * The load-bearing property of this file is that NEITHER GET WRITES ANYTHING.
 * Every link here is mailed to an inbox, and inboxes are crawled: corporate mail
 * security scanners and Brevo's click tracker both fetch links before a human
 * ever sees them. So the resubscribe GET only validates and redirects, and the
 * decline GET only opens a confirmation dialog. A prefetch is a no-op, and the
 * invite survives for the real click.
 *
 * That is also why there is no short-lived "claim" token handed to the browser:
 * minting one would make the GET the one endpoint that writes, which is exactly
 * the endpoint that gets crawled. The invite token travels to the page instead,
 * where the frontend scrubs it from the URL with history.replaceState.
 */

// Per-IP only. The per-email cap that guards the public subscribe form is
// pointless here — the email is server-derived and the request already carries a
// 256-bit token that cannot be sprayed. The IP cap is retained purely because it
// reuses the existing ledger and costs nothing.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_IP = 20;

/** Where a legacy link sends the browser: the contact's locale homepage. */
function landing(env: Env, locale: string | null, params: Record<string, string>): Response {
  return redirect(siteUrl(env, homePath(env, locale), params));
}

/**
 * GET /api/v1/newsletter/legacy/{id}/resubscribe?token=…
 *
 * Read-only. Validates the invite and bounces the browser to the homepage, where
 * NewsletterLanding opens the popup that collects the name and the privacy
 * consent. The token rides along so the subsequent POST can re-verify it.
 */
export async function handleLegacyLanding(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const row = await getLegacyContactById(env.DB, id);

  if (!row || !verifyToken(token, row.invite_token)) {
    return landing(env, row?.locale ?? null, { newsletter_legacy: "invalid" });
  }

  return landing(env, row.locale, {
    newsletter_legacy: "1",
    lid: row.id,
    ltok: token!,
  });
}

/**
 * GET /api/v1/newsletter/legacy/{id}/decline?token=…
 *
 * Read-only, and deliberately so: a scanner that followed a one-click opt-out
 * would silently decline on the recipient's behalf and we would never know. This
 * only opens a confirmation dialog; the POST below is what actually declines.
 */
export async function handleLegacyDeclineLanding(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const row = await getLegacyContactById(env.DB, id);

  if (!row || !verifyToken(token, row.invite_token)) {
    return landing(env, row?.locale ?? null, { newsletter_legacy: "invalid" });
  }

  return landing(env, row.locale, {
    newsletter_legacy: "decline",
    lid: row.id,
    ltok: token!,
  });
}

/**
 * POST | DELETE /api/v1/newsletter/legacy/{id}/decline?token=…
 *
 * The real opt-out, and the RFC 8058 one-click List-Unsubscribe target (which is
 * specified as a POST, so the header and the anti-scanner stance agree).
 */
export async function handleLegacyDecline(
  _request: Request,
  env: Env,
  url: URL,
  id: string,
): Promise<Response> {
  const token = url.searchParams.get("token");
  const row = await getLegacyContactById(env.DB, id);

  if (!row) return json({ code: "not_found" }, 404);
  // Repeating a decline is a success, not an error: one-click clients retry.
  if (row.status === "declined") return json({ status: "declined" }, 200);
  if (!verifyToken(token, row.invite_token)) return json({ code: "not_found" }, 404);

  await markLegacyDeclined(env.DB, id, new Date().toISOString());
  return json({ status: "declined" }, 200);
}

/**
 * POST /api/v1/newsletter/legacy/{id}/resubscribe
 * Body: { token, name, privacyAccepted }
 *
 * Turns a legacy contact into a fully-consented, confirmed subscriber in one
 * step. There is no second double-opt-in email: the invite link they just
 * followed already proved they control the mailbox, and the popup supplied the
 * two things the legacy list lacked — a name and an explicit acceptance of the
 * privacy policy, recorded against the content SHA like any other subscriber.
 */
export async function handleLegacyResubscribe(
  request: Request,
  env: Env,
  _url: URL,
  id: string,
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

  const result = validateLegacyResubscribeBody(body);
  if (!result.ok) {
    return json({ code: "validation_error", errors: result.errors }, 400);
  }

  const clientIp = request.headers.get("CF-Connecting-IP");
  if (clientIp) {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const ipCount = await countRecentAttempts(env.DB, "client_ip", clientIp, windowStart);
    if (ipCount >= MAX_PER_IP) return json({ code: "rate_limited" }, 429);
    await recordSubscribeAttempt(env.DB, null, clientIp, new Date().toISOString());
  }

  const row = await getLegacyContactById(env.DB, id);
  if (!row) return json({ code: "not_found" }, 404);

  // Answer BEFORE the token check: converting nulls the token, so a double-click,
  // a second tab or a back-button resubmit would otherwise 404 immediately after
  // the user was shown a success message.
  if (row.status === "converted") return json({ status: "confirmed" }, 200);
  if (row.status === "declined") return json({ code: "not_found" }, 404);

  if (!verifyToken(result.value.token, row.invite_token)) {
    return json({ code: "not_found" }, 404);
  }

  const outcome = await subscribeUpsert(
    env.DB,
    {
      name: result.value.name,
      email: row.email,
      locale: row.locale,
      sourcePage: homePath(env, row.locale),
      sourceFormInstance: "legacy-repermission",
    },
    buildinfo.contentSha,
  );

  if (outcome.kind === "blocked") {
    // Bounced or complained since the import. Retire the legacy row so it stops
    // appearing anywhere, and tell the user plainly.
    await markLegacyDeclined(env.DB, id, new Date().toISOString());
    return json({ code: "subscription_blocked" }, 409);
  }

  const sub = outcome.subscription;
  const now = new Date().toISOString();
  // No-op when the row is already confirmed (they also used the normal form).
  await confirmSubscription(env.DB, sub.id, now);
  // Non-fatal: D1 is the source of truth and the scheduled reconciliation retries
  // a failed list-add, exactly as it does after an ordinary confirmation.
  await syncBrevoContact(env, { ...sub, status: "confirmed" });

  // Last, so a failure here leaves a correctly-subscribed person plus a stale
  // legacy row — which the send worklist already ignores (it excludes any address
  // present in `subscriptions`) and the retention sweep collects.
  await markLegacyConverted(env.DB, id, sub.id, now);

  return json({ status: "confirmed" }, 200);
}
