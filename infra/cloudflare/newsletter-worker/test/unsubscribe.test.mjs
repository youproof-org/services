// The unsubscribe endpoint.
//
// Two properties this file protects, and they pull in opposite directions:
//
//  1. The GET writes NOTHING. This URL ships in the List-Unsubscribe header AND
//     as the visible body link of every single email, so a scanner that fetches
//     it used to silently unsubscribe the reader — on every send, invisibly to
//     both sides. RFC 8058 exists because of exactly this: "mail software
//     sometimes fetches URLs in mail header fields, and thereby accidentally
//     triggers unsubscriptions".
//  2. The POST must stay wide open. RFC 8058 one-click unsubscribes are issued
//     by the mailbox provider, cross-origin, and must not be redirected. An
//     Origin check or a redirect here breaks Gmail/Yahoo one-click and the bulk
//     sender requirements.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import {
  handleUnsubscribe,
  handleUnsubscribeLanding,
} from "../src/handlers/unsubscribe.ts";
import {
  confirmSubscription,
  setBlockedByEmail,
  subscribeUpsert,
  upsertSuppression,
} from "../src/lib/db.ts";
import { FakeD1, makeDeps } from "./helpers/fake-d1.mjs";

let blacklistResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  blacklistResponder = () => new Response(null, { status: 204 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method });
    if (init?.method === "PUT") return blacklistResponder();
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

/** A confirmed subscriber, already synced — the normal state of someone who
 *  would be clicking an unsubscribe link. */
async function seedConfirmed(db) {
  const res = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, res.subscription.id, "2026-07-01T00:00:00.000Z");
  db.rows.get(res.subscription.id).brevo_synced_at = "2026-07-01T00:00:00.000Z";
  return res.subscription;
}

const base = (id) => `https://youproof.org/api/v1/newsletter/subscriptions/${id}/unsubscribe`;
const get = (id, token) => new Request(`${base(id)}?token=${token}`);
const req = (id, token, method, headers = {}) =>
  new Request(`${base(id)}?token=${token}`, { method, headers });

const call = (h, r, db, id) => h(r, env(db), new URL(r.url), id);
const blacklistCalls = () => calls.filter((c) => c.method === "PUT");

// --- the landing GET ---------------------------------------------------------

test("the unsubscribe GET is side-effect free — the regression this file exists for", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);
  const before = JSON.stringify(db.rows.get(sub.id));

  await call(handleUnsubscribeLanding, get(sub.id, sub.unsubscribe_token), db, sub.id);
  await call(handleUnsubscribeLanding, get(sub.id, sub.unsubscribe_token), db, sub.id);

  assert.equal(
    JSON.stringify(db.rows.get(sub.id)),
    before,
    "row byte-identical — a scanner fetching this must not unsubscribe anyone",
  );
  assert.equal(db.rows.get(sub.id).status, "confirmed");
  assert.equal(calls.length, 0, "and no Brevo blacklist call");
});

test("a valid unsubscribe link opens the confirmation on the locale homepage", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  const res = await call(handleUnsubscribeLanding, get(sub.id, sub.unsubscribe_token), db, sub.id);

  assert.equal(res.status, 302);
  const loc = new URL(res.headers.get("location"));
  assert.equal(loc.origin + loc.pathname, "https://youproof.org/hu");
  assert.equal(loc.searchParams.get("newsletter_ask"), "unsubscribe");
  assert.equal(loc.searchParams.get("sid"), sub.id);
  assert.equal(loc.searchParams.get("stok"), sub.unsubscribe_token);
});

test("a bad token or unknown id lands on the error marker", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  for (const [id, tok] of [
    [sub.id, "wrong"],
    ["no-such-id", sub.unsubscribe_token],
  ]) {
    const res = await call(handleUnsubscribeLanding, get(id, tok), db, id);
    assert.equal(
      new URL(res.headers.get("location")).searchParams.get("newsletter_unsubscribed"),
      "error",
    );
  }
  assert.equal(db.rows.get(sub.id).status, "confirmed", "nothing written");
});

