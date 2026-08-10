#!/usr/bin/env node
/**
 * Post-build guard for the analytics/consent wiring. Runs in `postbuild`, so it
 * aborts the deploy's build step BEFORE the export is uploaded.
 *
 * Four invariants, each of which has a specific way of failing silently:
 *
 *  1. A deploy build (SITE_ENV set) must have a measurement ID. Without one the
 *     consent UI renders nothing at all, so a missing GitHub Environment variable
 *     would ship a site with no analytics and no banner and look fine.
 *  2. Exactly one distinct G- id appears across the export. Two would mean a
 *     stale value baked in somewhere, and the whole point of separate
 *     staging/production properties is that traffic cannot cross over.
 *  3. No .html references googletagmanager.com. This is what "GA4 does not load
 *     before consent" reduces to for a static export: if the tag cannot be
 *     reached from markup, only the consent-gated code path can load it.
 *  4. The banner's own copy appears in no .html, and the policy-page link list is
 *     non-empty. The first proves ConsentGate still renders nothing on the server
 *     (the no-flash-of-banner design); the second proves the banner cannot render
 *     without a policy link, which would be a compliance defect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(websiteRoot, 'out')

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''
const siteEnv = process.env.SITE_ENV ?? ''

const { cookiePolicyVersion, pages } = JSON.parse(
  readFileSync(path.join(websiteRoot, '.generated', 'consent-policy.json'), 'utf8'),
)

const fail = (msg) => {
  console.error(`[check-analytics-build] ${msg}`)
  process.exit(1)
}

// A deploy build must be fully wired. Local builds are allowed to be silent.
if (siteEnv && !measurementId) {
  fail(
    `SITE_ENV=${siteEnv} but NEXT_PUBLIC_GA_MEASUREMENT_ID is empty — the consent UI and ` +
      'analytics would both be absent. Set the GA_MEASUREMENT_ID variable on this ' +
      'GitHub Environment, or drop SITE_ENV for a local build.',
  )
}

// The feature is live only when there is both a tag to gate and a policy to link.
const live = measurementId !== '' && cookiePolicyVersion >= 1 && pages.length > 0

if (live) {
  const locales = new Set(pages.map((p) => p.locale))
  const defaultLocale = process.env.DEFAULT_LOCALE || 'hu'
  if (!locales.has(defaultLocale)) {
    fail(
      `cookie policy pages exist (${[...locales].join(', ')}) but none for the default locale ` +
        `"${defaultLocale}" — the banner would render with no policy link. Add ` +
        'cookie-policy-version to a page in that locale.',
    )
  }
}

if (!statSync(outDir, { throwIfNoEntry: false })?.isDirectory()) {
  console.log('[check-analytics-build] no out/ export; skipping HTML checks.')
  process.exit(0)
}

function* walkFiles(dir, ext) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkFiles(abs, ext)
    else if (entry.name.endsWith(ext)) yield abs
  }
}

// The banner's CSS-module class, which appears in markup only if the banner was
// server-rendered. Deliberately a class name rather than a phrase from the
// Hungarian copy: the copy will be reworded, the class name is structural.
// Same trick check-build-version.mjs uses with `site-footer_version`.
const BANNER_CLASS = 'consent-banner_banner'

const withTagManager = []
const withBanner = []
let htmlFiles = 0

for (const file of walkFiles(outDir, '.html')) {
  htmlFiles += 1
  const html = readFileSync(file, 'utf8')
  if (html.includes('googletagmanager.com')) withTagManager.push(path.relative(outDir, file))
  if (html.includes(BANNER_CLASS)) withBanner.push(path.relative(outDir, file))
}

// The measurement id and the banner component live in the JS bundle, not the
// markup — NEXT_PUBLIC_* is inlined into the chunks. Scanning HTML for the id
// would silently pass no matter what was configured.
const ids = new Set()
let bannerInBundle = false
for (const file of walkFiles(outDir, '.js')) {
  const js = readFileSync(file, 'utf8')
  for (const m of js.matchAll(/\bG-[A-Z0-9]{6,}\b/g)) ids.add(m[0])
  if (js.includes(BANNER_CLASS)) bannerInBundle = true
}

if (withTagManager.length > 0) {
  fail(
    `googletagmanager.com is referenced from exported HTML (${withTagManager.slice(0, 3).join(', ')}` +
      `${withTagManager.length > 3 ? `, +${withTagManager.length - 3} more` : ''}). ` +
      'The tag must only ever be injected by lib/consent/gtag.ts after consent.',
  )
}

if (withBanner.length > 0) {
  fail(
    `the consent banner is server-rendered into exported HTML (${withBanner.slice(0, 3).join(', ')}). ` +
      'ConsentGate must render nothing until its mount effect resolves the stored ' +
      'decision, otherwise every returning visitor sees a flash of the banner.',
  )
}

if (live) {
  // Without this, "the banner is absent from HTML" would also pass for a build
  // where the banner was accidentally dropped from the bundle altogether.
  if (!bannerInBundle) {
    fail(
      'the consent banner is not in the JS bundle, so the banner can never render. ' +
        'Check that ConsentGate is still mounted in app/layout.tsx.',
    )
  }
  if (ids.size !== 1) {
    fail(
      ids.size === 0
        ? 'no G- measurement id found in the exported JS, but one is configured — ' +
            'NEXT_PUBLIC_GA_MEASUREMENT_ID did not reach the bundle.'
        : `found ${ids.size} distinct measurement ids (${[...ids].join(', ')}); expected exactly one. ` +
            'Staging and production are separate properties and must never share a build.',
    )
  }
}

const state = live
  ? `live (version ${cookiePolicyVersion}, ${pages.length} policy page(s), id ${[...ids][0]})`
  : `OFF (measurementId=${measurementId || 'unset'}, cookiePolicyVersion=${cookiePolicyVersion})`
console.log(`[check-analytics-build] ${state}; ${htmlFiles} page(s) clean of pre-consent GA.`)
