#!/usr/bin/env node
/**
 * Build-time OpenGraph share-image generator (Facebook, 1200×630 JPEG).
 *
 * Runs in `prebuild`/`predev` right AFTER sync-figures.mjs (which has already
 * mirrored every content thumbnail into public/content/ at its name-based path).
 * Two code paths, one output shape:
 *
 *   1. Regular thumbnails — for every public/content/ ** /thumbnail.{jpg,jpeg,png}:
 *      cover-crop to 1200×630, overlay a small white youproof.org lockup on a
 *      subtle scrim in the top-right, write `og-thumbnail.jpg` in the same dir.
 *   2. Generic fallback — the homepage hero background + the big centred lockup
 *      (mark, wordmark, tagline) + the motto, written to
 *      public/assets/generated/og-thumbnail.jpg. Used by any page with no
 *      thumbnail (home, indexes, thumbnail-less content).
 *
 * The lockup is reconstructed from the HexMark geometry + text (mirrors the
 * BrandLockup React component) — no raster logo asset. Text is converted to
 * vector glyph outlines with opentype.js straight from the bundled fonts in
 * assets/og/ (Google Sans + Mulish, both OFL), so the SVG overlay contains only
 * <path>/<polygon> (no font dependency at render time) and rasterises
 * identically everywhere via sharp. Brand strings (siteName / tagline / motto)
 * come from locales.json — the same per-locale source the site uses; today the
 * DEFAULT_LOCALE's values.
 */
