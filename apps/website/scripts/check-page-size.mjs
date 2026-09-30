#!/usr/bin/env node
/**
 * Post-build: no exported HTML page may be over the size gate
 * (`PAGE_SIZE_LIMIT` in lib/page-size.mjs), apart from the pages in
 * `KNOWN_OVERSIZE`, which are reported as warnings. A local build also allows
 * `KNOWN_OVERSIZE_UNPUBLISHED`, the chapters only it renders in full.
 *
 * Ahrefs flags a page whose whole HTML file is over 2 MiB, on the reasoning that
 * Googlebot reads only the first 2 MB of it. So this runs after
 * externalize-flight.mjs and measures what a crawler downloads: the page without its
 * RSC payload. The payload files themselves are not gated: Google fetches each
 * resource referenced in the HTML separately, under its own limit. Every page is
 * measured, not only chapters.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluatePageSizes, knownOversizeFor, PAGE_SIZE_LIMIT } from './lib/page-size.mjs'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')

if (!existsSync(OUT)) {
  console.error('[check-page-size] no out/ directory — run after `next build`.')
  process.exit(1)
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(full)
    else if (entry.name.endsWith('.html')) yield full
  }
}

const sizes = new Map()
for (const file of htmlFiles(OUT)) {
  sizes.set(path.relative(OUT, file).replace(/\\/g, '/'), statSync(file).size)
}

if (sizes.size === 0) {
  console.error('[check-page-size] no HTML page in out/, so nothing was measured.')
  process.exit(1)
}

const { errors, warnings } = evaluatePageSizes(sizes, { knownOversize: knownOversizeFor(process.env.SITE_ENV) })
for (const warning of warnings) console.warn(`[check-page-size] warning: ${warning}`)

if (errors.length > 0) {
  console.error(`[check-page-size] ${errors.length} problem(s):\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}

const [largest, largestSize] = [...sizes].sort(([, a], [, b]) => b - a)[0] ?? ['none', 0]
console.log(
  `[check-page-size] ${sizes.size} page(s) on ${process.env.SITE_ENV || 'local'} checked against ${PAGE_SIZE_LIMIT.toLocaleString('en-US')} bytes; ` +
    `${warnings.length} known oversize; largest ${largest} (${largestSize.toLocaleString('en-US')} bytes).`,
)
