import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Bundle the newsletter Worker into a single ESM module at `dist/worker.js`,
 * which the Terraform `cloudflare_workers_script` resource uploads (as
 * `main_module`). Mirrors the migration worker's build (see
 * ../worker/build.mjs).
 *
 * Targeting the Workers runtime: ESM output, modern syntax, no Node builtins.
 * `buildinfo.json` (the accepted-privacy-policy content SHA) is imported by
 * src and inlined by esbuild — so the deployed bundle carries the content SHA
 * it was built against, and every content change requires a rebuild + redeploy.
 * This is intentional (see docs/newsletter.md).
 */
await build({
  entryPoints: [resolve(__dirname, "src/index.ts")],
  outfile: resolve(__dirname, "dist/worker.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  platform: "neutral",
  // Cloudflare Workers conditions so any imported deps resolve their
  // worker/browser builds rather than Node builds.
  conditions: ["worker", "browser"],
  mainFields: ["module", "main"],
  loader: { ".json": "json" },
  sourcemap: false,
  minify: true,
  legalComments: "none",
});

console.log("Built dist/worker.js");