import { readdir, mkdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import opentype from 'opentype.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const publicDir = path.join(websiteRoot, 'public')
const publicContentDir = path.join(publicDir, 'content')
const assetsOgDir = path.join(websiteRoot, 'assets', 'og')
const heroBg = path.join(publicDir, 'assets', 'hero-background-light.png')
const genericOut = path.join(publicDir, 'assets', 'generated', 'og-thumbnail.jpg')

const OG_W = 1200
const OG_H = 630
const JPEG_QUALITY = 82

// --- fonts (bundled OFL build inputs) → opentype.js -------------------------
function loadFont(file) {
  const fp = path.join(assetsOgDir, file)
  if (!existsSync(fp)) {
    console.error(`[gen-og-images] missing bundled font: assets/og/${file}`)
    process.exit(1)
  }
  return opentype.loadSync(fp)
}
const fontWordmark = loadFont('GoogleSans-Medium.ttf')  // wordmark (matches hero --font-wordmark 500)
const fontTagline = loadFont('GoogleSans-Regular.ttf')  // tagline (light — Regular 400)
const fontMotto = loadFont('Mulish-Italic.ttf')         // motto (italic face → slanted glyphs)

// --- brand strings from locales.json (DEFAULT_LOCALE) -----------------------
const locales = JSON.parse(readFileSync(path.join(websiteRoot, 'lib', 'i18n', 'locales.json'), 'utf-8'))
const defaultLocale = process.env.DEFAULT_LOCALE?.trim() || Object.keys(locales.locales)[0]
const brand = locales.locales[defaultLocale]
if (!brand) {
  console.error(`[gen-og-images] DEFAULT_LOCALE '${defaultLocale}' not in locales.json`)
  process.exit(1)
}
const SITE_NAME = brand.siteName
const TAGLINE = brand.tagline
const MOTTO = brand.motto

// --- text → SVG path (glyph outlines; letter-spacing + anchor) --------------
// anchor: 'start' | 'middle' | 'end' around x, baseline at y. Laid out glyph by
// glyph via stringToGlyphs (cmap only) + manual kerning — deliberately NOT
// font.getPath(string), which runs opentype.js's GSUB/Bidi shaping engine and
// throws on Google Sans's ligature lookups ("lookupType 7 not yet supported").
function textPath(font, text, size, x, y, { letterSpacing = 0, anchor = 'start' } = {}) {
  const scale = size / font.unitsPerEm
  // charToGlyph per code point (raw cmap) — avoids stringToGlyphs/getPath, which
  // run opentype.js's GSUB/Bidi shaping and throw on Google Sans ligature lookups.
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
const HEX_VIEWBOX = { w: 110, h: 111 }

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
function hexMark(x, y, height, color, strokeWidth) {
  const s = height / HEX_VIEWBOX.h
  return {
    width: HEX_VIEWBOX.w * s,
    svg: `<g transform="translate(${x},${y}) scale(${s})">${hexPolys(color, strokeWidth / s)}</g>`,
  }
}

// --- overlays (full-size 1200×630 SVGs; paths only, no fonts) ---------------
function genericOverlaySvg() {
  const ink = '#1b1b1f'    // wordmark
  const sub = '#4b5563'    // tagline + motto (gray-600)
  const cx = OG_W / 2
  const markH = 210
  const mark = hexMark(cx - (HEX_VIEWBOX.w * (markH / HEX_VIEWBOX.h)) / 2, 74, markH, ink, 4)
  // wordmark (Google Sans Medium); tagline lighter (Google Sans Regular), with
  // extra letter-spacing; motto is italic.
  const wordmark = textPath(fontWordmark, SITE_NAME, 80, cx, 372, { anchor: 'middle', letterSpacing: 2 })
  const tagline = textPath(fontTagline, TAGLINE.toUpperCase(), 21, cx, 424, { anchor: 'middle', letterSpacing: 8 })
  const motto = textPath(fontMotto, MOTTO, 34, cx, 528, { anchor: 'middle' })
  // Shrink the whole lockup+motto composition as a group, about its centre, over
  // the (unchanged) background.
  const groupScale = 0.68
  const gcy = 297 // vertical centre of the composition (mark top ~74 → motto ~520)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <g transform="translate(${cx} ${gcy}) scale(${groupScale}) translate(${-cx} ${-gcy})">
      ${mark.svg}
      <path d="${wordmark.d}" fill="${ink}"/>
      <path d="${tagline.d}" fill="${sub}"/>
      <path d="${motto.d}" fill="${sub}"/>
    </g>
  </svg>`
}

// Top-right white plaque (square corners): a HORIZONTAL lockup — hexagons on the
// left, and to their right a centred stack of the wordmark (top) + tagline
// (below). Black mark + wordmark, gray-600 tagline. Legible on any thumbnail.
const PLAQUE = { padX: 22, padY: 14, margin: 20, gapMarkText: 16, gapWordTag: 10 }
function thumbOverlaySvg() {
  const ink = '#111111'   // hexagons + wordmark (black)
  const sub = '#4b5563'   // tagline (gray-600, same as generic)
  // Sizes/letter-spacing echo the generic's relative proportions
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
  const boxX = OG_W - boxW - PLAQUE.margin
  const boxY = PLAQUE.margin
  const cy = boxY + boxH / 2 // vertical centre line

  const mark = hexMark(boxX + PLAQUE.padX, cy - markH / 2, markH, ink, 1.8)
  const tcx = boxX + PLAQUE.padX + markW + PLAQUE.gapMarkText + textW / 2 // text-stack centre
  const textTop = cy - textH / 2
  const wmBaseline = textTop + wmCap
  const tgBaseline = wmBaseline + wmDesc + PLAQUE.gapWordTag + tgCap

  const wordmark = textPath(fontWordmark, SITE_NAME, wmSize, tcx, wmBaseline, { anchor: 'middle', letterSpacing: wmLS })
  const tagline = textPath(fontTagline, TAGLINE.toUpperCase(), tgSize, tcx, tgBaseline, { anchor: 'middle', letterSpacing: tgLS })
  // Shrink the whole plaque (box + lockup) as a group, about its top-right
  // corner (pinned at OG_W-margin, margin), so the corner position stays put.
  const groupScale = 0.8
  const pinX = OG_W - PLAQUE.margin
  const pinY = PLAQUE.margin
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <g transform="translate(${pinX} ${pinY}) scale(${groupScale}) translate(${-pinX} ${-pinY})">
      <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" fill="#ffffff"/>
      ${mark.svg}
      <path d="${wordmark.d}" fill="${ink}"/>
      <path d="${tagline.d}" fill="${sub}"/>
    </g>
  </svg>`
}

// --- compositing ------------------------------------------------------------
function coverBase(input) {
  return sharp(input).resize(OG_W, OG_H, { fit: 'cover', position: 'centre' })
}

async function writeGeneric() {
  if (!existsSync(heroBg)) {
    console.error(`[gen-og-images] missing hero background: ${path.relative(websiteRoot, heroBg)}`)
    process.exit(1)
  }
  await mkdir(path.dirname(genericOut), { recursive: true })
  await coverBase(heroBg)
    .composite([{ input: Buffer.from(genericOverlaySvg()), top: 0, left: 0 }])
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(genericOut)
  console.log(`[gen-og-images] generic -> ${path.relative(publicDir, genericOut)}`)
}

const THUMB_RE = /^thumbnail\.(jpe?g|png)$/i

async function* walkThumbnails(dir) {
  if (!existsSync(dir)) return
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walkThumbnails(full)
    else if (THUMB_RE.test(entry.name)) yield full
  }
}

async function writeThumbnails() {
  const overlay = Buffer.from(thumbOverlaySvg())
  let count = 0
  for await (const thumb of walkThumbnails(publicContentDir)) {
    const out = path.join(path.dirname(thumb), 'og-thumbnail.jpg')
    await coverBase(thumb)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(out)
    count++
  }
  console.log(`[gen-og-images] ${count} per-thumbnail og-thumbnail.jpg generated`)
}

// --- main -------------------------------------------------------------------
await writeGeneric()
await writeThumbnails()
