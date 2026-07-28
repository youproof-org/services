import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { handleSubscribe } from "../src/handlers/subscribe.ts";
import { getSubscriptionByEmail } from "../src/lib/db.ts";
import { FakeD1 } from "./helpers/fake-d1.mjs";

const validBody = {
  name: "Anna",
  email: "anna@example.com",
  locale: "hu",
  privacyAccepted: true,
  sourcePage: "/hu/cikkek/x",
  sourceFormInstance: "/hu/cikkek/x#pre-footer",
  turnstileToken: "tok",
};

let turnstileOk;
let calls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  turnstileOk = true;
  calls = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/turnstile/")) {
      return new Response(JSON.stringify({ success: turnstileOk }), { status: 200 });
    }
    if (u.includes("/smtp/email")) {
      return new Response(JSON.stringify({ messageId: "<m1>" }), { status: 201 });
    }
    if (u.includes("/contacts")) {
      return new Response(JSON.stringify({ id: 1 }), { status: 201 });
    }
    return new Response("?", { status: 404 });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = (db) => ({
  DB: db,
  ALLOWED_ORIGINS: "https://youproof.org",
  TURNSTILE_SECRET: "s",
  BREVO_API_KEY: "k",
  BREVO_LIST_ID: "7",
  BREVO_SENDER_EMAIL: "hello@youproof.org",
  SITE_HOST: "youproof.org",
  DEFAULT_LOCALE: "hu",
  ALERT_EMAIL: "",
});

function req({ origin = "https://youproof.org", ip = "1.2.3.4", body = validBody } = {}) {
  const headers = { "content-type": "application/json" };
  if (origin) headers.origin = origin;
  if (ip) headers["CF-Connecting-IP"] = ip;
  const request = new Request("https://youproof.org/api/v1/newsletter/subscriptions", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { request, url: new URL(request.url) };
}

const call = (db, opts) => {
  const { request, url } = req(opts);
  return handleSubscribe(request, env(db), url);
};

test("rejects a foreign / missing Origin with 403", async () => {
  const db = new FakeD1();
  assert.equal((await call(db, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(db, { origin: null })).status, 403);
});

test("rejects malformed JSON (400) and invalid body (400)", async () => {
  const db = new FakeD1();
  assert.equal((await call(db, { body: "{bad" })).status, 400);
  assert.equal((await call(db, { body: { ...validBody, email: "nope" } })).status, 400);
});

test("rejects a failed Turnstile with 403 turnstile_failed", async () => {
  const db = new FakeD1();
  turnstileOk = false;
  const res = await call(db);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "turnstile_failed");
});

test("happy path: 202 pending, records attempt, sends confirmation, creates row", async () => {
  const db = new FakeD1();
  const res = await call(db);
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { status: "pending" });
  assert.equal(db.attempts.length, 1, "attempt recorded");
  assert.ok(calls.some((u) => u.includes("/smtp/email")), "confirmation email sent");
  const row = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(row.status, "pending");
  assert.ok(row.brevo_message_id, "messageId persisted");
});

test("rate limited by email with 429 (no Turnstile spend)", async () => {
  const db = new FakeD1();
  const now = new Date().toISOString();
  for (let i = 0; i < 5; i++) {
    db.attempts.push({ id: `a${i}`, email: "anna@example.com", client_ip: "9.9.9.9", attempted_at: now });
  }
  const res = await call(db);
  assert.equal(res.status, 429);
  assert.ok(!calls.some((u) => u.includes("/turnstile/")), "turnstile not called when rate limited");
});

test("suppressed email returns distinct 409 subscription_blocked", async () => {
  const db = new FakeD1();
  db.suppressed.add("anna@example.com");
  const res = await call(db);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "subscription_blocked");
});
