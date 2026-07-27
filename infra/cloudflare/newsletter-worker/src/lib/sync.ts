/**
 * Sync a confirmed subscriber into the Brevo contact list and record the outcome
 * in D1. Used both at confirmation time (best-effort) and by the scheduled
 * reconciliation (handlers/scheduled.ts), which retries rows left unsynced.
 * Never throws — the caller's flow (a redirect, or a cron batch) must continue.
 */
import { upsertContact } from "./brevo";
import { markContactSynced, recordContactSyncFailure } from "./db";
import type { DbSubscription } from "./db";
import type { Env } from "../types";

export async function syncConfirmedContact(
  env: Env,
  sub: Pick<DbSubscription, "id" | "email" | "name">,
): Promise<boolean> {
  const now = new Date().toISOString();
  try {
    await upsertContact(env, { email: sub.email, name: sub.name, extId: sub.id });
    await markContactSynced(env.DB, sub.id, now);
    return true;
  } catch (err) {
    console.error("newsletter Brevo contact sync failed", sub.id, err);
    await recordContactSyncFailure(env.DB, sub.id, String(err), now);
    return false;
  }
}
