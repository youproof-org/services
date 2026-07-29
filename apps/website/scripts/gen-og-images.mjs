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
 * The lockups are reconstructed from the HexMark geometry + glyph outlines by
 * scripts/lib/brand-lockup.mjs (see there for the why) — no raster logo asset,
 * no font dependency at render time. The same module renders the article plaque
 * as a standalone PNG in gen-logo-lockup.mjs.
 */
import { readdir, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { createRequire } from 'module'
import {
  websiteRoot, fontWordmark, fontTagline, fontMotto,
  SITE_NAME, TAGLINE, MOTTO,
  textPath, hexMark, HEX_VIEWBOX, PLAQUE, PLAQUE_OG_SCALE, plaqueLockup,
} from './lib/brand-lockup.mjs'

// sharp's ESM entry pulls in a JSON module, which makes Node emit a noisy
// "Importing JSON modules is an experimental feature" warning on every
// dev/build startup. Loading it via CJS require avoids that code path.
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const publicDir = path.join(websiteRoot, 'public')
const publicContentDir = path.join(publicDir, 'content')
const heroBg = path.join(publicDir, 'assets', 'hero-background-light.png')
const genericOut = path.join(publicDir, 'assets', 'generated', 'og-thumbnail.jpg')

const OG_W = 1200
const OG_H = 630
const JPEG_QUALITY = 82

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

// Top-right white plaque (see plaqueLockup): pinned so its top-right corner sits
// PLAQUE.margin from the image edges, then scaled about that pin.
function thumbOverlaySvg() {
  const lockup = plaqueLockup({ x: 0, y: 0 })
  const pinX = OG_W - PLAQUE.margin
  const pinY = PLAQUE.margin
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}" viewBox="0 0 ${OG_W} ${OG_H}">
    <g transform="translate(${pinX} ${pinY}) scale(${PLAQUE_OG_SCALE}) translate(${-lockup.width} 0)">
      ${lockup.svg}
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
