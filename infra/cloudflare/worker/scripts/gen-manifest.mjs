import yaml from "js-yaml";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, basename } from "node:path";

/**
 * Generate `src/manifest.json` from the content repo's book hierarchy.
 *
 * Reads `CONTENT_DIR` (same env var the website uses — it points at the content
 * repo's `content/` subdir, with siblings `books/` and `knowledge-base/`), walks
 * every book -> part -> chapter, and emits one manifest entry per chapter that is
 * BOTH `published: true` AND has a `legacy-path`:
 *
 *   key   = the chapter's normalized `legacy-path` (the old youproof.hu path)
 *   value = the chapter's canonical .org path `/books/{book}/chapters/{chapter}`
 *           where {book}/{chapter} are the respective `name` fields.
 *
 * (Parts/sections are NOT part of the public URL — the chapter page is the
 * deepest routed page — so `legacy-path` maps a legacy path straight to the
 * chapter's canonical path. See the canonical URL rule in the YP-120 contract.)
 *
 * Un-published or missing-`legacy-path` chapters simply produce no entry. A
 * `legacy-path` reused by two chapters is a hard error (fails the build).
 *
 * The output is the file consumed at build time by `manifest.ts` (esbuild inlines
 * it into the Worker bundle) and validated by `validate-manifest.mjs`.
 *
 * DEPLOY ORDERING: this generator is NOT part of `prebuild`. The committed
 * `src/manifest.json` (empty entries) must stay buildable/typecheckable without a
 * content checkout, so `prebuild` only runs `validate-manifest`. A real deploy
 * (with CONTENT_DIR available) runs generation explicitly BEFORE the build:
 *
 *   pnpm --filter @youproof.org/migration-worker run generate-manifest
 *   pnpm --filter @youproof.org/migration-worker run build   # prebuild validates
 *
 * Zero external deps beyond `js-yaml` (a workspace catalog dependency). Mirrors
 * the style of `validate-manifest.mjs`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function fail(message) {
  console.error(`gen-manifest: ${message}`);
  process.exit(1);
}

const contentDir = process.env.CONTENT_DIR;
if (!contentDir) {
  fail(
    "CONTENT_DIR environment variable is not set. It must point at the content " +
      "repo's `content/` subdir (the one containing `books/`).",
  );
}

const booksDir = resolve(contentDir, "books");
if (!existsSync(booksDir)) {
  fail(`no 'books/' directory found under CONTENT_DIR (${booksDir}).`);
}

/** Directory basename with a leading `NN-` numeric prefix stripped, if present. */
function stripPrefix(name) {
  return name.replace(/^\d+-/, "");
}

/** List immediate subdirectory names of `dir`. */
function subdirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

/** Read + parse a YAML file into a plain object. */
function loadYaml(filePath) {
  const parsed = yaml.load(readFileSync(filePath, "utf8"));
  if (typeof parsed !== "object" || parsed === null) {
    fail(`${filePath}: expected a YAML mapping.`);
  }
  return parsed;
}

/**
 * Normalize a path to the manifest's shape: leading slash, no trailing slash
 * (except the root "/"). Satisfies the schema pattern `^/(|.*[^/])$`.
 */
function normalizePath(raw) {
  let p = String(raw).trim();
  if (!p.startsWith("/")) p = `/${p}`;
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/** Resolve an ordered child `name` to its actual directory (basename minus NN-). */
function resolveChildDir(parentDir, childName) {
  const match = subdirs(parentDir).find((d) => stripPrefix(d) === childName);
  return match ? join(parentDir, match) : null;
}

const entries = {};
// Track which chapter each legacy-path came from, for a clear duplicate error.
const legacyPathOwners = new Map();
let chaptersScanned = 0;

// A book directory is any immediate subdir of books/ that has a book.yaml.
const bookDirs = subdirs(booksDir).filter((d) =>
  existsSync(join(booksDir, d, "book.yaml")),
);

for (const bookDirName of bookDirs) {
  const bookDir = join(booksDir, bookDirName);
  const book = loadYaml(join(bookDir, "book.yaml"));
  const bookName = typeof book.name === "string" ? book.name : stripPrefix(bookDirName);
  const partNames = Array.isArray(book.parts) ? book.parts : [];

  for (const partName of partNames) {
    const partDir = resolveChildDir(bookDir, partName);
    if (!partDir) {
      fail(`book '${bookName}': part '${partName}' has no matching directory under ${bookDir}.`);
    }
    const partYaml = join(partDir, "part.yaml");
    if (!existsSync(partYaml)) {
      fail(`part '${partName}': missing part.yaml at ${partYaml}.`);
    }
    const part = loadYaml(partYaml);
    const chapterNames = Array.isArray(part.chapters) ? part.chapters : [];

    for (const chapterName of chapterNames) {
      const chapterDir = resolveChildDir(partDir, chapterName);
      if (!chapterDir) {
        fail(`part '${partName}': chapter '${chapterName}' has no matching directory under ${partDir}.`);
      }
      const chapterYaml = join(chapterDir, "chapter.yaml");
      if (!existsSync(chapterYaml)) {
        fail(`chapter '${chapterName}': missing chapter.yaml at ${chapterYaml}.`);
      }
      const chapter = loadYaml(chapterYaml);
      chaptersScanned += 1;

      const published = chapter.published === true;
      const legacyPathRaw = chapter["legacy-path"];
      if (!published || typeof legacyPathRaw !== "string" || legacyPathRaw.trim() === "") {
        continue;
      }

      const name = typeof chapter.name === "string" ? chapter.name : chapterName;
      const from = normalizePath(legacyPathRaw);
      const to = normalizePath(`/books/${bookName}/chapters/${name}`);

      if (from === to) {
        fail(
          `chapter '${name}' (${chapterYaml}): legacy-path '${from}' equals its ` +
            `canonical path — that would be a self-redirect.`,
        );
      }

      const existing = legacyPathOwners.get(from);
      if (existing) {
        fail(
          `duplicate legacy-path '${from}' used by two chapters:\n` +
            `  - ${existing}\n  - ${chapterYaml}`,
        );
      }
      legacyPathOwners.set(from, chapterYaml);
      entries[from] = to;
    }
  }
}

const updatedAt = process.env.MANIFEST_UPDATED_AT || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
  fail(`MANIFEST_UPDATED_AT must be an ISO date (YYYY-MM-DD); got '${updatedAt}'.`);
}

const manifest = { version: 1, updatedAt, entries };
const outPath = resolve(root, "src/manifest.json");
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const entryCount = Object.keys(entries).length;
console.log(
  `gen-manifest: scanned ${chaptersScanned} chapter${chaptersScanned === 1 ? "" : "s"}, ` +
    `emitted ${entryCount} entr${entryCount === 1 ? "y" : "ies"} to src/manifest.json ` +
    `(updatedAt ${updatedAt}).`,
);
