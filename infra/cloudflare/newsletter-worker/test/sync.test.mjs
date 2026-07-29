import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { syncBrevoContact } from "../src/lib/sync.ts";
import {
  subscribeUpsert,
  confirmSubscription,
  unsubscribeSubscription,
  getSubscriptionByEmail,
} from "../src/lib/db.ts";
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

const env = (db) => ({ DB: db, BREVO_API_KEY: "k", BREVO_LIST_ID: "7", BREVO_SENDER_EMAIL: "s@x" });

async function seedConfirmed() {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, "2026-07-24T01:00:00.000Z");
  const sub = await getSubscriptionByEmail(db, input.email); // status: confirmed
  return { db, sub };
}

test("confirmed → upsert marks synced and clears error", async () => {
  const { db, sub } = await seedConfirmed();
  const ok = await syncBrevoContact(env(db), sub);
  assert.equal(ok, true);
  const row = await getSubscriptionByEmail(db, input.email);
  assert.ok(row.brevo_synced_at, "synced timestamp set");
  assert.equal(row.brevo_sync_last_error, null);
});

test("confirmed → failure records attempt + error, leaves synced null", async () => {
  const { db, sub } = await seedConfirmed();
  fetchResult = () => new Response("boom", { status: 500 });
  const ok = await syncBrevoContact(env(db), sub);
  assert.equal(ok, false);
  const row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_synced_at, null);
  assert.equal(row.brevo_sync_attempts, 1);
  assert.match(row.brevo_sync_last_error, /500/);
});

test("confirmed → non-existent Brevo list (404) fails, NOT silently synced", async () => {
  const { db, sub } = await seedConfirmed();
  // Brevo 404s the list-existence GET; the contact POST must never mark synced.
  fetchResult = (url) =>
    new Response("no", { status: String(url).includes("/contacts/lists/") ? 404 : 201 });
  const ok = await syncBrevoContact(env(db), sub);
  assert.equal(ok, false);
  const row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_synced_at, null, "misconfigured list is a failure, not a silent success");
  assert.match(row.brevo_sync_last_error, /does not exist|404/);
});

test("unsubscribed → blacklist marks synced", async () => {
  const { db, sub } = await seedConfirmed();
  await unsubscribeSubscription(db, sub.id, "2026-07-24T02:00:00.000Z"); // status: unsubscribed, markers cleared
  const row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.status, "unsubscribed");
  assert.equal(row.brevo_synced_at, null, "unsubscribe enqueued a Brevo propagation");

  const ok = await syncBrevoContact(env(db), row);
  assert.equal(ok, true);
  assert.ok((await getSubscriptionByEmail(db, input.email)).brevo_synced_at, "propagation marked synced");
});

test("unsubscribed → Brevo 404 (contact absent) is tolerated as synced", async () => {
  const { db, sub } = await seedConfirmed();
  await unsubscribeSubscription(db, sub.id, "2026-07-24T02:00:00.000Z");
  const row = await getSubscriptionByEmail(db, input.email);
  fetchResult = () => new Response("not found", { status: 404 });
  const ok = await syncBrevoContact(env(db), row);
  assert.equal(ok, true, "404 = nothing to blacklist = success");
  assert.ok((await getSubscriptionByEmail(db, input.email)).brevo_synced_at);
});

test("pending/other status → no Brevo call, treated as done", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps()); // pending
  let called = false;
  fetchResult = () => {
    called = true;
    return new Response(null, { status: 201 });
  };
  const ok = await syncBrevoContact(env(db), c.subscription);
  assert.equal(ok, true);
  assert.equal(called, false, "no Brevo call for a pending row");
});
