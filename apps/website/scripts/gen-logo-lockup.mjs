#!/usr/bin/env node
/**
 * Standalone PNG export of the small horizontal youproof.org lockup — the exact
 * plaque that gen-og-images.mjs bakes into every article `og-thumbnail.jpg`
 * (hexagons + wordmark + tagline). Both come from the same
 * scripts/lib/brand-lockup.mjs geometry, so they can never drift.
 *
 * Unlike the OG images this is NOT part of prebuild/predev: the output is a
 * committed brand asset under assets/brand/, regenerated on demand with
 *
 *   pnpm --filter @youproof.org/website gen:logo [scale]
 *
 * Two variants per run:
 *   - logo-lockup@<n>x.png              white plaque, as seen on og-thumbnails
 *   - logo-lockup-transparent@<n>x.png  same padding, no white box (alpha)
 *
 * `scale` (default 3) is a multiple of the plaque's rendered size in
 * og-thumbnail.jpg, so 1 = pixel-for-pixel what the share image shows.
 */
import { mkdir } from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import { websiteRoot, PLAQUE_OG_SCALE, plaqueLockup } from './lib/brand-lockup.mjs'

// See gen-og-images.mjs: CJS require avoids sharp's experimental-JSON warning.
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const outDir = path.join(websiteRoot, 'assets', 'brand')

const scaleArg = process.argv[2]
const scale = scaleArg === undefined ? 3 : Number(scaleArg)
if (!Number.isFinite(scale) || scale <= 0) {
  console.error(`[gen-logo-lockup] invalid scale '${scaleArg}' — expected a positive number`)
  process.exit(1)
}

// Render the vectors straight at the target pixel size (width/height on <svg>,
// natural box in viewBox) — never rasterise small and upscale.
async function writeVariant(withBox, file) {
  const lockup = plaqueLockup({ x: 0, y: 0, withBox })
  const px = PLAQUE_OG_SCALE * scale
  const w = Math.round(lockup.width * px)
  const h = Math.round(lockup.height * px)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${lockup.width} ${lockup.height}">${lockup.svg}</svg>`
  const out = path.join(outDir, file)
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out)
  console.log(`[gen-logo-lockup] ${w}×${h} -> ${path.relative(websiteRoot, out)}`)
}

await mkdir(outDir, { recursive: true })
await writeVariant(true, `logo-lockup@${scale}x.png`)
await writeVariant(false, `logo-lockup-transparent@${scale}x.png`)
