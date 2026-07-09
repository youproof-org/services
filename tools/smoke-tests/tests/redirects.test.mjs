// Post-deploy redirect smoke tests for the migration Worker.
//
// Deterministic HTTP checks that automate the redirect-facing subset of the
// manual verification checklist in docs/migration-worker.md. Run against a
// live, just-deployed environment:
//
//   WORKER_DOMAIN=staging.youproof.hu \
//   LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
//   REDIRECT_TARGET_HOST=youproof.org \
//   ENVIRONMENT=staging \
//   node --test tests/
//
// Cases self-skip when their config isn't applicable (post-migration mode, or
// the www case outside production).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

import { baseUrl, config, isPostMigration, isProduction, request, wwwHost } from "../lib/config.mjs";

const manifestUrl = new URL(
  "../../../infra/cloudflare/worker/src/manifest.json",
  import.meta.url,
);
const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
const manifestEntries = Object.entries(manifest.entries ?? {});

test("admin/login paths are blocked with 404", async () => {
  for (const path of ["/wp-admin", "/wp-login.php", "/wp-admin/options.php"]) {
    const res = await request(`${baseUrl}${path}`);
    assert.equal(res.status, 404, `expected 404 for ${path}, got ${res.status}`);
  }
});

test("unmigrated non-admin path: proxied (pre-migration) or 410 (post-migration)", async () => {
  // NOTE: the root "/" is now a migrated entry ("/" -> "/", the youproof.hu ->
  // youproof.org redirect), so it is covered by the "migrated paths" test below.
  // Here we probe a path guaranteed NOT to be in the manifest.
  const res = await request(`${baseUrl}/nem-letezo-oldal-smoke-teszt`);
  if (isPostMigration) {
    assert.equal(res.status, 410, "post-migration: unmigrated path should be 410 Gone");
  } else {
    // Pre-migration it must be proxied to legacy, not handled by the Worker:
    // legacy may answer 200 or its own 404, but it must NOT be a Worker 410 nor
    // a migration redirect to the .org target.
    assert.notEqual(res.status, 410, "pre-migration: unmigrated path must be proxied, not 410");
    const loc = res.headers.get("location") ?? "";
    assert.ok(
      !loc.startsWith(`https://${config.redirectTargetHost}`),
      "unmigrated path must not be redirected to the .org target",
    );
  }
});

test("http is redirected to https", async () => {
  const res = await request(`http://${config.workerDomain}/`);
  assert.equal(res.status, 301, `expected 301, got ${res.status}`);
  assert.ok(
    (res.headers.get("location") ?? "").startsWith("https://"),
    "Location should be an https URL",
  );
});

test(
  "www is redirected to the apex, preserving path and query",
  { skip: isProduction ? false : "www.staging has no cert (Universal-SSL gap) — production only" },
  async () => {
    const res = await request(`https://${wwwHost}/some/path?y=1`);
    assert.equal(res.status, 301, `expected 301, got ${res.status}`);
    assert.equal(
      res.headers.get("location"),
      `https://${config.workerDomain}/some/path?y=1`,
    );
  },
);

test(
  "legacy origin rejects direct access without the guard header (404)",
  { skip: isPostMigration ? "post-migration: no legacy origin" : false },
  async () => {
    const res = await request(`https://${config.legacyProxyHost}/`);
    assert.equal(res.status, 404, `expected 404, got ${res.status}`);
  },
);

test(
  "migrated paths 301 to the .org target, preserving query",
  { skip: manifestEntries.length === 0 ? "manifest is empty — nothing migrated yet" : false },
  async (t) => {
    for (const [oldPath, newPath] of manifestEntries) {
      await t.test(`${oldPath} -> ${newPath}`, async () => {
        // Cache-busting query: the top-level legacy URLs ("/" and the series
        // landing "/kriptografia") are cacheable, so right after a deploy the
        // edge can still serve the pre-migration proxied response (a 200, or a
        // WordPress trailing-slash redirect) under the stable "?q=1" cache key.
        // A unique query forces a cache miss so we test the just-deployed Worker,
        // not a stale entry. The query is preserved into the redirect, so we
        // also assert it round-trips verbatim.
        const query = `q=1&_cb=${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
        const res = await request(`${baseUrl}${oldPath}?${query}`);
        assert.equal(res.status, 301, `expected 301 for ${oldPath}, got ${res.status}`);
        assert.equal(
          res.headers.get("location"),
          `https://${config.redirectTargetHost}${newPath}?${query}`,
        );
      });
    }
  },
);
