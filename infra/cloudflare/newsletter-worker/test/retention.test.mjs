// Retention purge (storage limitation). The windows asserted here are the ones
// published in the privacy policy (content/pages/adatkezeles) — if a period changes
// in one place it must change in both, and these tests are the tripwire.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleScheduled } from "../src/handlers/scheduled.ts";
import {
  confirmSubscription,
  insertEmailEvent,
  listPurgeableUnsubscribed,
  pruneEmailEvents,
  recordSubscribeAttempt,
  subscribeUpsert,
  unsubscribeSubscription,
  upsertSuppression,
  setBlockedByEmail,
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

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

let deleteResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  deleteResponder = () => new Response(null, { status: 204 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, init });
    if (init?.method === "DELETE") return deleteResponder();
    if (String(url).includes("/smtp/email")) {
      return new Response(JSON.stringify({ messageId: "<a>" }), { status: 201 });
    }
    return new Response(JSON.stringify({ id: 1 }), { status: 201 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = (db) => ({
  DB: db,
  BREVO_API_KEY: "k",
  BREVO_LIST_ID: "7",
  BREVO_SENDER_EMAIL: "s@x",
  ALERT_EMAIL: "admin@youproof.org",
});

const deleteCalls = () => calls.filter((c) => c.method === "DELETE");

/** A subscription unsubscribed `agoMs` ago, already synced so it isn't reconciled. */
async function seedUnsubscribed(agoMs, email = input.email) {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, { ...input, email }, "sha", makeDeps());
  const id = c.subscription.id;
  await confirmSubscription(db, id, iso(Date.now() - agoMs - DAY));
  await unsubscribeSubscription(db, id, iso(Date.now() - agoMs));
  db.rows.get(id).brevo_synced_at = iso(Date.now() - agoMs);
  return { db, id };
}

// --- subscriptions ----------------------------------------------------------

test("purges an unsubscribed subscription past 5 years, from Brevo then D1", async () => {
  const { db, id } = await seedUnsubscribed(6 * 365 * DAY);

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 1, "one Brevo contact delete");
  assert.match(
    deleteCalls()[0].url,
    /\/contacts\/anna%40example\.com$/,
    "deletes by url-encoded email",
  );
  assert.equal(db.rows.get(id), undefined, "D1 row hard-deleted");
});

test("keeps an unsubscribed subscription inside the 5-year window", async () => {
  const { db, id } = await seedUnsubscribed(4 * 365 * DAY);

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 0, "no Brevo delete");
  assert.ok(db.rows.get(id), "row retained as consent evidence");
});

test("a failed Brevo delete leaves the row for the next tick", async () => {
  const { db, id } = await seedUnsubscribed(6 * 365 * DAY);
  deleteResponder = () => new Response("boom", { status: 500 });

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 1);
  assert.ok(
    db.rows.get(id),
    "row survives — it is the only pointer to a contact still needing deletion",
  );

  // Next tick succeeds → both stores converge.
  deleteResponder = () => new Response(null, { status: 204 });
  await handleScheduled(env(db));
  assert.equal(db.rows.get(id), undefined);
});

test("treats a Brevo 404 as success (never-confirmed row was never a contact)", async () => {
  const { db, id } = await seedUnsubscribed(6 * 365 * DAY);
  deleteResponder = () => new Response(JSON.stringify({ code: "document_not_found" }), { status: 404 });

  await handleScheduled(env(db));

  assert.equal(db.rows.get(id), undefined, "purge converges rather than jamming");
});

test("never purges a blocked row, and keeps its suppression", async () => {
  const { db, id } = await seedUnsubscribed(6 * 365 * DAY);
  // A bounce/spam suppression outranks the retention window: the address must stay
  // known, or we would mail it again.
  await upsertSuppression(db, input.email, "bounce", iso(Date.now() - 6 * 365 * DAY));
  await setBlockedByEmail(db, input.email, iso(Date.now() - 6 * 365 * DAY));

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 0, "no Brevo delete for a blocked address");
  assert.equal(db.rows.get(id).status, "blocked");
  assert.ok(db.suppressed.has(input.email), "suppression retained for deliverability");
});

test("purge is batched", async () => {
  const db = new FakeD1();
  const deps = makeDeps();
  for (let i = 0; i < 25; i++) {
    const c = await subscribeUpsert(db, { ...input, email: `u${i}@example.com` }, "sha", deps);
    await unsubscribeSubscription(db, c.subscription.id, iso(Date.now() - 6 * 365 * DAY));
    db.rows.get(c.subscription.id).brevo_synced_at = iso(Date.now() - DAY);
  }

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 20, "PURGE_BATCH rows per tick");
  assert.equal(db.rows.size, 5, "remainder waits for the next tick");
});

// --- email events -----------------------------------------------------------

test("prunes webhook events older than 24 months, keeps newer ones", async () => {
  const db = new FakeD1();
  const add = (messageId, receivedAt) =>
    insertEmailEvent(db, {
      email: input.email,
      messageId,
      event: "delivered",
      reason: null,
      occurredAt: null,
      raw: "{}",
      receivedAt,
    });
  await add("<old>", iso(Date.now() - 800 * DAY));
  await add("<new>", iso(Date.now() - 100 * DAY));

  await handleScheduled(env(db));

  assert.deepEqual(
    db.events.map((e) => e.message_id),
    ["<new>"],
  );
});

test("prunes events on received_at, so a null occurred_at can't make a row immortal", async () => {
  const db = new FakeD1();
  await insertEmailEvent(db, {
    email: input.email,
    messageId: "<no-ts>",
    event: "delivered",
    reason: null,
    occurredAt: null, // Brevo omitted a timestamp
    raw: "{}",
    receivedAt: iso(Date.now() - 800 * DAY),
  });

  await pruneEmailEvents(db, iso(Date.now() - 730 * DAY));

  assert.equal(db.events.length, 0);
});

// --- rate-limit ledger (pre-existing behaviour, pinned alongside the rest) ---

test("prunes rate-limit attempts older than 24 hours", async () => {
  const db = new FakeD1();
  await recordSubscribeAttempt(db, input.email, "1.2.3.4", iso(Date.now() - 2 * DAY));
  await recordSubscribeAttempt(db, input.email, "1.2.3.4", iso(Date.now() - 60 * 1000));

  await handleScheduled(env(db));

  assert.equal(db.attempts.length, 1, "only the recent attempt survives");
});

// --- query-level check ------------------------------------------------------

test("listPurgeableUnsubscribed ignores rows with a null unsubscribed_at", async () => {
  const { db, id } = await seedUnsubscribed(6 * 365 * DAY);
  db.rows.get(id).unsubscribed_at = null;

  const rows = await listPurgeableUnsubscribed(db, iso(Date.now()), 10);

  assert.equal(rows.length, 0);
});
