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
 *   value = the chapter's canonical .org path
 *           `/{locale}/{book-container}/{book-slug}/{chapter-container}/{chapter-slug}`
 *
 * The target LOCALE (the .org language this legacy domain maps to; youproof.hu ->
 * hu) is supplied explicitly per Worker environment via `--locale <code>` or the
 * `LOCALE` env var — never hardcoded. The locale prefix and the localized
 * container segments (konyvek/fejezetek/cikkek/hirek) come from the SAME
 * source of truth the website uses: `apps/website/lib/i18n/locales.json`. The
 * `{...-slug}` segments are each content object's `slug` (falling back to a
 * lowercased `name`), matching how the site builds URLs via buildLocalizedUrl.
 *
 * (Parts/sections are NOT part of the public URL — the chapter page is the
 * deepest routed page — so `legacy-path` maps a legacy path straight to the
 * chapter's canonical path.)
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

function warn(message) {
  console.warn(`gen-manifest: ${message}`);
}

// A content object is published iff it has a non-empty `published-at`
// (js-yaml may parse an ISO timestamp into a Date, so stringify defensively).
function isPublished(obj) {
  const v = obj["published-at"];
  return v != null && String(v).trim() !== "";
}

// CONTENT_DIR / books/ are intentionally NOT hard failures: the first production
// release runs against a `stable/released` content tree that is still empty (no
// `books/` yet), which is a valid state. An empty content tree yields a fully
// empty manifest (`entries: {}` — not even the root redirect; see below), which
// matches the committed placeholder. LOCALE and the locale dictionary stay
// required — they are per-Worker-environment config, not content.
const contentDir = process.env.CONTENT_DIR;
if (!contentDir) {
  warn(
    "CONTENT_DIR is not set — generating an empty manifest (no entries). " +
      "This is valid for a release with no content yet; point CONTENT_DIR at the " +
      "content repo's `content/` subdir (the one containing `books/`) to emit redirects.",
  );
}

const booksDir = contentDir ? resolve(contentDir, "books") : null;
if (contentDir && !existsSync(booksDir)) {
  warn(`no 'books/' directory found under CONTENT_DIR (${booksDir}) — no book redirects emitted.`);
}

// Target locale for this legacy domain's .org counterparts (youproof.hu -> hu).
// Supplied per Worker environment via `--locale <code>` or the LOCALE env var;
// never hardcoded here.
const localeArgIdx = process.argv.indexOf("--locale");
const LOCALE =
  localeArgIdx !== -1 ? process.argv[localeArgIdx + 1] : process.env.LOCALE;
if (!LOCALE) {
  fail(
    "target locale not set. Pass `--locale <code>` or set LOCALE (e.g. hu). It " +
      "selects the .org locale prefix + localized container dictionary this " +
      "legacy domain maps to.",
  );
}

// Shared locale/container dictionary — the SAME source of truth the website uses
// (apps/website/lib/i18n/locales.json), so localized container segments
// (konyvek/fejezetek/...) and the locale set live in exactly one place. This
// script cannot import the website's TypeScript config, so it reads the raw JSON
// by relative path; keep the two in sync via that shared file.
const localesPath = resolve(
  __dirname, "..", "..", "..", "..", "apps", "website", "lib", "i18n", "locales.json",
);
if (!existsSync(localesPath)) {
  fail(`shared locale dictionary not found at ${localesPath}.`);
}
const localesData = JSON.parse(readFileSync(localesPath, "utf8"));
const localeCfg = localesData?.locales?.[LOCALE];
if (!localeCfg) {
  fail(
    `locale '${LOCALE}' is not configured in ${localesPath} ` +
      `(known: ${Object.keys(localesData?.locales ?? {}).join(", ") || "none"}).`,
  );
}

/** Localized URL segment for a canonical container key (e.g. book -> konyvek). */
function containerSeg(key) {
  const seg = localeCfg.containers?.[key];
  if (!seg) fail(`locale '${LOCALE}' has no container segment for '${key}'.`);
  return seg;
}

/** A content object's URL slug: its `slug` field, else a lowercased `name`. */
function slugOf(obj, fallbackName) {
  const s = obj.slug;
  if (typeof s === "string" && s.trim() !== "") return s.trim();
  return String(fallbackName).toLowerCase();
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

/**
 * Resolve an ordered child `name` to its actual directory by reading each
 * candidate's structural YAML `name` field — NOT the folder basename. Folder
 * names on disk are arbitrary (they may carry an NN- ordering prefix); only the
 * YAML `name` is authoritative. `childYaml` is the structural file to read
 * (`part.yaml` / `chapter.yaml`).
 */
function resolveChildDir(parentDir, childName, childYaml) {
  for (const d of subdirs(parentDir)) {
    const yamlPath = join(parentDir, d, childYaml);
    if (!existsSync(yamlPath)) continue;
    const obj = loadYaml(yamlPath);
    if (obj && obj.name === childName) return join(parentDir, d);
  }
  return null;
}

const entries = {};
// Track which content object each legacy-path came from, for a clear duplicate
// error.
const legacyPathOwners = new Map();
let chaptersScanned = 0;
// Whether any content object exists at all (book dirs or standalone items),
// regardless of published/legacy-path — gates the root redirect below.
let standaloneItemsSeen = 0;

// Register one legacy-path -> canonical-path redirect, guarding against
// self-redirects and duplicate legacy-paths across all content types.
function addEntry(from, to, ownerFile) {
  if (from === to) {
    fail(
      `${ownerFile}: legacy-path '${from}' equals its canonical path — that ` +
        `would be a self-redirect.`,
    );
  }
  const existing = legacyPathOwners.get(from);
  if (existing) {
    fail(
      `duplicate legacy-path '${from}' used by two content objects:\n` +
        `  - ${existing}\n  - ${ownerFile}`,
    );
  }
  legacyPathOwners.set(from, ownerFile);
  entries[from] = to;
}

// A book directory is any immediate subdir of books/ that has a book.yaml.
// Empty when there is no content tree / no books/ (handled above) — the loop
// simply doesn't run and only the root redirect is emitted.
const bookDirs = booksDir && existsSync(booksDir)
  ? subdirs(booksDir).filter((d) => existsSync(join(booksDir, d, "book.yaml")))
  : [];

for (const bookDirName of bookDirs) {
  const bookDir = join(booksDir, bookDirName);
  const bookYaml = join(bookDir, "book.yaml");
  const book = loadYaml(bookYaml);
  const bookName = typeof book.name === "string" ? book.name : stripPrefix(bookDirName);
  const partNames = Array.isArray(book.parts) ? book.parts : [];

  // Book (series) index redirect: legacy series URL -> /{locale}/{book}/{slug}.
  if (isPublished(book) && typeof book["legacy-path"] === "string" && book["legacy-path"].trim() !== "") {
    addEntry(
      normalizePath(book["legacy-path"]),
      normalizePath(`/${LOCALE}/${containerSeg("book")}/${slugOf(book, bookName)}`),
      bookYaml,
    );
  }

  for (const partName of partNames) {
    const partDir = resolveChildDir(bookDir, partName, "part.yaml");
    if (!partDir) {
      fail(`book '${bookName}': no part.yaml with name '${partName}' found under ${bookDir}.`);
    }
    const partYaml = join(partDir, "part.yaml");
    const part = loadYaml(partYaml);
    const chapterNames = Array.isArray(part.chapters) ? part.chapters : [];

    for (const chapterName of chapterNames) {
      const chapterDir = resolveChildDir(partDir, chapterName, "chapter.yaml");
      if (!chapterDir) {
        fail(`part '${partName}': no chapter.yaml with name '${chapterName}' found under ${partDir}.`);
      }
      const chapterYaml = join(chapterDir, "chapter.yaml");
      const chapter = loadYaml(chapterYaml);
      chaptersScanned += 1;

      const legacyPathRaw = chapter["legacy-path"];
      if (!isPublished(chapter) || typeof legacyPathRaw !== "string" || legacyPathRaw.trim() === "") {
        continue;
      }

      const bookSlug = slugOf(book, bookName);
      const chapterSlug = slugOf(chapter, chapterName);
      addEntry(
        normalizePath(legacyPathRaw),
        normalizePath(
          `/${LOCALE}/${containerSeg("book")}/${bookSlug}/${containerSeg("chapter")}/${chapterSlug}`,
        ),
        chapterYaml,
      );
    }
  }
}

// ---- Standalone content: articles, newsletter, pages, landing ----
// Each kind lives under `{contentDir}/{dir}/{itemDir}/{file}`. Emit a redirect
// for every item that is BOTH published (has published-at) AND has a legacy-path.
// `containerKey` is the canonical container key (localized via the dictionary);
// `null` means the kind has no container segment (custom pages -> /{locale}/{slug}).
//
// Covers every standalone kind the website routes — the full StandaloneKind set
// (article | newsletter | page | landing) — so ANY of them can carry a legacy
// youproof.hu path and get a redirect, matching how the site builds their URLs
// (see apps/website/lib/i18n/url.ts). Only articles and pages have legacy paths
// today, but the list is generic so newsletter/landing work the moment one does.
// knowledge-base is NOT here: it is embedded reference content (definitions/
// theorems under namespaces), not a standalone routable page, so it has no
// legacy-path redirect.
const STANDALONE = [
  { dir: "articles", file: "article.yaml", containerKey: "article" },
  { dir: "newsletter", file: "newsletter.yaml", containerKey: "newsletter" },
  { dir: "pages", file: "page.yaml", containerKey: null },
  { dir: "landing", file: "landing.yaml", containerKey: "landing" },
];

for (const { dir, file, containerKey } of STANDALONE) {
  if (!contentDir) break; // no content tree → nothing to scan (manifest stays empty)
  const kindDir = resolve(contentDir, dir);
  if (!existsSync(kindDir)) continue; // this kind's dir absent → no entries for it

  for (const itemDir of subdirs(kindDir)) {
    const itemYaml = join(kindDir, itemDir, file);
    if (!existsSync(itemYaml)) continue;
    standaloneItemsSeen += 1;
    const item = loadYaml(itemYaml);
    const legacyPathRaw = item["legacy-path"];
    if (!isPublished(item) || typeof legacyPathRaw !== "string" || legacyPathRaw.trim() === "") {
      continue;
    }
    const name = typeof item.name === "string" ? item.name : stripPrefix(itemDir);
    const itemSlug = slugOf(item, name);
    const to = containerKey === null
      ? `/${LOCALE}/${itemSlug}`
      : `/${LOCALE}/${containerSeg(containerKey)}/${itemSlug}`;
    addEntry(normalizePath(legacyPathRaw), normalizePath(to), itemYaml);
  }
}

// ---- Root redirect: youproof.hu/ -> youproof.org/{locale} ----
// Path-to-path is "/" -> "/{locale}"; the worker redirects to
// REDIRECT_TARGET_HOST, so this crosses domains (.hu -> .org). The bare .org root
// has no page (every page is locale-prefixed), so land on the locale homepage.
// Emitted ONLY when content actually exists — an empty content tree produces a
// fully empty manifest (no point redirecting to a contentless site, and it keeps
// the empty manifest identical to the committed placeholder). Reserve "/".
const contentFound = bookDirs.length > 0 || standaloneItemsSeen > 0;
if (contentFound) {
  if (legacyPathOwners.has("/")) {
    fail(`legacy-path '/' is reserved for the root redirect but is already used by ${legacyPathOwners.get("/")}.`);
  }
  entries["/"] = normalizePath(`/${LOCALE}`);
}

const updatedAt = process.env.MANIFEST_UPDATED_AT || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(updatedAt)) {
  fail(`MANIFEST_UPDATED_AT must be an ISO date (YYYY-MM-DD); got '${updatedAt}'.`);
}

const manifest = { version: 1, updatedAt, entries };
// Defaults to the committed manifest; MANIFEST_OUT lets tests write elsewhere
// without clobbering src/manifest.json.
const outPath = process.env.MANIFEST_OUT
  ? resolve(process.env.MANIFEST_OUT)
  : resolve(root, "src/manifest.json");
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const entryCount = Object.keys(entries).length;
console.log(
  `gen-manifest: scanned ${chaptersScanned} chapter${chaptersScanned === 1 ? "" : "s"}, ` +
    `emitted ${entryCount} entr${entryCount === 1 ? "y" : "ies"} to src/manifest.json ` +
    `(updatedAt ${updatedAt}).`,
);
