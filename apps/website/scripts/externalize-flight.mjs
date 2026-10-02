#!/usr/bin/env node
/**
 * Post-build: move each exported page's inline RSC Flight payload into one
 * content-hashed external script under `out/_next/static/flight/`.
 *
 * WHY: the payload is about 62% of every chapter file and sits after the footer, so
 * crawlers that only read the first 2 MB of a page's HTML were measuring the payload,
 * not the content. Next.js has no option to stop inlining it, so the export is
 * rewritten after `next build`, the way set-html-lang.mjs and split-sitemap.mjs
 * already rewrite it.
 *
 * It must run AFTER every check that reads the payload out of the HTML
 * (check-anchors.mjs, check-deferred-panels.mjs), and before check-flight.mjs, which
 * proves the external files carry each page's whole payload.
 *
 * Every page is planned before anything is written: a page whose shape breaks one of
 * the rewrite's assumptions fails the build with the page and the assumption named,
 * and leaves the export untouched. The shape rules live in lib/flight.mjs, which is
 * where the unit tests reach them.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { externalizeFlight, FLIGHT_URL_PREFIX, FlightShapeError } from './lib/flight.mjs'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')
const FLIGHT_DIR = path.join(OUT, ...FLIGHT_URL_PREFIX.split('/').filter(Boolean))

if (!existsSync(OUT)) {
  console.error('[externalize-flight] no out/ directory — run after `next build`.')
  process.exit(1)
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(full)
    else if (entry.name.endsWith('.html')) yield full
  }
}

const rewrites = []
const failures = []
for (const file of htmlFiles(OUT)) {
  const page = path.relative(OUT, file)
  try {
    const html = readFileSync(file, 'utf8')
    rewrites.push({ file, bytesBefore: Buffer.byteLength(html), ...externalizeFlight(html) })
  } catch (error) {
    if (!(error instanceof FlightShapeError)) throw error
    failures.push(`  ${page}: ${error.message}`)
  }
}

if (failures.length > 0) {
  console.error(
    `[externalize-flight] ${failures.length} page(s) do not have the shape the rewrite relies on, ` +
      'so nothing was rewritten.\n  Next.js changed how it inlines the RSC payload: read ' +
      'scripts/lib/flight.mjs and fix the rewrite rather than skipping the page.\n' +
      failures.slice(0, 20).join('\n') +
      (failures.length > 20 ? `\n  …and ${failures.length - 20} more.` : ''),
  )
  process.exit(1)
}

mkdirSync(FLIGHT_DIR, { recursive: true })
const written = new Set()
let htmlBytesBefore = 0
let htmlBytesAfter = 0
let pushes = 0
for (const rewrite of rewrites) {
  htmlBytesBefore += rewrite.bytesBefore
  htmlBytesAfter += Buffer.byteLength(rewrite.html)
  pushes += rewrite.pushCount
  if (!written.has(rewrite.fileName)) {
    writeFileSync(path.join(FLIGHT_DIR, rewrite.fileName), rewrite.source)
    written.add(rewrite.fileName)
  }
  writeFileSync(rewrite.file, rewrite.html)
}

const mib = (bytes) => (bytes / 1024 / 1024).toFixed(1)
console.log(
  `[externalize-flight] ${rewrites.length} page(s), ${pushes} push(es) moved into ${written.size} ` +
    `file(s) under ${FLIGHT_URL_PREFIX}; HTML ~${mib(htmlBytesBefore)} MiB -> ${mib(htmlBytesAfter)} MiB.`,
)
