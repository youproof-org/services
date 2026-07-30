#!/usr/bin/env node
/**
 * Syncs figure assets from CONTENT_DIR into public/content/, preserving the
 * relative path structure so they can be served at /content/... by Next.js.
 *
 * For each basename, only the highest-priority source is used:
 *   .tex  (compiled to .svg via pdflatex + dvisvgm)
 *   .svg  (copied as-is)
 *   .png
 *   .jpg / .jpeg
 *
 * Skips files whose target is already newer than the source (incremental).
 *
 * After syncing, writes .generated/figure-dimensions.json mapping each served
 * figure path ("/content/.../foo.svg") to its intrinsic [width, height]. The
 * content loader stamps these onto <img width/height> so the browser reserves
 * layout space — otherwise a lazy figure above a cross-reference target loads
 * late and shifts the target out of view after the anchor jump.
 */
import { readdir, copyFile, mkdir, stat, writeFile } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, readFileSync } from 'fs'
import { createRequire } from 'module'
import yaml from 'js-yaml'

// sharp's ESM entry pulls in a JSON module, which makes Node emit a noisy
// "Importing JSON modules is an experimental feature" warning on every
// dev/build startup. Loading it via CJS require avoids that code path.
const require = createRequire(import.meta.url)
const sharp = require('sharp')

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')

const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')

const publicContentDir = path.join(websiteRoot, 'public', 'content')
const latexTmpDir = path.join(websiteRoot, '.tmp', 'latex')

// Resolve CONTENT_DIR into one of three cases:
//
//   1. Repo-root misconfiguration — CONTENT_DIR points at the content-repo ROOT
//      instead of its `content/` subdir (a nested `content/books/` exists one
//      level down). Figure paths would mirror a stray `content/` segment into
//      public/content/content/… . This is a real mistake → fail loudly.
//   2. Empty content — the dir is missing, or exists but contains neither books/
//      nor knowledge-base/. This is VALID for the first production release, whose
//      `stable/released` content tree is still empty (mirrors gen-manifest.mjs's
//      tolerance — see its "CONTENT_DIR / books/ are intentionally NOT hard
//      failures" note). Skip figure syncing; the empty figure-dimensions.json
//      sidecar written below keeps the build + content loader valid.
//   3. Real content — sync normally.
const hasBooks = existsSync(path.join(contentDir, 'books'))
const hasKnowledgeBase = existsSync(path.join(contentDir, 'knowledge-base'))

if (!hasBooks && !hasKnowledgeBase && existsSync(path.join(contentDir, 'content', 'books'))) {
  console.error(
    `[sync-figures] ${contentDir} looks like the content-repo root ` +
      `(no books/ or knowledge-base/ inside it, but a nested content/books/ exists).\n` +
      `  Point CONTENT_DIR at its "content" subdir instead:\n  ${path.join(contentDir, 'content')}`,
  )
  process.exit(1)
}

const contentEmpty = !existsSync(contentDir) || (!hasBooks && !hasKnowledgeBase)
if (contentEmpty) {
  console.warn(
    `[sync-figures] no content found at ${contentDir} (no books/ or knowledge-base/) — ` +
      `skipping figure sync. This is valid for a release with no content yet; ` +
      `an empty figure-dimensions.json sidecar is still written below.`,
  )
}

// ---------------------------------------------------------------------------
// Name-based output paths (YAML `name` is the sole source of truth)
//
// The served asset path under public/content is built from each content object's
// YAML `name`, NEVER the on-disk folder basename (which carries an NN- ordering
// prefix). Folder names on disk are therefore arbitrary. This must stay in
// lockstep with lib/content/graph.ts's urlPrefix builders — a mismatch 404s the
// asset. Structural container dirs (books/, figures/, definitions/, …) have no
// `name` and keep their literal folder name.
// ---------------------------------------------------------------------------
const STRUCTURAL_YAMLS = [
  'book.yaml', 'part.yaml', 'chapter.yaml',
  'article.yaml', 'newsletter.yaml', 'page.yaml', 'landing.yaml',
  'namespace.yaml',
]

