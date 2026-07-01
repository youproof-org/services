import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Validate `src/manifest.json` against `src/manifest.schema.json`.
 *
 * Run in CI before build/deploy (`pnpm run validate-manifest`) so a malformed
 * manifest edit fails fast instead of breaking the live Worker. Exits non-zero
 * on any schema violation or duplicate/oddly-shaped entry.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const schema = JSON.parse(readFileSync(resolve(root, "src/manifest.schema.json"), "utf8"));
const manifestRaw = readFileSync(resolve(root, "src/manifest.json"), "utf8");

let manifest;
try {
  manifest = JSON.parse(manifestRaw);
} catch (err) {
  console.error("manifest.json is not valid JSON:", err.message);
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

if (!validate(manifest)) {
  console.error("manifest.json failed schema validation:");
  for (const error of validate.errors ?? []) {
    console.error(`  ${error.instancePath || "(root)"} ${error.message}`);
  }
  process.exit(1);
}

// Extra semantic checks the JSON Schema can't express cleanly.
const errors = [];
for (const [from, to] of Object.entries(manifest.entries)) {
  if (from === to) {
    errors.push(`entry '${from}' redirects to itself`);
  }
}

if (errors.length > 0) {
  console.error("manifest.json failed semantic validation:");
  for (const error of errors) {
    console.error(`  ${error}`);
  }
  process.exit(1);
}

const count = Object.keys(manifest.entries).length;
console.log(`manifest.json is valid (version ${manifest.version}, ${count} entr${count === 1 ? "y" : "ies"}).`);
