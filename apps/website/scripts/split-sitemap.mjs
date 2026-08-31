#!/usr/bin/env node
/**
 * Post-build: split the exported sitemap into one child sitemap per content type
 * and rewrite out/sitemap.xml as the `<sitemapindex>` that lists them.
 *
 * WHY POSTBUILD: Next's metadata convention serializes `app/sitemap.ts` as a
 * single `<urlset>` and its `generateSitemaps` emits per-id files with no index at
 * all, so a sitemap index cannot be expressed through the convention. Keeping
 * app/sitemap.ts as the one enumerator of every URL and splitting the file it
 * produced is what lets both exist: one place decides which URLs are public, and
 * this decides how they are packaged for crawlers. Precedent for rewriting the
 * export after `next build` is set-html-lang.mjs.
 *
 * `robots.txt` needs no change — /sitemap.xml is still the entry point, now as the
 * index — and neither does the CDN config, where `.xml` is already an asset
 * extension and so is served without the `.html`-append transform.
 *
 * The grouping rules and the per-group index allowlist live in
 * lib/sitemap-split.mjs, which is where the unit tests reach them.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitSitemap } from './lib/sitemap-split.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(here, '..')
const sitemapFile = path.join(websiteRoot, 'out', 'sitemap.xml')
const localesFile = path.join(websiteRoot, 'lib', 'i18n', 'locales.json')

if (!existsSync(sitemapFile)) {
  // No static export present (e.g. a non-export build) — nothing to split.
  console.log(`[split-sitemap] no ${path.relative(websiteRoot, sitemapFile)} — skipping.`)
  process.exit(0)
}

const xml = readFileSync(sitemapFile, 'utf8')
if (xml.includes('<sitemapindex')) {
  // A `postbuild` re-run over an export that was already split. `next build`
  // rewrites the sitemap, so the children beside it are this file's own.
  console.log('[split-sitemap] already an index — skipping.')
  process.exit(0)
}

const { locales } = JSON.parse(readFileSync(localesFile, 'utf8'))
const { index, children, heldOut, total } = splitSitemap({ xml, locales })

for (const child of children) {
  writeFileSync(path.join(path.dirname(sitemapFile), child.file), child.xml)
}
writeFileSync(sitemapFile, index)

const summary = children.map((c) => `${c.file} ${c.count}`).join(', ')
const held = heldOut.map((h) => `${h.key}/${h.locale} ${h.count}`).join(', ')
console.log(
  `[split-sitemap] ${total} URL(s) -> ${children.length} child sitemap(s): ${summary}` +
    (held ? `; held out of the index: ${held}` : ''),
)
