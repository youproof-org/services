import { blocklistContact, classifyBrevoEvent } from "../lib/brevo";
import {
  insertEmailEvent,
  setBlockedByEmail,
  unsubscribeByEmail,
  upsertSuppression,
} from "../lib/db";
import { json } from "../lib/http";
import { verifyToken } from "../lib/tokens";
import { normalizeEmail } from "../lib/validate";
import type { Env } from "../types";

/**
 * POST /api/v1/newsletter/webhooks/brevo?token=…
 *
 * Brevo transactional webhook receiver. Brevo offers no HMAC signing, so auth is
 * the shared `?token=` secret (constant-time compared). Handling is idempotent
 * (email_events dedups on (message_id, event)); we always return 200 once the
 * request is authenticated so Brevo doesn't retry a recorded event.
 *
 * hard bounce / spam → suppress the email (survives across records) + mark all
 * its subscriptions blocked + best-effort Brevo blocklist. Brevo-side
 * unsubscribe → soft-delete. Everything else is recorded only.
 */
export async function handleWebhook(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (!verifyToken(url.searchParams.get("token"), env.BREVO_WEBHOOK_TOKEN)) {
    return json({ code: "unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ code: "invalid_request" }, 400);
  }

  const event = String(payload.event ?? "");
  const email = normalizeEmail(String(payload.email ?? ""));
  if (!event || !email) return json({ ok: true }, 200); // nothing actionable; ack

  const messageId = payload["message-id"] ? String(payload["message-id"]) : null;
  const reason = payload.reason ? String(payload.reason) : null;
  const occurredAt = occurredAtOf(payload);
  const now = new Date().toISOString();

  await insertEmailEvent(env.DB, {
    email,
    messageId,
    event,
    reason,
    occurredAt,
    raw: JSON.stringify(payload).slice(0, 4000),
    receivedAt: now,
  });

  const kind = classifyBrevoEvent(event);
  if (kind === "bounce" || kind === "spam") {
    await upsertSuppression(env.DB, email, kind, now);
    await setBlockedByEmail(env.DB, email, now);
    // Platform-level backstop; D1 is authoritative, so failures are non-fatal.
    try {
      await blocklistContact(env, email);
    } catch (err) {
      console.error("newsletter Brevo blocklist failed", err);
    }
  } else if (kind === "unsubscribe") {
    await unsubscribeByEmail(env.DB, email, now);
  }

  return json({ ok: true }, 200);
}

/** Prefer Brevo's UTC epoch fields over the local `date` string. */
function occurredAtOf(payload: Record<string, unknown>): string | null {
  if (typeof payload.ts_epoch === "number") {
    return new Date(payload.ts_epoch).toISOString();
  }
  if (typeof payload.ts_event === "number") {
    return new Date(payload.ts_event * 1000).toISOString();
  }
  return null;
}