// --- the POST / DELETE -------------------------------------------------------

test("POST unsubscribes, blacklists in Brevo, and enqueues the propagation", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  const res = await call(handleUnsubscribe, req(sub.id, sub.unsubscribe_token, "POST"), db, sub.id);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "unsubscribed" });
  const after = db.rows.get(sub.id);
  assert.equal(after.status, "unsubscribed");
  assert.ok(after.unsubscribed_at);
  assert.equal(blacklistCalls().length, 1);
});

test("DELETE behaves identically", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  const res = await call(handleUnsubscribe, req(sub.id, sub.unsubscribe_token, "DELETE"), db, sub.id);

  assert.equal(res.status, 200);
  assert.equal(db.rows.get(sub.id).status, "unsubscribed");
});

test("RFC 8058: the one-click POST needs no Origin, and a hostile one is fine too", async () => {
  // The mailbox provider issues this request, cross-origin, with no Origin we
  // control. An isAllowedOrigin check here would break Gmail/Yahoo one-click
  // unsubscribe. The 256-bit token in the query string is the auth.
  for (const headers of [{}, { origin: "https://evil.example" }]) {
    const db = new FakeD1();
    const sub = await seedConfirmed(db);

    const res = await call(
      handleUnsubscribe,
      req(sub.id, sub.unsubscribe_token, "POST", headers),
      db,
      sub.id,
    );

    assert.equal(res.status, 200, `one-click must work with headers=${JSON.stringify(headers)}`);
    assert.equal(db.rows.get(sub.id).status, "unsubscribed");
  }
});

test("RFC 8058: the one-click POST is never answered with a redirect", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  const res = await call(handleUnsubscribe, req(sub.id, sub.unsubscribe_token, "POST"), db, sub.id);

  // "The mail sender MUST NOT return an HTTPS redirect, since redirected POST
  // actions have historically not worked reliably."
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("location"), null);
});

test("a repeated one-click does not re-fire the Brevo blacklist", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);
  const r = () => req(sub.id, sub.unsubscribe_token, "POST");

  const first = await call(handleUnsubscribe, r(), db, sub.id);
  const at = db.rows.get(sub.id).unsubscribed_at;
  const second = await call(handleUnsubscribe, r(), db, sub.id);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200, "retries are normal for one-click clients");
  assert.equal(blacklistCalls().length, 1, "no repeated propagation");
  assert.equal(db.rows.get(sub.id).unsubscribed_at, at);
});

test("never downgrades a blocked row", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);
  await upsertSuppression(db, sub.email, "spam", "2026-07-02T00:00:00.000Z");
  await setBlockedByEmail(db, sub.email, "2026-07-02T00:00:00.000Z");

  const res = await call(handleUnsubscribe, req(sub.id, sub.unsubscribe_token, "POST"), db, sub.id);

  assert.equal(res.status, 200, "the reader is told they are unsubscribed, which is true");
  assert.equal(db.rows.get(sub.id).status, "blocked", "suppression outranks and survives");
});

test("rejects a bad token and an unknown id", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);

  for (const [id, tok] of [
    [sub.id, "wrong"],
    ["no-such-id", sub.unsubscribe_token],
  ]) {
    const res = await call(handleUnsubscribe, req(id, tok, "POST"), db, id);
    assert.equal(res.status, 404);
  }
  assert.equal(db.rows.get(sub.id).status, "confirmed");
});

test("a failed Brevo blacklist still unsubscribes, leaving it to the reconciler", async () => {
  const db = new FakeD1();
  const sub = await seedConfirmed(db);
  blacklistResponder = () => new Response("brevo down", { status: 500 });

  const res = await call(handleUnsubscribe, req(sub.id, sub.unsubscribe_token, "POST"), db, sub.id);

  assert.equal(res.status, 200);
  assert.equal(db.rows.get(sub.id).status, "unsubscribed");
  assert.equal(db.rows.get(sub.id).brevo_synced_at, null);
});
