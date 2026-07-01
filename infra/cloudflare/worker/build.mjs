import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Bundle the Worker into a single ESM module at `dist/worker.js`, which the
 * Terraform `cloudflare_workers_script` resource uploads (as `main_module`).
 *
 * Targeting the Workers runtime: ESM output, modern syntax, no Node builtins.
 * `manifest.json` is imported by `manifest.ts` and inlined by esbuild, so the
 * manifest is bundled into the script (no KV) — every manifest change requires a
 * rebuild + redeploy. This is intentional (see README).
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
