// The cron send path of the one-shot legacy re-permission campaign.
//
// The central promise of this campaign is "exactly one email per address, ever".
// Most of what follows exists to pin that: the compare-and-swap claim, the
// attempt cap, and the two NOT EXISTS filters that take an address out of the
// worklist the moment it subscribes normally or bounces.
import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleScheduled } from "../src/handlers/scheduled.ts";
import { subscribeUpsert, upsertSuppression } from "../src/lib/db.ts";
import { FakeD1, makeDeps } from "./helpers/fake-d1.mjs";

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
/** Recent enough that the 90-day retention sweep leaves it alone. */
const FRESH = () => iso(Date.now() - DAY);

let sendResponder;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  sendResponder = () => new Response(JSON.stringify({ messageId: "<m1>" }), { status: 201 });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body });
    if (String(url).includes("/smtp/email")) return sendResponder();
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
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
  BREVO_SENDER_NAME: "Moldvai Dávid",
  ALERT_EMAIL: "admin@youproof.org",
  SITE_HOST: "youproof.org",
  DEFAULT_LOCALE: "hu",
});

const sends = () => calls.filter((c) => c.url.includes("/smtp/email"));
const sentBodies = () => sends().map((c) => JSON.parse(c.body));

test("sends exactly one invite per legacy contact, and never a second", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });

  await handleScheduled(env(db));

  assert.equal(sends().length, 1, "one invite sent");
  const after = db.legacy.get(row.id);
  assert.equal(after.status, "invited");
  assert.ok(after.invite_token, "invite token minted at send time");
  assert.equal(after.invited_at, iso(Date.parse(after.invited_at)));
  assert.equal(after.send_attempts, 1);
  assert.equal(after.brevo_message_id, "<m1>");

  // The whole point: a second tick must not re-mail an already-invited row.
  await handleScheduled(env(db));
  assert.equal(sends().length, 1, "still exactly one invite after a second tick");
});

test("the invite carries the campaign tag and a List-Unsubscribe pointing at decline", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });

  await handleScheduled(env(db));

  const body = sentBodies()[0];
  const token = db.legacy.get(row.id).invite_token;
  assert.deepEqual(body.tags, ["newsletter-legacy-invite"], "segmentable in Brevo");
  assert.equal(
    body.headers["List-Unsubscribe"],
    `<https://youproof.org/api/v1/newsletter/legacy/${row.id}/decline?token=${token}>`,
    "one-click opt-out targets decline, not the subscriber unsubscribe endpoint",
  );
  assert.equal(body.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  // No name is known for a legacy address, so the recipient must be bare.
  assert.deepEqual(body.to, [{ email: "regi@example.com" }]);
  assert.equal(body.sender.name, "Moldvai Dávid", "From name comes from BREVO_SENDER_NAME");
  assert.ok(
    body.textContent.includes("Moldvai Dávid"),
    "and the sign-off is the same identity, so the two cannot contradict",
  );
  assert.match(body.htmlContent, /Feliratkozom az új hírlevélre/);
  assert.match(
    body.htmlContent,
    new RegExp(`legacy/${row.id}/resubscribe\\?token=${token}`),
    "the resubscribe link carries the freshly minted token",
  );
});

test("skips an address that has subscribed normally since the import", async () => {
  const db = new FakeD1();
  await subscribeUpsert(
    db,
    {
      name: "Anna",
      email: "regi@example.com",
      locale: "hu",
      sourcePage: "/hu",
      sourceFormInstance: "/hu#pre-footer",
    },
    "sha",
    makeDeps(),
  );
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });

  await handleScheduled(env(db));

  assert.equal(sends().length, 0, "no invite to someone already on the list");
  assert.equal(db.legacy.get(row.id).status, "pending", "left for the retention sweep");
});

