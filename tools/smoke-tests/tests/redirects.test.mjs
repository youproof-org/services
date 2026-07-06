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

test("unmigrated path: proxy (pre-migration) or 410 (post-migration)", async () => {
  const res = await request(`${baseUrl}/`);
  if (isPostMigration) {
    assert.equal(res.status, 410, "post-migration: unmigrated path should be 410 Gone");
  } else {
    assert.equal(res.status, 200, "pre-migration: unmigrated path should proxy 200");
    assert.match(
      res.headers.get("content-type") ?? "",
      /text\/html/i,
      "proxied home page should be HTML",
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
        const res = await request(`${baseUrl}${oldPath}?q=1`);
        assert.equal(res.status, 301, `expected 301 for ${oldPath}, got ${res.status}`);
        assert.equal(
          res.headers.get("location"),
          `https://${config.redirectTargetHost}${newPath}?q=1`,
        );
      });
    }
  },
);
