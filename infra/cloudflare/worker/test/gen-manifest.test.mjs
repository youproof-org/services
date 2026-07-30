// gen-manifest.mjs coverage.
//
// The first production release runs against a `stable/released` content tree that
// may be empty (no books/). The generator must never crash on missing content,
// must produce a valid manifest for every present/absent combination of content
// types, and must emit the root redirect only when content actually exists.
//
// Run: `pnpm --filter @youproof.org/migration-worker test` (or `node --test test/`).

import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const genScript = resolve(__dirname, "..", "scripts", "gen-manifest.mjs");
const validateScript = resolve(__dirname, "..", "scripts", "validate-manifest.mjs");

// Every content type the manifest covers, with a minimal published item carrying
// a legacy-path and the canonical .org URL it must redirect to (LOCALE=hu). The
// canonical shapes mirror apps/website/lib/i18n/url.ts: book/article/newsletter/
// landing sit under a localized container segment; a page has none.
const KINDS = [
  { key: "books",      dir: "books",      file: "book.yaml",       legacy: "/old-book",     to: "/hu/konyvek/books-item",     extraYaml: "parts: []" },
  { key: "articles",   dir: "articles",   file: "article.yaml",    legacy: "/old-article",  to: "/hu/cikkek/articles-item" },
  { key: "newsletter", dir: "newsletter", file: "newsletter.yaml", legacy: "/old-news",     to: "/hu/hirek/newsletter-item" },
  { key: "pages",      dir: "pages",      file: "page.yaml",       legacy: "/old-page",     to: "/hu/pages-item" },
  { key: "landing",    dir: "landing",    file: "landing.yaml",    legacy: "/old-landing",  to: "/hu/landing/landing-item" },
];

// Build a content dir containing one published, legacy-path'd item per `present`
// kind. Book items use an empty `parts: []` so the book-series redirect is emitted
// without needing nested part/chapter YAML.
function buildContentDir(present) {
  const contentDir = mkdtempSync(join(tmpdir(), "gen-manifest-"));
  for (const k of present) {
    const itemDir = join(contentDir, k.dir, `${k.key}-item`);
    mkdirSync(itemDir, { recursive: true });
    const lines = [
      `name: ${k.key}-item`,
      `slug: ${k.key}-item`,
      "published-at: '2020-01-01 00:00:00'",
      `legacy-path: ${k.legacy}`,
    ];
    if (k.extraYaml) lines.push(k.extraYaml);
    writeFileSync(join(itemDir, k.file), lines.join("\n") + "\n");
  }
  return contentDir;
}

// Run gen-manifest to a temp file, assert exit 0, and validate the output through
// the real validate-manifest.mjs. `contentDir === null` unsets CONTENT_DIR.
// Returns the parsed manifest.
function runGen({ contentDir }) {
  const out = join(mkdtempSync(join(tmpdir(), "gen-manifest-out-")), "manifest.json");
  const env = { ...process.env, LOCALE: "hu", MANIFEST_OUT: out };
  if (contentDir === null) delete env.CONTENT_DIR;
  else env.CONTENT_DIR = contentDir;

  execFileSync("node", [genScript], { env, stdio: "pipe" }); // throws on non-zero exit
  execFileSync("node", [validateScript], { env: { ...process.env, MANIFEST_IN: out }, stdio: "pipe" });
  return JSON.parse(readFileSync(out, "utf8"));
}

// --- Missing-content cases that can't be expressed as a present/absent combo ---

test("CONTENT_DIR unset → valid empty manifest (no root redirect)", () => {
  const manifest = runGen({ contentDir: null });
  assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.entries, {});
});

test("subdirs present but empty (books/ + every standalone kind) → valid empty manifest", () => {
  const contentDir = mkdtempSync(join(tmpdir(), "gen-manifest-emptydirs-"));
  try {
    for (const k of KINDS) mkdirSync(join(contentDir, k.dir), { recursive: true });
    const manifest = runGen({ contentDir });
    assert.deepEqual(manifest.entries, {}); // dirs exist but hold no items
  } finally {
    rmSync(contentDir, { recursive: true, force: true });
  }
});

// --- Full present/absent truth table over all content types (2^5 = 32 combos) ---
// For each subset: exit 0, a valid manifest, exactly one redirect per present
// type, and the root redirect iff any content exists.

for (let mask = 0; mask < (1 << KINDS.length); mask++) {
  const present = KINDS.filter((_, i) => mask & (1 << i));
  const label = present.length ? present.map((k) => k.key).join("+") : "no content (empty dir)";

  test(`combination: ${label}`, () => {
    const contentDir = buildContentDir(present);
    try {
      const manifest = runGen({ contentDir });
      const expected = {};
      for (const k of present) expected[k.legacy] = k.to;
      if (present.length > 0) expected["/"] = "/hu"; // root redirect only when content exists
      assert.deepEqual(manifest.entries, expected);
    } finally {
      rmSync(contentDir, { recursive: true, force: true });
    }
  });
}
