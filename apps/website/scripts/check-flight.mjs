#!/usr/bin/env node
/**
 * Post-build: every rewritten page's external flight file must carry the page's
 * whole RSC payload, in order.
 *
 * externalize-flight.mjs copies the push statements without decoding them, so what
 * it can prove on its own is only the page's shape. This proves the result: it
 * decodes the `[1, "…"]` chunks of each page's one flight file and compares them
 * with the `.txt` Next.js writes beside the page for client navigation. The two are
 * written separately by Next.js and were byte-identical on every page when the
 * rewrite was introduced, so a difference means the rewrite lost or reordered
 * something, or Next.js changed one of the two formats. Either way the build stops.
 *
 * It also checks what a reader's browser relies on: no inline `__next_f` script is
 * left, the page loads exactly one flight file, that file exists, and its name is
 * the hash of its content.
 *
 * ## Pages without a `.txt`
 *
 * Next.js writes no `.txt` for `404.html`, the not-found route's page, so there is
 * nothing to compare it with. It gets every check except the comparison. Only the
 * pages in `PAGES_WITHOUT_PAYLOAD_FILE` are allowed that; any other page missing its
 * `.txt` fails, because a comparison that silently stops happening is the failure
 * this check exists to prevent.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkFlightPage, FLIGHT_URL_PREFIX } from './lib/flight.mjs'

const PAGES_WITHOUT_PAYLOAD_FILE = new Set(['404.html'])

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')
const FLIGHT_DIR = path.join(OUT, ...FLIGHT_URL_PREFIX.split('/').filter(Boolean))

if (!existsSync(OUT)) {
  console.error('[check-flight] no out/ directory — run after `next build`.')
  process.exit(1)
}

function* htmlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* htmlFiles(full)
    else if (entry.name.endsWith('.html')) yield full
  }
}

const readIfExists = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined)
const flightSources = new Map()
const readFlight = (fileName) => {
  if (!flightSources.has(fileName)) flightSources.set(fileName, readIfExists(path.join(FLIGHT_DIR, fileName)))
  return flightSources.get(fileName)
}

const failures = []
let pages = 0
let compared = 0
for (const file of htmlFiles(OUT)) {
  pages++
  const page = path.relative(OUT, file).replace(/\\/g, '/')
  const txt = readIfExists(file.replace(/\.html$/, '.txt')) ?? null
  const problems = checkFlightPage({ html: readFileSync(file, 'utf8'), readFlight, txt })
  if (txt === null && !PAGES_WITHOUT_PAYLOAD_FILE.has(page)) {
    problems.push('the page has no `.txt` to compare its payload with.')
  }
  if (txt !== null) compared++
  for (const problem of problems) failures.push(`  ${page}: ${problem}`)
}

if (compared === 0) failures.push(`  no page in ${pages} had a \`.txt\` to compare with, so nothing was proved.`)

if (failures.length > 0) {
  console.error(
    `[check-flight] ${failures.length} problem(s) with the external RSC payload:\n` +
      failures.slice(0, 20).join('\n') +
      (failures.length > 20 ? `\n  …and ${failures.length - 20} more.` : ''),
  )
  process.exit(1)
}

console.log(
  `[check-flight] ${pages} page(s) load one external flight file each; ${compared} payload(s) ` +
    `match their .txt, ${pages - compared} have none (${[...PAGES_WITHOUT_PAYLOAD_FILE].join(', ')}).`,
)
