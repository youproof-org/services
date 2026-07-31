// Retention purge (storage limitation). The windows asserted here are the ones
// published in the privacy policy (content/pages/adatkezeles) — if a period changes
// in one place it must change in both, and these tests are the tripwire.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleScheduled } from "../src/handlers/scheduled.ts";
import { handleLegacyResubscribe } from "../src/handlers/legacy.ts";
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

// --- never-confirmed subscriptions (30 days from signup) ---------------------
// A pending row is not a subscription: the reader asked, but never proved they
// control the mailbox. Nothing purged these before, so they were retained
// forever, outside any period the policy publishes.

/** A subscription that was never confirmed, signed up `agoMs` ago. */
async function seedPendingAged(db, agoMs, email = "pending@example.com") {
  const c = await subscribeUpsert(db, { ...input, email }, "sha", makeDeps());
  db.rows.get(c.subscription.id).subscribed_at = iso(Date.now() - agoMs);
  return c.subscription.id;
}

test("purges a never-confirmed subscription past 30 days, without touching Brevo", async () => {
  const db = new FakeD1();
  const id = await seedPendingAged(db, 31 * DAY);

  await handleScheduled(env(db));

  assert.equal(db.rows.has(id), false, "erased from D1");
  // A pending row was never added to the Brevo list — syncBrevoContact only runs
  // on confirmation — so there is nothing there to erase.
  assert.equal(deleteCalls().length, 0, "no Brevo call");
});

test("keeps a never-confirmed subscription inside the 30-day window", async () => {
  const db = new FakeD1();
  const id = await seedPendingAged(db, 29 * DAY);

  await handleScheduled(env(db));

  assert.equal(db.rows.has(id), true);
});

test("the pending sweep does not touch a long-standing confirmed subscriber", async () => {
  const db = new FakeD1();
  const id = await seedPendingAged(db, 400 * DAY);
  await confirmSubscription(db, id, iso(Date.now() - 399 * DAY));
  db.rows.get(id).brevo_synced_at = iso(Date.now() - 399 * DAY);

  await handleScheduled(env(db));

  assert.equal(db.rows.has(id), true, "confirmed rows have their own, much longer window");
});


// --- legacy re-permission contacts (90 days from import) --------------------
// One-shot campaign. Same tripwire duty as the sections above: the
// window here is published in the privacy policy AND quoted to the recipient in
// the invite email itself, so it cannot be changed in one place alone.

/** A legacy contact imported `agoMs` ago, in whatever campaign state. */
function seedLegacyAged(db, agoMs, overrides = {}) {
  return db.seedLegacy({
    email: "regi@example.com",
    imported_at: iso(Date.now() - agoMs),
    ...overrides,
  });
}

test("purges a legacy contact past 90 days from D1, without touching Brevo", async () => {
  const db = new FakeD1();
  const row = seedLegacyAged(db, 91 * DAY, { status: "invited", invite_token: "t" });

  await handleScheduled(env(db));

  assert.equal(db.legacy.has(row.id), false, "the row is gone");
  // These addresses are never in the Brevo list — Brevo only ever saw them as
  // the recipient of one message — so there is nothing of ours to erase there.
  assert.equal(deleteCalls().length, 0, "no Brevo call");
});

test("keeps a legacy contact inside the 90-day window", async () => {
  const db = new FakeD1();
  const row = seedLegacyAged(db, 89 * DAY, { status: "invited", invite_token: "t" });

  await handleScheduled(env(db));

  assert.equal(db.legacy.has(row.id), true);
  assert.equal(deleteCalls().length, 0);
});

test("the 90-day clock runs from import, not from the send", async () => {
  const db = new FakeD1();
  // Imported long ago, mailed only yesterday: still expired. The retention
  // promise is about how long we hold the address, not how long since we used it.
  const row = seedLegacyAged(db, 100 * DAY, {
    status: "invited",
    invite_token: "t",
    invited_at: iso(Date.now() - DAY),
  });

  await handleScheduled(env(db));

  assert.equal(db.legacy.has(row.id), false);
});

test("purges converted, declined and failed legacy rows on the same clock", async () => {
  const db = new FakeD1();
  for (const status of ["converted", "declined", "failed"]) {
    db.seedLegacy({
      email: `${status}@example.com`,
      status,
      imported_at: iso(Date.now() - 91 * DAY),
    });
  }

  await handleScheduled(env(db));

  assert.equal(db.legacy.size, 0, "no legacy row outlives the window in any state");
});

test("an unreachable Brevo does not postpone the erasure", async () => {
  const db = new FakeD1();
  const row = seedLegacyAged(db, 91 * DAY, { status: "invited", invite_token: "t" });
  deleteResponder = () => new Response("nope", { status: 500 });

  await handleScheduled(env(db));

  // The period we publish for these addresses is about our own database, and
  // nothing here depends on a third party being up.
  assert.equal(db.legacy.has(row.id), false, "erased regardless");
});

// --- the Brevo delete must never reach a live subscriber ---------------------

/** A confirmed subscriber already synced into the Brevo list. */
async function seedConfirmedSubscriber(db, email) {
  const created = await subscribeUpsert(
    db,
    { ...input, email, sourceFormInstance: "legacy-repermission" },
    "sha",
    makeDeps(),
  );
  await confirmSubscription(db, created.subscription.id, iso(Date.now() - 80 * DAY));
  db.rows.get(created.subscription.id).brevo_synced_at = iso(Date.now() - 80 * DAY);
  return created.subscription;
}

