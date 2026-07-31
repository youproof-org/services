// router.ts coverage. (The temporary `.html` normalization was removed once the
// zone transform was fixed to exclude /api/ — see docs/newsletter.md.)

import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "../src/router.ts";
import { FakeD1 } from "./helpers/fake-d1.mjs";

// Minimal env: these requests are rejected by the Origin check before any DB /
// Turnstile / Brevo access, so nothing else is needed.
const env = { ALLOWED_ORIGINS: "https://staging.youproof.org" };

function req(method, path, headers = {}) {
  const request = new Request(`https://staging.youproof.org${path}`, { method, headers });
  return { request, url: new URL(request.url) };
}

test("subscribe path routes to the handler (403 on missing Origin, not 404)", async () => {
  const { request, url } = req("POST", "/api/v1/newsletter/subscriptions");
  const res = await route(request, env, url);
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "forbidden_origin");
});

test("trailing slash still routes", async () => {
  const { request, url } = req("POST", "/api/v1/newsletter/subscriptions/");
  const res = await route(request, env, url);
  assert.equal(res.status, 403);
});

test("genuinely unknown path 404s", async () => {
  const { request, url } = req("GET", "/api/v1/newsletter/nope");
  const res = await route(request, env, url);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "not_found");
});

// --- confirm / unsubscribe method split --------------------------------------
// Both GETs are read-only landings; the POST is what acts. A regression that
// re-merged them would be invisible without this.

const dbEnv = {
  ...env,
  DB: new FakeD1(),
  SITE_HOST: "staging.youproof.org",
  DEFAULT_LOCALE: "hu",
};

async function hit(method, action) {
  const { request, url } = req(method, `/api/v1/newsletter/subscriptions/x/${action}?token=t`);
  return route(request, dbEnv, url);
}

test("confirm routes GET to the read-only landing and POST to the action", async () => {
  // Unknown id: the landing still redirects (to the invalid marker), while the
  // POST is Origin-gated before any lookup — so a 403 proves it reached the POST
  // handler rather than falling through to 405.
  assert.equal((await hit("GET", "confirm")).status, 302);
  assert.equal((await hit("POST", "confirm")).status, 403);
  assert.equal((await hit("DELETE", "confirm")).status, 405);
  assert.equal((await hit("PUT", "confirm")).status, 405);
});

test("unsubscribe routes GET to the landing, POST and DELETE to the action", async () => {
  assert.equal((await hit("GET", "unsubscribe")).status, 302);
  // No Origin check on this path (RFC 8058 one-click), so an unknown id reaches
  // the lookup and 404s rather than being rejected as cross-origin.
  assert.equal((await hit("POST", "unsubscribe")).status, 404);
  assert.equal((await hit("DELETE", "unsubscribe")).status, 404);
  assert.equal((await hit("PUT", "unsubscribe")).status, 405);
});
