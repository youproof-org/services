import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { syncConfirmedContact } from "../src/lib/sync.ts";
import { subscribeUpsert, confirmSubscription, getSubscriptionByEmail } from "../src/lib/db.ts";
import { FakeD1, makeDeps } from "./helpers/fake-d1.mjs";

const input = {
  name: "Anna",
  email: "anna@example.com",
  locale: "hu",
  privacyAccepted: true,
  sourcePage: "/hu/cikkek/x",
  sourceFormInstance: "/hu/cikkek/x#pre-footer",
  turnstileToken: "t",
};

let fetchResult;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  fetchResult = () => new Response(JSON.stringify({ id: 1 }), { status: 201 });
  globalThis.fetch = async (url, init) => fetchResult(url, init);
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function seedConfirmed() {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, "2026-07-24T01:00:00.000Z");
  return { db, sub: c.subscription };
}

const env = (db) => ({ DB: db, BREVO_API_KEY: "k", BREVO_LIST_ID: "7", BREVO_SENDER_EMAIL: "s@x" });

test("success marks brevo_synced_at and clears error", async () => {
  const { db, sub } = await seedConfirmed();
  const ok = await syncConfirmedContact(env(db), sub);
  assert.equal(ok, true);
  const row = await getSubscriptionByEmail(db, input.email);
  assert.ok(row.brevo_synced_at, "synced timestamp set");
  assert.equal(row.brevo_sync_last_error, null);
});

test("failure records attempt + error and leaves synced null", async () => {
  const { db, sub } = await seedConfirmed();
  fetchResult = () => new Response("boom", { status: 500 });
  const ok = await syncConfirmedContact(env(db), sub);
  assert.equal(ok, false);
  const row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_synced_at, null);
  assert.equal(row.brevo_sync_attempts, 1);
  assert.match(row.brevo_sync_last_error, /500/);
});
