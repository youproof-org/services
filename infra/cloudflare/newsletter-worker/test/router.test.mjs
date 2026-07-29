// router.ts coverage. (The temporary `.html` normalization was removed once the
// zone transform was fixed to exclude /api/ — see docs/newsletter.md.)

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
