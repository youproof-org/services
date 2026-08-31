import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleScheduled } from "../src/handlers/scheduled.ts";
import {
  subscribeUpsert,
  confirmSubscription,
  unsubscribeSubscription,
  getSubscriptionByEmail,
} from "../src/lib/db.ts";
import { FakeD1, FIXTURE_NOW, makeDeps } from "./helpers/fake-d1.mjs";

const HOUR = 60 * 60 * 1000;
/** Relative to the fixture clock, so these rows never age past a retention window. */
const afterSignup = (hours) => new Date(Date.parse(FIXTURE_NOW) + hours * HOUR).toISOString();

const input = {
  name: "Anna",
  email: "anna@example.com",
  locale: "hu",
  privacyAccepted: true,
  sourcePage: "/hu/cikkek/x",
  sourceFormInstance: "/hu/cikkek/x#pre-footer",
  turnstileToken: "t",
};

let contactResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  contactResponder = () => new Response(JSON.stringify({ id: 1 }), { status: 201 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/smtp/email")) return new Response(JSON.stringify({ messageId: "<a>" }), { status: 201 });
    return contactResponder();
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function seedConfirmedUnsynced() {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, afterSignup(1));
  return { db, id: c.subscription.id };
}

const env = (db) => ({
  DB: db,
  BREVO_API_KEY: "k",
  BREVO_LIST_ID: "7",
  BREVO_SENDER_EMAIL: "s@x",
  ALERT_EMAIL: "admin@youproof.org",
});

const alertCalls = () => calls.filter((c) => c.url.includes("/smtp/email"));

test("retries a transient failure and marks synced, no alert", async () => {
  const { db, id } = await seedConfirmedUnsynced();
  await handleScheduled(env(db));
  const row = await getSubscriptionByEmail(db, input.email);
  assert.ok(row.brevo_synced_at, "reconciled → synced");
  assert.equal(alertCalls().length, 0, "no alert on success");
  assert.equal(db.rows.get(id).status, "confirmed");
});

test("below threshold: records a failure but does not alert", async () => {
  const { db } = await seedConfirmedUnsynced();
  contactResponder = () => new Response("err", { status: 500 });
  await handleScheduled(env(db));
  const row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_synced_at, null);
  assert.equal(row.brevo_sync_attempts, 1);
  assert.equal(row.brevo_alerted_at, null);
  assert.equal(alertCalls().length, 0);
});

test("at threshold: emails the admin once and marks alerted", async () => {
  const { db, id } = await seedConfirmedUnsynced();
  db.rows.get(id).brevo_sync_attempts = 2; // next failure → 3 (ALERT_THRESHOLD)
  contactResponder = () => new Response("err", { status: 500 });

  await handleScheduled(env(db));
  let row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_sync_attempts, 3);
  assert.ok(row.brevo_alerted_at, "alerted timestamp set");
  assert.equal(alertCalls().length, 1, "one admin alert email");
  const alertBody = JSON.parse(alertCalls()[0].init.body);
  assert.equal(alertBody.to[0].email, "admin@youproof.org");
  assert.match(alertBody.textContent, /anna@example\.com/);

  // A second run must not re-alert (brevo_alerted_at already set).
  await handleScheduled(env(db));
  assert.equal(alertCalls().length, 1, "no duplicate alert");
});

test("reconciles a failed UNSUBSCRIBE propagation (blacklist), then succeeds", async () => {
  const { db, id } = await seedConfirmedUnsynced();
  await handleScheduled(env(db)); // sync the confirm first (POST /contacts)

  // Our-endpoint unsubscribe enqueues a blacklist propagation.
  await unsubscribeSubscription(db, id, afterSignup(3));
  let row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.status, "unsubscribed");
  assert.equal(row.brevo_synced_at, null, "unsubscribe owes Brevo a blacklist");

  // First reconcile fails → attempt recorded, still unsynced.
  contactResponder = () => new Response("err", { status: 500 });
  await handleScheduled(env(db));
  row = await getSubscriptionByEmail(db, input.email);
  assert.equal(row.brevo_synced_at, null);
  assert.equal(row.brevo_sync_attempts, 1);
  assert.ok(
    calls.some((c) => c.init.method === "PUT" && c.url.includes("/contacts/")),
    "attempted a blacklist PUT to /contacts/{email}",
  );

  // Retry succeeds → synced.
  contactResponder = () => new Response(null, { status: 204 });
  await handleScheduled(env(db));
  assert.ok((await getSubscriptionByEmail(db, input.email)).brevo_synced_at, "propagated → synced");
});

test("synced rows are not picked up again", async () => {
  const { db } = await seedConfirmedUnsynced();
  await handleScheduled(env(db)); // syncs it
  const before = calls.length;
  await handleScheduled(env(db)); // nothing left to do
  assert.equal(calls.length, before, "no further Brevo calls");
});
