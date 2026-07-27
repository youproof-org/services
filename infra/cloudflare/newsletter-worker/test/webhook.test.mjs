import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleWebhook } from "../src/handlers/webhook.ts";
import { subscribeUpsert, confirmSubscription } from "../src/lib/db.ts";
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

let fetchCalls;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return new Response(null, { status: 204 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function seedConfirmed() {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, "2026-07-24T01:00:00.000Z");
  return { db, id: c.subscription.id };
}

function envFor(db) {
  return { DB: db, BREVO_WEBHOOK_TOKEN: "secret", BREVO_API_KEY: "k" };
}

function post(token, payload) {
  const request = new Request(
    `https://youproof.org/api/v1/newsletter/webhooks/brevo?token=${token}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return { request, url: new URL(request.url) };
}

test("rejects a bad token with 401", async () => {
  const { db } = await seedConfirmed();
  const { request, url } = post("wrong", { event: "delivered", email: input.email });
  const res = await handleWebhook(request, envFor(db), url);
  assert.equal(res.status, 401);
});

test("rejects malformed JSON with 400", async () => {
  const { db } = await seedConfirmed();
  const request = new Request(
    "https://youproof.org/api/v1/newsletter/webhooks/brevo?token=secret",
    { method: "POST", body: "{not json" },
  );
  const res = await handleWebhook(request, envFor(db), new URL(request.url));
  assert.equal(res.status, 400);
});

test("hard bounce suppresses the email, blocks it, and calls Brevo blocklist", async () => {
  const { db, id } = await seedConfirmed();
  const { request, url } = post("secret", {
    event: "hard_bounce",
    email: input.email,
    "message-id": "<m1>",
    ts_epoch: 1600000000000,
    reason: "mailbox unavailable",
  });
  const res = await handleWebhook(request, envFor(db), url);
  assert.equal(res.status, 200);
  assert.equal(db.suppressed.has(input.email), true, "suppression recorded");
  assert.equal(db.rows.get(id).status, "blocked", "subscription blocked");
  assert.equal(fetchCalls.length, 1, "Brevo blocklist called");
  assert.match(fetchCalls[0].url, /\/contacts\//);
  assert.equal(db.events.length, 1, "event recorded");
});

test("spam complaint suppresses + blocks", async () => {
  const { db, id } = await seedConfirmed();
  const { request, url } = post("secret", { event: "spam", email: input.email, "message-id": "<m2>" });
  const res = await handleWebhook(request, envFor(db), url);
  assert.equal(res.status, 200);
  assert.equal(db.suppressionDetails.get(input.email).reason, "spam");
  assert.equal(db.rows.get(id).status, "blocked");
});

test("Brevo-side unsubscribe soft-deletes", async () => {
  const { db, id } = await seedConfirmed();
  const { request, url } = post("secret", { event: "unsubscribed", email: input.email, "message-id": "<m3>" });
  await handleWebhook(request, envFor(db), url);
  assert.equal(db.rows.get(id).status, "unsubscribed");
  assert.equal(db.suppressed.has(input.email), false, "voluntary unsub is not a suppression");
});

test("delivered is recorded but changes no state", async () => {
  const { db, id } = await seedConfirmed();
  const { request, url } = post("secret", { event: "delivered", email: input.email, "message-id": "<m4>" });
  await handleWebhook(request, envFor(db), url);
  assert.equal(db.rows.get(id).status, "confirmed");
  assert.equal(db.suppressed.has(input.email), false);
  assert.equal(db.events.length, 1);
});

test("duplicate delivery is idempotent (dedup on message-id + event)", async () => {
  const { db } = await seedConfirmed();
  for (let i = 0; i < 2; i++) {
    const { request, url } = post("secret", { event: "hard_bounce", email: input.email, "message-id": "<dup>" });
    await handleWebhook(request, envFor(db), url);
  }
  assert.equal(db.events.length, 1, "second identical event ignored");
});

test("missing email/event is acked without action", async () => {
  const { db } = await seedConfirmed();
  const { request, url } = post("secret", { foo: "bar" });
  const res = await handleWebhook(request, envFor(db), url);
  assert.equal(res.status, 200);
  assert.equal(db.events.length, 0);
});
