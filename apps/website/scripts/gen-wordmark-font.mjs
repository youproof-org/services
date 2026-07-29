#!/usr/bin/env node
/**
 * Build-time generator for the wordmark web font.
 *
 * The BrandLockup wordmark is CSS text in Google Sans Medium, which used to be
 * fetched from fonts.googleapis.com at runtime. That sent every visitor's IP to
 * Google on every page view (a third-country transfer with no consent basis), so
 * the face is now self-hosted instead.
 *
 * Shipping the bundled assets/og/GoogleSans-Medium.ttf as-is would mean 1.8 MB
 * for a single word, so this subsets it down to just the glyphs the wordmark
 * actually needs (~8 for "youproof.org", a couple of KB) using the opentype.js
 * we already depend on for the OG-image generators.
 *
 * The character set is derived from locales.json — the same per-locale source
 * BrandLockup and scripts/lib/brand-lockup.mjs read — so adding a locale whose
 * siteName uses new characters extends the subset automatically instead of
 * silently falling back to Mulish for the missing glyphs. Both the raw and the
 * lowercased forms are included, because .wordmark applies
 * `text-transform: lowercase`.
 *
 * Output is an uncompressed OpenType/CFF file (opentype.js writes CFF, so the
 * outlines come out as cubics — geometrically identical to the source quadratics)
 * rather than woff2: at this glyph count the difference is ~1 KB before the CDN's
 * own brotli, and it keeps the build free of a native woff2/brotli toolchain.
 * Written to public/assets/generated/ (gitignored, like the generated OG images)
 * and consumed via the @font-face in app/globals.scss.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import opentype from 'opentype.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')

const SRC = path.join(websiteRoot, 'assets', 'og', 'GoogleSans-Medium.ttf')
const OUT_DIR = path.join(websiteRoot, 'public', 'assets', 'generated')
const OUT = path.join(OUT_DIR, 'google-sans-wordmark.otf')

// --- which characters the wordmark can render -------------------------------
function wordmarkChars() {
  const locales = JSON.parse(
    readFileSync(path.join(websiteRoot, 'lib', 'i18n', 'locales.json'), 'utf-8')
  )
  const chars = new Set()
  for (const cfg of Object.values(locales.locales)) {
    const name = cfg.siteName
    if (typeof name !== 'string') continue
    // `text-transform: lowercase` means the lowercased form is what actually
    // renders; keep the raw form too so a future non-lowercased use still works.
    for (const c of `${name}${name.toLowerCase()}`) chars.add(c)
  }
  return [...chars].sort()
}

if (!existsSync(SRC)) {
  console.error(`[gen-wordmark-font] missing bundled font: ${path.relative(websiteRoot, SRC)}`)
  process.exit(1)
}

const font = opentype.loadSync(SRC)
const chars = wordmarkChars()
if (chars.length === 0) {
  console.error('[gen-wordmark-font] no siteName characters found in locales.json')
  process.exit(1)
}

// .notdef must stay at index 0; opentype.js reassigns the rest when constructing
// the GlyphSet. charToGlyph consults the cmap only (no GSUB shaping), matching
// how brand-lockup.mjs deliberately avoids Google Sans's unsupported ligature
// lookups.
const glyphs = [font.glyphs.get(0)]
const missing = []
for (const c of chars) {
  const glyph = font.charToGlyph(c)
  if (!glyph || glyph.index === 0) {
    missing.push(c)
    continue
  }
  // Carry the codepoint explicitly: the subset needs its own cmap, and a glyph
  // reached via charToGlyph doesn't always have `unicode` populated.
  glyph.unicode = c.codePointAt(0)
  glyph.unicodes = [c.codePointAt(0)]
  glyphs.push(glyph)
}

if (missing.length > 0) {
  console.error(
    `[gen-wordmark-font] Google Sans Medium has no glyph for: ${missing.map((c) => JSON.stringify(c)).join(', ')}`
  )
  process.exit(1)
}

// The OFL requires every copy — including a derivative like this subset — to carry
// the original copyright notice and licence, and opentype.js writes an empty name
// table unless we pass them through explicitly. The family is deliberately renamed
// (the source declares no Reserved Font Name, so this is permitted) so the subset
// can never be confused with, or shadowed by, a full Google Sans installation.
const nameOf = (key) => {
  const rec = font.names[key]
  if (!rec) return undefined
  return typeof rec === 'string' ? rec : (rec.en ?? Object.values(rec)[0])
}

const subset = new opentype.Font({
  familyName: 'Google Sans Wordmark',
  styleName: 'Medium',
  unitsPerEm: font.unitsPerEm,
  ascender: font.ascender,
  descender: font.descender,
  glyphs,
  copyright: nameOf('copyright'),
  license: nameOf('license'),
  licenseURL: nameOf('licenseURL'),
  trademark: nameOf('trademark'),
  manufacturer: nameOf('manufacturer'),
  manufacturerURL: nameOf('manufacturerURL'),
  designer: nameOf('designer'),
  designerURL: nameOf('designerURL'),
  version: nameOf('version'),
  description: `Subset of ${nameOf('fullName') ?? 'Google Sans Medium'} containing only the youproof.org wordmark glyphs.`,
})

// Fail rather than ship a font stripped of its licence metadata.
if (!subset.names.copyright || !subset.names.licenseURL) {
  console.error('[gen-wordmark-font] refusing to write: copyright/licence name records did not carry over')
  process.exit(1)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, Buffer.from(subset.toArrayBuffer()))

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
console.log(
  `[gen-wordmark-font] ${path.relative(websiteRoot, OUT)} — ` +
    `${glyphs.length - 1} glyph(s) [${chars.join('')}], ` +
    `${kb(readFileSync(OUT).length)} (from ${kb(readFileSync(SRC).length)})`
)
