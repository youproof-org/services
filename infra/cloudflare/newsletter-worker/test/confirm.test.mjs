// The double-opt-in confirmation endpoint.
//
// The property this file exists to protect: the GET writes NOTHING. Mail
// security scanners fetch every link in an inbox before a human sees it, and
// RFC 8058 is blunt that there is "no mechanical way for a sender to tell
// whether a request was made automatically by anti-spam software or manually
// requested by a user". A GET that confirmed would let a scanner manufacture the
// proof of mailbox control that the whole double opt-in exists to establish.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleConfirm, handleConfirmLanding } from "../src/handlers/confirm.ts";
import {
  confirmSubscription,
  getSubscriptionByEmail,
  subscribeUpsert,
  unsubscribeSubscription,
  upsertSuppression,
  setBlockedByEmail,
} from "../src/lib/db.ts";
import { FakeD1, makeDeps } from "./helpers/fake-d1.mjs";

let contactsResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  contactsResponder = () => new Response(JSON.stringify({ id: 1 }), { status: 201 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body });
    if (String(url).includes("/contacts")) return contactsResponder();
    return new Response(JSON.stringify({ id: 1 }), { status: 200 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = (db) => ({
  DB: db,
  ALLOWED_ORIGINS: "https://youproof.org",
  BREVO_API_KEY: "k",
  BREVO_LIST_ID: "7",
  BREVO_SENDER_EMAIL: "s@x",
  SITE_HOST: "youproof.org",
  DEFAULT_LOCALE: "hu",
});

const input = {
  name: "Anna",
  email: "anna@example.com",
  locale: "hu",
  sourcePage: "/hu/cikkek/x",
  sourceFormInstance: "/hu/cikkek/x#pre-footer",
};

/** A fresh pending subscription, as the subscribe form would have left it. */
async function seedPending(db, overrides = {}) {
  const res = await subscribeUpsert(db, { ...input, ...overrides }, "sha", makeDeps());
  return res.subscription;
}

const base = (id) => `https://youproof.org/api/v1/newsletter/subscriptions/${id}/confirm`;
const get = (id, token) => new Request(`${base(id)}?token=${token}`);
const post = (id, token, origin = "https://youproof.org") =>
  new Request(`${base(id)}?token=${token}`, {
    method: "POST",
    ...(origin ? { headers: { origin } } : {}),
  });

const call = (h, req, db, id) => h(req, env(db), new URL(req.url), id);
/** Contact upserts only — upsertContact GETs /contacts/lists/{id} first. */
const contactUpserts = () =>
  calls.filter((c) => c.method === "POST" && c.url.endsWith("/contacts"));

// --- the landing GET ---------------------------------------------------------

test("the confirm GET is side-effect free, so a scanner prefetch costs nothing", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);
  const before = JSON.stringify(db.rows.get(sub.id));

  await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);
  await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);

  assert.equal(
    JSON.stringify(db.rows.get(sub.id)),
    before,
    "row byte-identical after two prefetches — nothing confirmed, nothing synced",
  );
  assert.equal(db.rows.get(sub.id).status, "pending");
  assert.equal(calls.length, 0, "and no outbound call to Brevo");
});

test("a valid confirm link returns the reader to their own page with the token", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  const res = await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);

  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://youproof.org/hu/cikkek/x");
  assert.equal(loc.searchParams.get("newsletter_ask"), "confirm");
  assert.equal(loc.searchParams.get("sid"), sub.id);
  assert.equal(loc.searchParams.get("stok"), sub.confirm_token);
  assert.equal(loc.searchParams.get("sform"), "/hu/cikkek/x#pre-footer");
});

test("falls back to the locale homepage, and omits sform, when there is no source form", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);
  db.rows.get(sub.id).source_page = null;
  db.rows.get(sub.id).source_form_instance = null;

  const res = await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);

  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://youproof.org/hu");
  assert.equal(loc.searchParams.get("sform"), null, "no empty sform to confuse the dialog");
});

test("a bad token or unknown id lands on the invalid marker", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  for (const [id, tok] of [
    [sub.id, "wrong"],
    ["no-such-id", sub.confirm_token],
  ]) {
    const res = await call(handleConfirmLanding, get(id, tok), db, id);
    assert.equal(res.status, 302);
    assert.equal(
      new URL(res.headers.get("location")).searchParams.get("newsletter_confirmed"),
      "invalid",
    );
  }
  assert.equal(db.rows.get(sub.id).status, "pending", "nothing written");
});