const dirNameCache = new Map()

/** The content `name` of a directory (from its structural YAML), else its basename. */
function dirName(absDir) {
  if (dirNameCache.has(absDir)) return dirNameCache.get(absDir)
  let name = path.basename(absDir)
  for (const y of STRUCTURAL_YAMLS) {
    const f = path.join(absDir, y)
    if (!existsSync(f)) continue
    try {
      const raw = yaml.load(readFileSync(f, 'utf-8'))
      if (raw && typeof raw === 'object' && typeof raw.name === 'string' && raw.name.trim() !== '') {
        name = raw.name.trim()
      }
    } catch {
      // Malformed YAML → fall back to the folder basename.
    }
    break // one structural YAML per directory
  }
  dirNameCache.set(absDir, name)
  return name
}

/**
 * Map a source file path to its name-based served relative path: every ancestor
 * directory segment is replaced by that dir's content `name` (container dirs
 * without a structural YAML keep their literal name); the filename is unchanged.
 */
function toServedRel(src) {
  const segs = path.relative(contentDir, src).split(path.sep)
  const fileName = segs.pop()
  let abs = contentDir
  const out = []
  for (const seg of segs) {
    abs = path.join(abs, seg)
    out.push(dirName(abs))
  }
  out.push(fileName)
  return out.join(path.sep)
}

const PRIORITY = ['.tex', '.svg', '.png', '.jpg', '.jpeg']

async function* walkAll(dir) {
  if (!existsSync(dir)) return
  const entries = await readdir(dir, { withFileTypes: true })

  // Group files in this directory by basename, collecting found extensions.
  const byBasename = new Map()
  for (const entry of entries) {
    if (entry.isDirectory()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!PRIORITY.includes(ext)) continue
    const base = path.basename(entry.name, ext)
    if (!byBasename.has(base)) byBasename.set(base, [])
    byBasename.get(base).push(ext)
  }

  // Yield only the highest-priority file per basename.
  for (const [base, exts] of byBasename) {
    const winner = PRIORITY.find(e => exts.includes(e))
    if (winner) yield path.join(dir, base + winner)
  }

  // Recurse into subdirectories.
  for (const entry of entries) {
    if (entry.isDirectory()) {
      yield* walkAll(path.join(dir, entry.name))
    }
  }
}

async function compileTex(src) {
  const rel = path.relative(contentDir, src)                      // e.g. "books/foo/fig.tex"
  const relNoExt = rel.slice(0, -4)                               // "books/foo/fig"
  const tmpSubDir = path.join(latexTmpDir, path.dirname(rel))     // ".tmp/latex/books/foo" (raw: internal)
  const baseName = path.basename(relNoExt)                        // "fig"
  const dviPath = path.join(tmpSubDir, baseName + '.dvi')
  // Output goes to the name-based served path (not the raw folder path).
  const svgDst = path.join(publicContentDir, toServedRel(src).slice(0, -4) + '.svg')

  await mkdir(tmpSubDir, { recursive: true })
  await mkdir(path.dirname(svgDst), { recursive: true })

  // Inject \def\pgfsysdriver before the document class so PGF uses its native
  // dvisvgm backend (SVG specials) instead of the default dvips backend
  // (PostScript specials, which need Ghostscript to convert).
  await execFileAsync('pdflatex', [
    '--output-format=dvi',
    '--interaction=nonstopmode',
    `--output-directory=${tmpSubDir}`,
    `-jobname=${baseName}`,
    `\\def\\pgfsysdriver{pgfsys-dvisvgm.def}\\input{${path.basename(src)}}`,
  ], { cwd: path.dirname(src) })

  await execFileAsync('dvisvgm', [
    '--font-format=woff2',
    `--output=${svgDst}`,
    dviPath,
  ])
}

