/**
 * Shared brand-lockup geometry for the build-time image generators.
 *
 * Everything here reconstructs the logo from the HexMark geometry + text
 * (mirroring the BrandLockup React component) — no raster logo asset. Text is
 * converted to vector glyph outlines with opentype.js straight from the bundled
 * fonts in assets/og/ (Google Sans + Mulish, both OFL), so the emitted SVG
 * contains only <path>/<polygon> (no font dependency at render time) and
 * rasterises identically everywhere via sharp. Brand strings (siteName /
 * tagline / motto) come from locales.json — the same per-locale source the site
 * uses; today the DEFAULT_LOCALE's values.
 *
 * Consumers:
 *   - gen-og-images.mjs      → the plaque baked into every og-thumbnail.jpg
 *   - gen-logo-lockup.mjs    → the same plaque as a standalone PNG
 */
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import opentype from 'opentype.js'
// Populates DEFAULT_LOCALE from .env.local when not already exported — imported
// here rather than in each consumer so it can't be forgotten by a new one, and
// because the DEFAULT_LOCALE read below happens at module scope.
import './load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const websiteRoot = path.resolve(__dirname, '..', '..')
const assetsOgDir = path.join(websiteRoot, 'assets', 'og')

// --- fonts (bundled OFL build inputs) → opentype.js -------------------------
function loadFont(file) {
  const fp = path.join(assetsOgDir, file)
  if (!existsSync(fp)) {
    console.error(`[brand-lockup] missing bundled font: assets/og/${file}`)
    process.exit(1)
  }
  return opentype.loadSync(fp)
}
export const fontWordmark = loadFont('GoogleSans-Medium.ttf')  // wordmark (matches hero --font-wordmark 500)
export const fontTagline = loadFont('GoogleSans-Regular.ttf')  // tagline (light — Regular 400)
export const fontMotto = loadFont('Mulish-Italic.ttf')         // motto (italic face → slanted glyphs)

// --- brand strings from locales.json (DEFAULT_LOCALE) -----------------------
const locales = JSON.parse(readFileSync(path.join(websiteRoot, 'lib', 'i18n', 'locales.json'), 'utf-8'))
const defaultLocale = process.env.DEFAULT_LOCALE?.trim() || Object.keys(locales.locales)[0]
const brand = locales.locales[defaultLocale]
if (!brand) {
  console.error(`[brand-lockup] DEFAULT_LOCALE '${defaultLocale}' not in locales.json`)
  process.exit(1)
}
export const SITE_NAME = brand.siteName
export const TAGLINE = brand.tagline
export const MOTTO = brand.motto

// --- text → SVG path (glyph outlines; letter-spacing + anchor) --------------
// anchor: 'start' | 'middle' | 'end' around x, baseline at y. Laid out glyph by
// glyph via charToGlyph (cmap only) + manual kerning — deliberately NOT
// font.getPath(string), which runs opentype.js's GSUB/Bidi shaping engine and
// throws on Google Sans's ligature lookups ("lookupType 7 not yet supported").
export function textPath(font, text, size, x, y, { letterSpacing = 0, anchor = 'start' } = {}) {
  const scale = size / font.unitsPerEm
  const glyphs = Array.from(text).map((c) => font.charToGlyph(c))
  const advances = glyphs.map((g, i) => {
    let adv = (g.advanceWidth || 0) * scale
    if (i < glyphs.length - 1) adv += (font.getKerningValue(g, glyphs[i + 1]) || 0) * scale
    return adv
  })
  const width = advances.reduce((a, b) => a + b, 0) + letterSpacing * Math.max(0, glyphs.length - 1)
  let cursor = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
  let d = ''
  glyphs.forEach((g, i) => {
    d += g.getPath(cursor, y, size).toPathData(2) + ' '
    cursor += advances[i] + letterSpacing
  })
  return { d: d.trim(), width }
}

// --- HexMark geometry (mirrors components/layout/HexMark.tsx) ---------------
const R = 26
const H = (R * Math.sqrt(3)) / 2
const A = { cx: 30, cy: 27 }
const C = { cx: 30, cy: 84 }
const SCALE = (C.cy - A.cy) / (2 * H)
const B = { cx: A.cx + 1.5 * R * SCALE, cy: (A.cy + C.cy) / 2 }
const HEX_CENTERS = [A, B, C]
export const HEX_VIEWBOX = { w: 110, h: 111 }

