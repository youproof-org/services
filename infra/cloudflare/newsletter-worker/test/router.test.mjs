// router.ts coverage — focused on the TEMPORARY `.html` normalization that works
// around the zone's .html-stripping Transform Rule (see router.ts / docs).

import assert from "node:assert/strict";
import { test } from "node:test";
import { route } from "../src/router.ts";

// Minimal env: these requests are rejected by the Origin check before any DB /
// Turnstile / Brevo access, so nothing else is needed.
const env = { ALLOWED_ORIGINS: "https://staging.youproof.org" };

function req(method, path, headers = {}) {
  const request = new Request(`https://staging.youproof.org${path}`, { method, headers });
  return { request, url: new URL(request.url) };
}

test(".html-suffixed subscribe path still routes to the handler (not 404)", async () => {
  // The zone transform turns /subscriptions into /subscriptions.html; the router
  // must still dispatch it to handleSubscribe (which then 403s on missing Origin).
  const { request, url } = req("POST", "/api/v1/newsletter/subscriptions.html");
  const res = await route(request, env, url);
  assert.equal(res.status, 403); // forbidden_origin — reached the handler, not not_found
  assert.equal((await res.json()).code, "forbidden_origin");
});

test("trailing slash also routes", async () => {
  const { request, url } = req("POST", "/api/v1/newsletter/subscriptions/");
  const res = await route(request, env, url);
  assert.equal(res.status, 403);
});

test(".html-suffixed confirm path matches the detail route (not 404)", async () => {
  // No token/env → confirm redirects to the homepage with newsletter_confirmed=invalid
  // (a 302), proving the route matched rather than falling through to not_found.
  const { request, url } = req("GET", "/api/v1/newsletter/subscriptions/abc/confirm.html");
  const res = await route(request, { ...env, DB: fakeEmptyDb(), SITE_HOST: "staging.youproof.org", DEFAULT_LOCALE: "hu" }, url);
  assert.equal(res.status, 302);
});

test("genuinely unknown path still 404s", async () => {
  const { request, url } = req("GET", "/api/v1/newsletter/nope");
  const res = await route(request, env, url);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, "not_found");
});

// A D1 stub that returns no subscription (so confirm treats the token as invalid).
function fakeEmptyDb() {
  return {
    prepare() {
      return { bind() { return this; }, async first() { return null; }, async run() {}, async all() { return { results: [] }; } };
    },
  };
}
