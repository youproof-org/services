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
 */
import { readdir, copyFile, mkdir, stat } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const execFileAsync = promisify(execFile)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')

const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')

const publicContentDir = path.join(websiteRoot, 'public', 'content')
const latexTmpDir = path.join(websiteRoot, '.tmp', 'latex')

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
  const tmpSubDir = path.join(latexTmpDir, path.dirname(rel))     // ".tmp/latex/books/foo"
  const baseName = path.basename(relNoExt)                        // "fig"
  const dviPath = path.join(tmpSubDir, baseName + '.dvi')
  const svgDst = path.join(publicContentDir, relNoExt + '.svg')

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
    const svgDst = path.join(publicContentDir, path.relative(contentDir, src).slice(0, -4) + '.svg')
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
    const rel = path.relative(contentDir, src)
    const dst = path.join(publicContentDir, rel)
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
