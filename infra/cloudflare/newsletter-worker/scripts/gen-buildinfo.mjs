import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generate src/buildinfo.json — the commit SHA of the youproof-org/content repo
 * this worker is built against (the privacy-policy version a subscriber accepts).
 * esbuild inlines this JSON into the bundle (see build.mjs), so the deployed
 * worker carries the SHA it was built with, and a content change forces a
 * rebuild + redeploy (which the deploy pipeline already does via the content
 * repository_dispatch — see docs/deploy-pipeline.md).
 *
 * This is analogous to the migration worker's gen-manifest.mjs. It is NOT part
 * of the build: the committed buildinfo.json stub (empty sha) keeps the worker
 * buildable/typecheckable without a content checkout. A real deploy runs this
 * explicitly BEFORE `build` with CONTENT_DIR (and/or CONTENT_SHA) available.
 *
 * SHA resolution order:
 *   1. CONTENT_SHA env (the deploy pipeline's already-pinned content_sha), else
 *   2. `git -C $CONTENT_DIR rev-parse HEAD` (the content checkout is a full clone).
 * Fails loudly if neither is available on a real deploy.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../src/buildinfo.json");

function resolveContentSha() {
  if (process.env.CONTENT_SHA && process.env.CONTENT_SHA.trim()) {
    return process.env.CONTENT_SHA.trim();
  }
  const contentDir = process.env.CONTENT_DIR;
  if (!contentDir) {
    throw new Error(
      "gen-buildinfo: neither CONTENT_SHA nor CONTENT_DIR is set. On a real " +
        "deploy, set CONTENT_SHA (preferred) or point CONTENT_DIR at the " +
        "content checkout.",
    );
  }
  return execFileSync("git", ["-C", contentDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

const contentSha = resolveContentSha();
const generatedAt = new Date().toISOString();

writeFileSync(outPath, `${JSON.stringify({ contentSha, generatedAt }, null, 2)}\n`);
console.log(`Wrote buildinfo.json (contentSha=${contentSha})`);
