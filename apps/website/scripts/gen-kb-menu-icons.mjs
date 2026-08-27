#!/usr/bin/env node
/**
 * Build-time downscaler for the knowledge-base context-menu icons.
 *
 * The authored icons are 512×512 line-art PNGs (black strokes on alpha) under
 * assets/kb-menu/, but they are shown inside a 2.75rem circular button — the
 * same box as the cookie-consent opener (components/consent/consent-fab.module.scss,
 * where `2.75rem = 44px` is spelled out). Handing a browser a 512px source for a
 * 44px box means ~200 KB of icons downloaded per entity page and a resampling
 * pass on the client, so the sizes a real display can actually use are baked here
 * instead, once, at build time.
 *
 * 2.75rem × 16px/rem (nothing sets a font-size on :root or html in
 * app/globals.scss, so 1rem is the browser default 16px) = 44 CSS px, times the
 * device pixel ratios worth serving:
 *
 *   44 × 1 =  44 px  ->  <name>@1x.png
 *   44 × 2 =  88 px  ->  <name>@2x.png
 *   44 × 3 = 132 px  ->  <name>@3x.png
 *
 * Every one of those is a downscale of a 512px source, never an upscale — the
 * script refuses to run if a source is ever smaller than the largest output.
 *
 * Runs in `prebuild`/`predev`; output goes to public/assets/generated/kb-menu/,
 * which .gitignore ignores like the other generated assets. The source PNGs in
 * assets/kb-menu/ are the committed originals.
 *
 * Only the six icons the design assigns to menu items are here. definition.png,
 * theorem.png, proof.png and remark.png are entity-type icons, not menu icons,
 * and are deliberately not part of this set.
 */
import { mkdir } from 'fs/promises'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// See gen-og-images.mjs: CJS require avoids sharp's experimental-JSON warning.
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')

const srcDir = path.join(websiteRoot, 'assets', 'kb-menu')
const outDir = path.join(websiteRoot, 'public', 'assets', 'generated', 'kb-menu')

// menu → Menü, back → Vissza, incoming → Bejövő hivatkozások,
// paragraph → Állítások, star → Fogalmak, target → Kontextus.
const ICONS = ['menu', 'back', 'incoming', 'star', 'paragraph', 'target']

const BUTTON_REM = 2.75
const ROOT_PX = 16
const BUTTON_PX = BUTTON_REM * ROOT_PX // 44
const DPRS = [1, 2, 3]

async function writeIcon(name) {
  const src = path.join(srcDir, `${name}.png`)
  if (!existsSync(src)) {
    console.error(`[gen-kb-menu-icons] missing source icon: ${path.relative(websiteRoot, src)}`)
    process.exit(1)
  }
  const meta = await sharp(src).metadata()
  const largest = BUTTON_PX * Math.max(...DPRS)
  if (meta.width < largest || meta.height < largest) {
    console.error(
      `[gen-kb-menu-icons] ${name}.png is ${meta.width}×${meta.height}, smaller than the ` +
        `${largest}px output — resizing up would blur it; supply a larger source`
    )
    process.exit(1)
  }
  for (const dpr of DPRS) {
    const px = BUTTON_PX * dpr
    const out = path.join(outDir, `${name}@${dpr}x.png`)
    await sharp(src)
      .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, palette: true })
      .toFile(out)
    console.log(
      `[gen-kb-menu-icons] ${name} ${meta.width}×${meta.height} -> ` +
        `${path.relative(path.join(websiteRoot, 'public'), out)} ${px}×${px}, ${statSync(out).size} B`
    )
  }
}

await mkdir(outDir, { recursive: true })
for (const name of ICONS) await writeIcon(name)
console.log(`[gen-kb-menu-icons] ${ICONS.length} icons × ${DPRS.length} sizes generated`)
