#!/usr/bin/env node
/**
 * Build-time downscaler for the knowledge-base context-menu icons.
 *
 * The authored icons are 512×512 line-art PNGs (black strokes on alpha) under
 * assets/kb-menu/, but they are drawn at the size of the cookie-consent opener's
 * shield — 1rem, centred in the 2.75rem = 44px button that is that opener's box
 * (components/consent/consent-fab.module.scss). The button is unchanged; only the
 * glyph in it is this size, which is what makes a menu icon and the shield in the
 * opposite corner read as one family. See `.icon` in
 * components/kb/menu-stack.module.scss for why the match is against the shield as
 * rendered rather than against the 1.125rem that stylesheet asks for.
 *
 * Handing a browser a 512px source for a 16px box means ~200 KB of icons downloaded
 * per entity page and a resampling pass on the client, so the sizes a real display
 * can actually use are baked here instead, once, at build time.
 *
 * 1rem × 16px/rem (nothing sets a font-size on :root or html in app/globals.scss, so
 * 1rem is the browser default 16px) = 16 CSS px, times the device pixel ratios worth
 * serving:
 *
 *   16 × 1 = 16 px  ->  <name>@1x.png
 *   16 × 2 = 32 px  ->  <name>@2x.png
 *   16 × 3 = 48 px  ->  <name>@3x.png
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

// The glyph's box, not the button's: `.icon` in components/kb/menu-stack.module.scss,
// which is the consent shield's rendered size. The 2.75rem button around it is drawn
// by the stylesheet and needs no image at all.
const ICON_REM = 1
const ROOT_PX = 16
const ICON_PX = ICON_REM * ROOT_PX // 16
const DPRS = [1, 2, 3]

async function writeIcon(name) {
  const src = path.join(srcDir, `${name}.png`)
  if (!existsSync(src)) {
    console.error(`[gen-kb-menu-icons] missing source icon: ${path.relative(websiteRoot, src)}`)
    process.exit(1)
  }
  const meta = await sharp(src).metadata()
  const largest = ICON_PX * Math.max(...DPRS)
  if (meta.width < largest || meta.height < largest) {
    console.error(
      `[gen-kb-menu-icons] ${name}.png is ${meta.width}×${meta.height}, smaller than the ` +
        `${largest}px output — resizing up would blur it; supply a larger source`
    )
    process.exit(1)
  }
  for (const dpr of DPRS) {
    const px = ICON_PX * dpr
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