test("a stale confirm link does not resurrect a blocked or unsubscribed row", async () => {
  for (const setup of [
    async (db, sub) => {
      await upsertSuppression(db, sub.email, "bounce", "2026-07-01T00:00:00.000Z");
      await setBlockedByEmail(db, sub.email, "2026-07-01T00:00:00.000Z");
    },
    async (db, sub) => unsubscribeSubscription(db, sub.id, "2026-07-01T00:00:00.000Z"),
  ]) {
    const db = new FakeD1();
    const sub = await seedPending(db);
    await setup(db, sub);
    const statusBefore = db.rows.get(sub.id).status;

    const res = await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);

    assert.equal(
      new URL(res.headers.get("location")).searchParams.get("newsletter_confirmed"),
      "invalid",
      `expected invalid for ${statusBefore}`,
    );
    assert.equal(db.rows.get(sub.id).status, statusBefore, "untouched");
  }
});

test("an already-confirmed row still gets the ordinary prompt", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);
  await confirmSubscription(db, sub.id, "2026-07-01T00:00:00.000Z");

  const res = await call(handleConfirmLanding, get(sub.id, sub.confirm_token), db, sub.id);

  // The GET's output stays a pure function of (row, token); the POST answers
  // "already confirmed" with a 200, so there is nothing to special-case here.
  assert.equal(
    new URL(res.headers.get("location")).searchParams.get("newsletter_ask"),
    "confirm",
  );
});

// --- the POST ----------------------------------------------------------------

test("the POST confirms and syncs the contact into the Brevo list", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  const res = await call(handleConfirm, post(sub.id, sub.confirm_token), db, sub.id);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "confirmed" });
  const after = await getSubscriptionByEmail(db, input.email);
  assert.equal(after.status, "confirmed");
  assert.ok(after.confirmed_at);
  assert.equal(contactUpserts().length, 1);
  assert.ok(after.brevo_synced_at, "marked synced");
});

test("a double submit is idempotent — one confirmation, one Brevo call", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  const first = await call(handleConfirm, post(sub.id, sub.confirm_token), db, sub.id);
  const confirmedAt = db.rows.get(sub.id).confirmed_at;
  const second = await call(handleConfirm, post(sub.id, sub.confirm_token), db, sub.id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "the second click must not 404 after a success");
  assert.equal(contactUpserts().length, 1, "no duplicate sync");
  assert.equal(db.rows.get(sub.id).confirmed_at, confirmedAt, "timestamp not overwritten");
});

test("rejects a cross-origin post and one with no Origin at all", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  for (const origin of ["https://evil.example", null]) {
    const res = await call(handleConfirm, post(sub.id, sub.confirm_token, origin), db, sub.id);
    assert.equal(res.status, 403, `expected 403 for origin=${origin}`);
  }
  assert.equal(db.rows.get(sub.id).status, "pending");
});

test("rejects a bad token and an unknown id", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);

  for (const [id, tok] of [
    [sub.id, "wrong"],
    ["no-such-id", sub.confirm_token],
  ]) {
    const res = await call(handleConfirm, post(id, tok), db, id);
    assert.equal(res.status, 404);
  }
  assert.equal(db.rows.get(sub.id).status, "pending");
});

test("refuses to confirm a blocked or unsubscribed row, with distinguishable codes", async () => {
  const db1 = new FakeD1();
  const blocked = await seedPending(db1);
  await upsertSuppression(db1, blocked.email, "bounce", "2026-07-01T00:00:00.000Z");
  await setBlockedByEmail(db1, blocked.email, "2026-07-01T00:00:00.000Z");
  const r1 = await call(handleConfirm, post(blocked.id, blocked.confirm_token), db1, blocked.id);
  assert.equal(r1.status, 409);
  assert.deepEqual(await r1.json(), { code: "subscription_blocked" });

  const db2 = new FakeD1();
  const gone = await seedPending(db2);
  await unsubscribeSubscription(db2, gone.id, "2026-07-01T00:00:00.000Z");
  const r2 = await call(handleConfirm, post(gone.id, gone.confirm_token), db2, gone.id);
  assert.equal(r2.status, 409);
  assert.deepEqual(await r2.json(), { code: "subscription_unsubscribed" });
});

test("a failed Brevo sync still confirms, and leaves the row for the reconciler", async () => {
  const db = new FakeD1();
  const sub = await seedPending(db);
  contactsResponder = () => new Response("brevo down", { status: 500 });

  const res = await call(handleConfirm, post(sub.id, sub.confirm_token), db, sub.id);

  assert.equal(res.status, 200, "the reader's outcome does not depend on Brevo");
  assert.equal(db.rows.get(sub.id).status, "confirmed");
  assert.equal(db.rows.get(sub.id).brevo_synced_at, null);
});
