// Cross-check: every migration-manifest target resolves to a real page in the
// Next.js static export (out/).
//
// The redirect manifest generator (infra/cloudflare/worker/scripts/gen-manifest.mjs)
// and the website router both derive localized URLs from the SAME dictionary
// (apps/website/lib/i18n/locales.json) and each content object's `slug`. This
// test guards against the two drifting: for every manifest entry `oldPath ->
// newPath`, it asserts the built export actually contains a page at `newPath`
// (`out/<newPath>.html` or `out/<newPath>/index.html`). A generator target that
// no route emits — a container/locale/slug mismatch — fails here, offline and
// deterministically, before it can ship a broken .hu -> .org redirect.
//
// Build-artifact check (no network), complementary to redirects.test.mjs (which
// checks the live 301 target string). Runs wherever BOTH artifacts are present:
//
//   WEBSITE_OUT=../../apps/website/out \
//   MANIFEST_PATH=../../infra/cloudflare/worker/src/manifest.json \
//   node --test tests/manifest-targets.test.mjs
//
// Self-skips when WEBSITE_OUT is unset (e.g. the live post-deploy gate, which has
// no out/) or when the manifest is empty.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const here = fileURLToPath(new URL(".", import.meta.url));

const manifestPath =
  process.env.MANIFEST_PATH ??
  resolve(here, "../../../infra/cloudflare/worker/src/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const entries = Object.entries(manifest.entries ?? {});

const websiteOut = process.env.WEBSITE_OUT
  ? resolve(process.cwd(), process.env.WEBSITE_OUT)
  : null;

// A page `newPath` is served from either `out/<newPath>.html` (extensionless
// export, e.g. /hu -> hu.html) or `out/<newPath>/index.html`. Root "/" maps to
// index.html.
function pageExists(outDir, newPath) {
  const rel = newPath === "/" ? "index" : newPath.replace(/^\/+/, "").replace(/\/+$/, "");
  return existsSync(resolve(outDir, `${rel}.html`)) || existsSync(resolve(outDir, rel, "index.html"));
}

test(
  "every manifest target resolves to a built page in the export",
  {
    skip: !websiteOut
      ? "WEBSITE_OUT not set — build-artifact cross-check skipped"
      : entries.length === 0
      ? "manifest is empty — nothing to cross-check"
      : false,
  },
  async (t) => {
    assert.ok(existsSync(websiteOut), `WEBSITE_OUT does not exist: ${websiteOut}`);
    for (const [oldPath, newPath] of entries) {
      await t.test(`${oldPath} -> ${newPath}`, () => {
        assert.ok(
          pageExists(websiteOut, newPath),
          `manifest target "${newPath}" (from legacy "${oldPath}") has no page in ${websiteOut} ` +
            `(looked for ${newPath.replace(/^\/+/, "")}.html and .../index.html). ` +
            `The generator and the router may have drifted (container/locale/slug mismatch).`,
        );
      });
    }
  },
);
