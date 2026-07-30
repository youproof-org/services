#!/usr/bin/env node
/**
 * Post-build guard: fail the build if the footer version didn't resolve.
 *
 * The footer renders `v{process.env.YOUPROOF_VERSION ?? 'UNDEFINED'}`. If the
 * version isn't wired at build time (e.g. a CI build without the env override and
 * without the next.config package.json fallback), pages ship "vUNDEFINED". This
 * runs in `postbuild`, so it aborts the deploy's build step BEFORE the export is
 * uploaded — catching the regression for both staging and production.
 *
 * Scans the exported HTML for the footer version element and asserts every
 * occurrence is a real version (not UNDEFINED / empty), and that at least one
 * page actually rendered it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(websiteRoot, 'out')

// The footer version paragraph, e.g. <p class="...site-footer_version">v2.0.0</p>.
// CSS-module class names are hashed but always contain `site-footer_version`.
// React renders `v{version}` as two adjacent children, so it emits an invisible
// text-separator comment between them: `>v<!-- -->2.0.0<`. Skip that marker.
const VERSION_RE = /site-footer_version[^>]*>v(?:<!-- -->)?([^<]*)</g

function* walkHtml(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkHtml(abs)
    else if (entry.name.endsWith('.html')) yield abs
  }
}

if (!statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  // No static export (e.g. a dev/non-export build) — nothing to check.
  console.log('[check-build-version] no out/ export; skipping.')
  process.exit(0)
}

let seen = 0
const bad = new Set()
for (const file of walkHtml(outDir)) {
  const html = readFileSync(file, 'utf8')
  for (const m of html.matchAll(VERSION_RE)) {
    seen++
    const value = m[1].trim()
    // Valid = a dotted numeric version like 2.0.0. Anything else (UNDEFINED,
    // empty, non-numeric) is a wiring failure.
    if (!/^\d+\.\d+(\.\d+)?/.test(value)) bad.add(value || '(empty)')
  }
}

if (seen === 0) {
  console.error('[check-build-version] no footer version element found in any page — footer missing or markup changed.')
  process.exit(1)
}
if (bad.size > 0) {
  console.error(`[check-build-version] footer version did not resolve: found ${[...bad].join(', ')}. ` +
    'Set YOUPROOF_VERSION or ensure SiteFooter\'s package.json version fallback is intact.')
  process.exit(1)
}

console.log(`[check-build-version] footer version OK across ${seen} page(s).`)