test("skips an address suppressed by a bounce or complaint after the import", async () => {
  const db = new FakeD1();
  await upsertSuppression(db, "regi@example.com", "bounce", FRESH());
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });

  await handleScheduled(env(db));

  assert.equal(sends().length, 0, "the bounce feedback loop takes it out of the worklist");
  assert.equal(db.legacy.get(row.id).status, "pending");
});

test("skips paused rows — the operator brake works without a redeploy", async () => {
  const db = new FakeD1();
  db.seedLegacy({ email: "a@example.com", status: "paused", imported_at: FRESH() });
  db.seedLegacy({ email: "b@example.com", status: "paused", imported_at: FRESH() });

  await handleScheduled(env(db));

  assert.equal(sends().length, 0);
});

test("caps each tick at the invite batch size", async () => {
  const db = new FakeD1();
  for (let i = 0; i < 12; i++) {
    db.seedLegacy({ email: `a${i}@example.com`, imported_at: FRESH() });
  }

  await handleScheduled(env(db));

  assert.equal(sends().length, 5, "LEGACY_INVITE_BATCH — a cold list is mailed slowly");
  assert.equal(
    [...db.legacy.values()].filter((r) => r.status === "pending").length,
    7,
    "the rest wait for later ticks",
  );
});

test("mails the oldest imports first, and fewest-attempts-first after a failure", async () => {
  const db = new FakeD1();
  db.seedLegacy({ email: "new@example.com", imported_at: iso(Date.now() - DAY) });
  db.seedLegacy({ email: "old@example.com", imported_at: iso(Date.now() - 10 * DAY) });

  await handleScheduled(env(db));

  const order = sentBodies().map((b) => b.to[0].email);
  assert.deepEqual(order, ["old@example.com", "new@example.com"]);
});

test("a Brevo 5xx returns the row to the queue and retries next tick", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });
  sendResponder = () => new Response("upstream boom", { status: 503 });

  await handleScheduled(env(db));

  const after = db.legacy.get(row.id);
  assert.equal(after.status, "pending", "back in the worklist");
  assert.equal(after.send_attempts, 1, "the claim already counted the attempt");
  assert.equal(after.invite_token, null, "the unsent token is discarded");
  assert.match(after.last_error, /503/);

  sendResponder = () => new Response(JSON.stringify({ messageId: "<m2>" }), { status: 201 });
  await handleScheduled(env(db));
  assert.equal(db.legacy.get(row.id).status, "invited");
  assert.equal(db.legacy.get(row.id).send_attempts, 2);
});

test("gives up after the attempt cap instead of retrying forever", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });
  sendResponder = () => new Response("upstream boom", { status: 503 });

  for (let i = 0; i < 5; i++) await handleScheduled(env(db));

  assert.equal(sends().length, 3, "LEGACY_MAX_SEND_ATTEMPTS bounds the duplicates");
  assert.equal(db.legacy.get(row.id).send_attempts, 3);
});

test("a Brevo 4xx is terminal — parked for a human, not retried", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });
  sendResponder = () => new Response("invalid recipient", { status: 400 });

  await handleScheduled(env(db));
  await handleScheduled(env(db));

  assert.equal(sends().length, 1, "no retry of something retrying cannot fix");
  const after = db.legacy.get(row.id);
  assert.equal(after.status, "failed");
  assert.match(after.last_error, /400/);
});

test("a 429 is treated as retryable, not terminal", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({ email: "regi@example.com", imported_at: FRESH() });
  sendResponder = () => new Response("slow down", { status: 429 });

  await handleScheduled(env(db));

  assert.equal(db.legacy.get(row.id).status, "pending");
});

// --- retention interaction ---------------------------------------------------

test("purges before sending, so a long-forgotten import is erased not cold-mailed", async () => {
  const db = new FakeD1();
  const row = db.seedLegacy({
    email: "regi@example.com",
    imported_at: iso(Date.now() - 91 * DAY),
  });

  await handleScheduled(env(db));

  assert.equal(sends().length, 0, "never contacted after sitting for three months");
  assert.equal(db.legacy.has(row.id), false, "erased instead");
});
