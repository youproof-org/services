/**
 * Reconcile a subscription's state OUT to Brevo and record the outcome in D1.
 * The desired Brevo state is derived from the row's status:
 *   - confirmed   → contact in the list + emailBlacklisted:false (eligible for
 *                   campaigns; also reactivates a re-confirmed resubscriber)
 *   - unsubscribed → emailBlacklisted:true (excluded from campaigns)
 * Used at confirmation time, at unsubscribe time (both best-effort), and by the
 * scheduled reconciliation (handlers/scheduled.ts) which retries rows left
 * unsynced. Never throws — the caller's flow (a redirect, a cron batch) continues.
 */
import { setEmailBlacklisted, upsertContact } from "./brevo";
import { markContactSynced, recordContactSyncFailure } from "./db";
import type { DbSubscription } from "./db";
import type { Env } from "../types";

export async function syncBrevoContact(
  env: Env,
  sub: Pick<DbSubscription, "id" | "email" | "name" | "status">,
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    if (sub.status === "confirmed") {
      await upsertContact(env, { email: sub.email, name: sub.name, extId: sub.id });
    } else if (sub.status === "unsubscribed") {
      await setEmailBlacklisted(env, sub.email);
    } else {
      // pending/blocked own no reconciled Brevo state here; nothing to do.
      return true;
    }
    await markContactSynced(env.DB, sub.id, now);
    return true;
  } catch (err) {
    console.error("newsletter Brevo sync failed", sub.status, sub.id, err);
    await recordContactSyncFailure(env.DB, sub.id, String(err), now);
    return false;
  }
}