await mkdir(publicContentDir, { recursive: true })
await mkdir(latexTmpDir, { recursive: true })

async function isNewer(src, dst) {
  try {
    const [srcStat, dstStat] = await Promise.all([stat(src), stat(dst)])
    return srcStat.mtimeMs > dstStat.mtimeMs
  } catch {
    return true  // dst missing → must process
  }
}

let copied = 0
let compiled = 0
let upToDate = 0
let failed = 0

for await (const src of walkAll(contentDir)) {
  const ext = path.extname(src).toLowerCase()
  if (ext === '.tex') {
    const svgDst = path.join(publicContentDir, toServedRel(src).slice(0, -4) + '.svg')
    if (!await isNewer(src, svgDst)) { upToDate++; continue }
    try {
      await compileTex(src)
      console.log(`[sync-figures] Compiled ${path.relative(contentDir, src)}`)
      compiled++
    } catch (err) {
      console.error(`[sync-figures] FAILED to compile ${path.relative(contentDir, src)}: ${err.message}`)
      // pdflatex writes its LaTeX errors (missing package/class, syntax, etc.) to
      // stdout, not stderr — surface the tail so CI logs show the real cause
      // instead of just "Command failed".
      const detail = (err.stdout || err.stderr || '').toString().trim()
      if (detail) console.error(detail.split('\n').slice(-15).join('\n'))
      failed++
    }
  } else {
    const dst = path.join(publicContentDir, toServedRel(src))
    if (!await isNewer(src, dst)) { upToDate++; continue }
    await mkdir(path.dirname(dst), { recursive: true })
    await copyFile(src, dst)
    console.log(`[sync-figures] Copied ${path.relative(contentDir, src)}`)
    copied++
  }
}

console.log(`[sync-figures] ${copied} copied, ${compiled} compiled, ${failed} failed, ${upToDate} up-to-date`)

// Fail the build on ANY figure compile failure — a missing figure would otherwise
// ship as a broken <img> (a 404 the quality gate only catches post-deploy). Exit
// non-zero so `next build`'s prebuild aborts loudly at build time instead.
if (failed > 0) {
  console.error(`[sync-figures] ${failed} figure(s) failed to compile — aborting build`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Figure dimensions sidecar (CLS / cross-reference scroll accuracy)
//
// Walk the freshly-synced public/content tree and record each image's intrinsic
// dimensions. Runs over ALL served files (not just the ones copied this run) so
// incremental syncs still produce a complete map. Written even when empty so a
// content-free build produces a valid (empty) sidecar.
// ---------------------------------------------------------------------------
const IMAGE_EXT = new Set(['.svg', '.png', '.jpg', '.jpeg'])

async function* walkImages(dir) {
  if (!existsSync(dir)) return
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkImages(abs)
    } else if (IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) {
      yield abs
    }
  }
}

const dimensions = {}
let dimsOk = 0
let dimsFailed = 0
for await (const img of walkImages(publicContentDir)) {
  // Served path the content loader keys on: "/content/<posix-rel>".
  const servedPath = '/content/' + path.relative(publicContentDir, img).split(path.sep).join('/')
  try {
    const { width, height } = await sharp(img).metadata()
    if (width && height) {
      dimensions[servedPath] = [width, height]
      dimsOk++
    } else {
      dimsFailed++
    }
  } catch {
    // Unreadable/corrupt image → skip (figure renders without reserved space,
    // as before). A truly broken asset is caught by the post-deploy crawler.
    dimsFailed++
  }
}

const dimsOutFile = path.join(websiteRoot, '.generated', 'figure-dimensions.json')
await mkdir(path.dirname(dimsOutFile), { recursive: true })
await writeFile(dimsOutFile, JSON.stringify(dimensions))
console.log(`[sync-figures] figure dimensions: ${dimsOk} recorded${dimsFailed ? `, ${dimsFailed} skipped` : ''}`)
