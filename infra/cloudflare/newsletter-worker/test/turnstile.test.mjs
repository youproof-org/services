import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { verifyTurnstile } from "../src/lib/turnstile.ts";

const env = { TURNSTILE_SECRET: "secret" };
let responder;
let lastInit;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  lastInit = null;
  responder = () => new Response(JSON.stringify({ success: true }), { status: 200 });
  globalThis.fetch = async (_url, init) => {
    lastInit = init;
    return responder();
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("returns true on success and posts secret + response + remoteip", async () => {
  const ok = await verifyTurnstile(env, "token-1", "1.2.3.4");
  assert.equal(ok, true);
  const sent = new URLSearchParams(lastInit.body);
  assert.equal(sent.get("secret"), "secret");
  assert.equal(sent.get("response"), "token-1");
  assert.equal(sent.get("remoteip"), "1.2.3.4");
});

test("returns false when success is false", async () => {
  responder = () => new Response(JSON.stringify({ success: false }), { status: 200 });
  assert.equal(await verifyTurnstile(env, "t", null), false);
});

test("fails closed on non-2xx and on network error", async () => {
  responder = () => new Response("err", { status: 500 });
  assert.equal(await verifyTurnstile(env, "t", null), false);
  responder = () => {
    throw new Error("network down");
  };
  assert.equal(await verifyTurnstile(env, "t", null), false);
});