function hexPolys(color, strokeWidth) {
  return HEX_CENTERS.map(({ cx, cy }) => {
    const pts = [
      [cx + R, cy], [cx + R / 2, cy + H], [cx - R / 2, cy + H],
      [cx - R, cy], [cx - R / 2, cy - H], [cx + R / 2, cy - H],
    ].map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    return `<polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>`
  }).join('')
}

// A HexMark placed at (x,y) scaled to `height`, preserving aspect. `strokeWidth`
// is the intended rendered width (divided by scale so it stays constant).
export function hexMark(x, y, height, color, strokeWidth) {
  const s = height / HEX_VIEWBOX.h
  return {
    width: HEX_VIEWBOX.w * s,
    svg: `<g transform="translate(${x},${y}) scale(${s})">${hexPolys(color, strokeWidth / s)}</g>`,
  }
}

// --- the article plaque -----------------------------------------------------
// A white plaque (square corners) holding a HORIZONTAL lockup: hexagons on the
// left, and to their right a centred stack of the wordmark (top) + tagline
// (below). Black mark + wordmark, gray-600 tagline. Legible on any thumbnail.
export const PLAQUE = { padX: 22, padY: 14, margin: 20, gapMarkText: 16, gapWordTag: 10 }
// The OG overlay draws the plaque at this scale; the standalone PNG reuses it so
// "1×" means the exact pixel size the plaque occupies in og-thumbnail.jpg.
export const PLAQUE_OG_SCALE = 0.8

/**
 * Build the plaque lockup with its top-left corner at (x,y).
 * Returns its unscaled box size plus the SVG fragment (no <svg> wrapper).
 * `withBox: false` omits the white rectangle, keeping the same padding — used
 * for the transparent standalone variant.
 */
export function plaqueLockup({ x = 0, y = 0, withBox = true } = {}) {
  const ink = '#111111'   // hexagons + wordmark (black)
  const sub = '#4b5563'   // tagline (gray-600, same as the generic lockup)
  // Sizes/letter-spacing echo the generic lockup's relative proportions
  // (tagline ≈ 21/80× wordmark; wordmark LS 2/80, tagline LS 8/21).
  const wmSize = 42
  const tgSize = Math.round(wmSize * (21 / 80) * 10) / 10 // ≈ 11
  const wmLS = wmSize * (2 / 80)   // ≈ 1.05
  const tgLS = tgSize * (8 / 21)   // ≈ 4.2
  const markH = 66
  const markW = HEX_VIEWBOX.w * (markH / HEX_VIEWBOX.h)

  const wmW = textPath(fontWordmark, SITE_NAME, wmSize, 0, 0, { letterSpacing: wmLS }).width
  const tgW = textPath(fontTagline, TAGLINE.toUpperCase(), tgSize, 0, 0, { letterSpacing: tgLS }).width
  const textW = Math.max(wmW, tgW)

  const wmCap = wmSize * 0.72, wmDesc = wmSize * 0.18
  const tgCap = tgSize * 0.72, tgDesc = tgSize * 0.2
  const textH = wmCap + wmDesc + PLAQUE.gapWordTag + tgCap + tgDesc
  const contentH = Math.max(markH, textH)

  const boxW = Math.ceil(PLAQUE.padX + markW + PLAQUE.gapMarkText + textW + PLAQUE.padX)
  const boxH = Math.ceil(2 * PLAQUE.padY + contentH)
  const cy = y + boxH / 2 // vertical centre line

  const mark = hexMark(x + PLAQUE.padX, cy - markH / 2, markH, ink, 1.8)
  const tcx = x + PLAQUE.padX + markW + PLAQUE.gapMarkText + textW / 2 // text-stack centre
  const textTop = cy - textH / 2
  const wmBaseline = textTop + wmCap
  const tgBaseline = wmBaseline + wmDesc + PLAQUE.gapWordTag + tgCap

  const wordmark = textPath(fontWordmark, SITE_NAME, wmSize, tcx, wmBaseline, { anchor: 'middle', letterSpacing: wmLS })
  const tagline = textPath(fontTagline, TAGLINE.toUpperCase(), tgSize, tcx, tgBaseline, { anchor: 'middle', letterSpacing: tgLS })

  const box = withBox ? `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="#ffffff"/>` : ''
  return {
    width: boxW,
    height: boxH,
    svg: `${box}${mark.svg}<path d="${wordmark.d}" fill="${ink}"/><path d="${tagline.d}" fill="${sub}"/>`,
  }
}