test("does not delete a converted contact's subscriber from Brevo", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmedSubscriber(db, "regi@example.com");
  const row = seedLegacyAged(db, 91 * DAY, {
    status: "converted",
    subscription_id: sub.id,
  });

  await handleScheduled(env(db));

  // The row exists past conversion only to keep a repeated click idempotent;
  // deleting the contact would drop a live subscriber from the list for good,
  // since brevo_synced_at is set and the reconciliation would never notice.
  assert.equal(deleteCalls().length, 0, "no Brevo delete for a subscriber");
  assert.equal(db.legacy.has(row.id), false, "the legacy row is still erased");
  assert.equal(db.rows.get(sub.id).status, "confirmed", "and the subscription is untouched");
});

test("does not delete from Brevo when a decliner later subscribed via the form", async () => {
  const db = new FakeD1();
  // Status is not the discriminator: presence in `subscriptions` is.
  await seedConfirmedSubscriber(db, "regi@example.com");
  seedLegacyAged(db, 91 * DAY, { status: "declined", responded_at: iso(Date.now() - 85 * DAY) });

  await handleScheduled(env(db));

  assert.equal(deleteCalls().length, 0);
});

test("no legacy status triggers a Brevo delete", async () => {
  const db = new FakeD1();
  for (const status of ["pending", "paused", "invited", "converted", "declined", "failed"]) {
    db.seedLegacy({
      email: `${status}@example.com`,
      status,
      imported_at: iso(Date.now() - 91 * DAY),
    });
  }

  await handleScheduled(env(db));

  // Belt and braces for the whole state space: an earlier version deleted the
  // contact for every expired row, which silently dropped live subscribers.
  assert.equal(db.legacy.size, 0, "all erased from D1");
  assert.equal(deleteCalls().length, 0, "and not one Brevo delete");
});

// --- the invariant underneath all of the above -------------------------------
// A CONFIRMED subscriber is never purged, by any sweep, however old, whichever
// flow created them. This is written as its own section because it is the thing
// that actually broke once: the legacy purge used to call deleteContact on every
// expired row, which silently dropped live subscribers out of the Brevo list —
// permanently, since brevo_synced_at was already set and the reconciliation
// therefore never noticed.

/** Age every timestamp on a row as far back as possible. */
function ageEverything(db, id) {
  const r = db.rows.get(id);
  const ancient = iso(Date.now() - 10 * 365 * DAY);
  r.subscribed_at = ancient;
  r.created_at = ancient;
  r.updated_at = ancient;
  r.confirmed_at = ancient;
  r.brevo_synced_at = ancient;
}

test("a subscriber confirmed through the normal flow survives every sweep", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, { ...input, email: "normal@example.com" }, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, iso(Date.now() - 3650 * DAY));
  ageEverything(db, c.subscription.id);

  for (let i = 0; i < 3; i++) await handleScheduled(env(db));

  assert.equal(db.rows.has(c.subscription.id), true, "still in D1 after a decade");
  assert.equal(db.rows.get(c.subscription.id).status, "confirmed");
  assert.equal(deleteCalls().length, 0, "and never deleted from Brevo");
});

test("a subscriber confirmed through the legacy campaign survives every sweep", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({
    email: "legacy@example.com",
    status: "invited",
    invite_token: "tok",
    imported_at: iso(Date.now() - 200 * DAY),
  });
  // Convert through the real handler rather than hand-building the row, so this
  // exercises whatever that path actually writes.
  const req = new Request(
    `https://youproof.org/api/v1/newsletter/legacy/${row.id}/resubscribe`,
    {
      method: "POST",
      headers: { origin: "https://youproof.org", "content-type": "application/json" },
      body: JSON.stringify({ token: "tok", name: "Bea", privacyAccepted: true }),
    },
  );
  const res = await handleLegacyResubscribe(
    req,
    { ...env(db), ALLOWED_ORIGINS: "https://youproof.org" },
    new URL(req.url),
    row.id,
  );
  assert.equal(res.status, 200, "converted");

  const sub = [...db.rows.values()].find((r) => r.email === "legacy@example.com");
  ageEverything(db, sub.id);
  calls.length = 0;

  for (let i = 0; i < 3; i++) await handleScheduled(env(db));

  assert.equal(db.legacy.has(row.id), false, "the legacy row is purged, as it should be");
  assert.equal(db.rows.has(sub.id), true, "but the subscriber they became is not");
  assert.equal(db.rows.get(sub.id).status, "confirmed");
  assert.equal(deleteCalls().length, 0, "and no Brevo delete for a live subscriber");
});

test("a confirmed subscriber survives a stale legacy row in every status", async () => {
  // Status is not the discriminator — someone who declined, or was never mailed,
  // can equally be a subscriber today. Cover the whole state space.
  for (const status of ["pending", "paused", "invited", "converted", "declined", "failed"]) {
    const db = new FakeD1();
    const c = await subscribeUpsert(db, { ...input, email: "both@example.com" }, "sha", makeDeps());
    await confirmSubscription(db, c.subscription.id, iso(Date.now() - 3650 * DAY));
    ageEverything(db, c.subscription.id);
    db.seedLegacy({ email: "both@example.com", status, imported_at: iso(Date.now() - 3650 * DAY) });
    calls.length = 0;

    await handleScheduled(env(db));

    assert.equal(db.rows.has(c.subscription.id), true, `survived a stale '${status}' legacy row`);
    assert.equal(deleteCalls().length, 0, `no Brevo delete for a '${status}' legacy row`);
  }
});
