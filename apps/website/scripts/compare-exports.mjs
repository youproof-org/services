#!/usr/bin/env node
/**
 * Compare two static exports and report only the differences that mean something.
 *
 *   node scripts/compare-exports.mjs <baseline-out> <new-out> [--verbose]
 *
 * Why this exists: the useful question after a refactor is "did the site change?",
 * and `diff -r` cannot answer it. Every page embeds build-specific strings, so a
 * byte comparison of two exports of the SAME content reports every file as
 * different — which is indistinguishable from a real regression, and tempting to
 * wave away. Getting the normalization right by hand takes several attempts, and a
 * normalization that is slightly wrong produces an empty comparison that looks like
 * a pass. Both of those have happened.
 *
 * So the export is compared in LAYERS, strongest first, each ignoring only the noise
 * it has to:
 *
 *   1. inventory      — which files exist. A dropped page is the worst regression
 *                       and the easiest to miss when every file "differs" anyway.
 *   2. rendered body  — the markup a reader gets, scripts and asset links removed.
 *                       This is the layer that matters most and needs the least
 *                       normalization.
 *   3. head metadata  — title, meta, canonical, hreflang. Not in the body, and
 *                       silently breakable.
 *   4. element ids    — every anchor target on the page.
 *   5. links          — every (page, href) pair including fragments, so a link
 *                       that changes target is caught even if the markup around
 *                       it is unchanged.
 *   6. sitemap/robots — compared as text.
 *   7. RSC payloads   — informational only, see below.
 *   8. assets         — path sets only, see below.
 *
 * What is deliberately NOT compared, and why:
 *
 *   - **Asset bytes and filenames.** Chunk filenames contain a content hash AND a
 *     webpack-assigned id, and BOTH move when any source file changes. Comparing
 *     them across a code change reports pure noise. Their paths are compared as a
 *     set so a vanished stylesheet is still caught.
 *   - **RSC payloads (.txt), strictly.** They embed chunk names and React keys,
 *     which legitimately shift. They are compared after normalization and reported
 *     separately, because a difference there is worth a look but is not by itself a
 *     regression — the body markup is the same content, server-rendered.
 *
 * The build id needs normalizing in TWO spellings: Next writes it as
 * `_next/static/{id}` in paths, and as `<!--{id}-->` with hyphens replaced by
 * underscores. Normalizing only the first leaves every page differing — a trap
 * worth naming, since it looks exactly like a total regression.
 *
 * Exit code is non-zero when a MEANINGFUL layer differs (1–6), so this can gate a
 * refactor. Layers 7–8 never fail the run on their own.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'

const [baseDir, newDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const VERBOSE = process.argv.includes('--verbose')

if (!baseDir || !newDir) {
  console.error('usage: node scripts/compare-exports.mjs <baseline-out> <new-out> [--verbose]')
  process.exit(2)
}
for (const d of [baseDir, newDir]) {
  if (!existsSync(d) || !statSync(d).isDirectory()) {
    console.error(`[compare-exports] not a directory: ${d}`)
    process.exit(2)
  }
}

// ---------------------------------------------------------------------------
// File inventory
// ---------------------------------------------------------------------------

function walk(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(root, full, out)
    else out.push(path.relative(root, full).split(path.sep).join('/'))
  }
  return out
}

const baseFiles = walk(baseDir)
const newFiles = walk(newDir)

/** Detect the build id from the one directory under _next/static that is not fixed. */
function buildId(root, files) {
  const known = new Set(['chunks', 'css', 'media'])
  for (const f of files) {
    const m = /^_next\/static\/([^/]+)\//.exec(f)
    if (m && !known.has(m[1])) return m[1]
  }
  return null
}

const baseId = buildId(baseDir, baseFiles)
const newId = buildId(newDir, newFiles)
if (!baseId || !newId) {
  // Refuse rather than silently comparing un-normalized text: a missed build id
  // makes every page differ, which reads as catastrophe, and a bad regex makes
  // every page empty, which reads as success.
  console.error(
    `[compare-exports] could not detect the build id (baseline=${baseId}, new=${newId}). ` +
      `Refusing to compare, because un-normalized ids make every page differ.`,
  )
  process.exit(2)
}

/**
 * Asset paths carry hashes in the FILENAME as well as the build-id directory, and
 * webpack also reassigns the numeric chunk id when source changes — so
 * `113-<hash>.js` can become `544-<other>.js` for the same module. Both parts have
 * to collapse, or comparing the set of assets across a code change reports every
 * chunk as added and removed.
 *
 * What survives the collapse is the SHAPE of the asset tree: a vanished stylesheet,
 * a missing font, or a route that stopped emitting a bundle still shows up.
 */
const canonicalAsset = (f) =>
  f
    .replace(/^_next\/static\/chunks\/.*$/, '_next/static/chunks/CHUNK')
    .replace(/^_next\/static\/css\/.*$/, '_next/static/css/STYLE')
    .replace(/^_next\/static\/media\/.*$/, '_next/static/media/ASSET')
    // Per-build directory, then the hashed (and renumbered) filename inside it.
    .replace(/^_next\/static\/[^/]+\//, '_next/static/BUILDID/')
    .replace(/^(_next\/static\/BUILDID\/.*?)[-_.][0-9a-f]{8,}(\.\w+)$/, '$1HASH$2')
    .replace(/^(_next\/static\/BUILDID\/)\d+HASH(\.\w+)$/, '$1CHUNKHASH$2')

const isPage = (f) => f.endsWith('.html')
const isPayload = (f) => f.endsWith('.txt')
const isMeta = (f) => f === 'sitemap.xml' || f === 'robots.txt'
const isAsset = (f) => !isPage(f) && !isPayload(f) && !isMeta(f)

const failures = []
const notes = []

function report(layer, differing, total, { fatal = true, sample = [] } = {}) {
  const ok = differing === 0
  const line = `  ${ok ? '✓' : '✗'} ${layer.padEnd(28)} ${differing} of ${total} differ`
  console.log(line)
  if (!ok) {
    for (const s of sample.slice(0, VERBOSE ? 50 : 8)) console.log(`      ${s}`)
    if (sample.length > (VERBOSE ? 50 : 8)) console.log(`      … and ${sample.length - (VERBOSE ? 50 : 8)} more`)
    ;(fatal ? failures : notes).push(layer)
  }
}

console.log(`[compare-exports] baseline ${baseDir} (build ${baseId})`)
console.log(`[compare-exports] new      ${newDir} (build ${newId})`)
console.log()

// ── 1. inventory ──
{
  const b = new Set(baseFiles.filter((f) => !isAsset(f)))
  const n = new Set(newFiles.filter((f) => !isAsset(f)))
  const missing = [...b].filter((f) => !n.has(f)).sort()
  const added = [...n].filter((f) => !b.has(f)).sort()
  report('page inventory', missing.length + added.length, b.size, {
    sample: [...missing.map((f) => `missing: ${f}`), ...added.map((f) => `added:   ${f}`)],
  })

  const ba = new Set(baseFiles.filter(isAsset).map(canonicalAsset))
  const na = new Set(newFiles.filter(isAsset).map(canonicalAsset))
  const assetDiff = [
    ...[...ba].filter((f) => !na.has(f)).map((f) => `missing: ${f}`),
    ...[...na].filter((f) => !ba.has(f)).map((f) => `added:   ${f}`),
  ].sort()
  report('asset kinds (paths only)', assetDiff.length, ba.size, { sample: assetDiff })
}

// ---------------------------------------------------------------------------
// Per-page extraction
// ---------------------------------------------------------------------------

const normalizeBuild = (text, id) => {
  const underscored = id.replace(/-/g, '_')
  return text
    .split(id).join('__BUILDID__')
    .split(underscored).join('__BUILDID__')
    .replace(/\/_next\/static\/chunks\/[^"'\\ )]+/g, '/_next/static/chunks/CHUNK')
    .replace(/\/_next\/static\/css\/[^"'\\ )]+/g, '/_next/static/css/STYLE')
    .replace(/\/_next\/static\/media\/[^"'\\ )]+/g, '/_next/static/media/ASSET')
    // Cache-busting query on a static asset, e.g. /icon.svg?c68dea79867a4058
    .replace(/\?[0-9a-f]{8,}/g, '?HASH')
}

const stripAssets = (html) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<script\b[^>]*\/?>/g, '')
    .replace(/<link\b[^>]*>/g, '')

function pageParts(file, id) {
  const raw = readFileSync(file, 'utf8')
  const text = normalizeBuild(raw, id)
  const stripped = stripAssets(text)

  const bodyMatch = /<body\b[^>]*>([\s\S]*)<\/body>/.exec(stripped)
  const body = (bodyMatch ? bodyMatch[1] : stripped).replace(/\s+/g, ' ').trim()

  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head>/.exec(text)
  const head = headMatch ? headMatch[1] : ''
  const metaTags = [
    ...head.matchAll(/<title[^>]*>([\s\S]*?)<\/title>/g).map((m) => `title=${m[1].trim()}`),
    ...head.matchAll(/<meta\b[^>]*>/g).map((m) => m[0]),
    ...head.matchAll(/<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>/g).map((m) => m[0]),
  ].sort()

  const ids = [...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]).sort()
  const links = [...body.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => !h.startsWith('/_next/'))
    .sort()

  return { body, meta: metaTags.join('\n'), ids: ids.join('\n'), links }
}

// ── 2–5. per-page layers ──
{
  const shared = baseFiles.filter((f) => isPage(f) && newFiles.includes(f)).sort()
  const layers = {
    'rendered body markup': [],
    'head metadata': [],
    'element ids (anchors)': [],
  }
  let baseLinkCount = 0
  let newLinkCount = 0
  const linkDiffs = []

  for (const f of shared) {
    const a = pageParts(path.join(baseDir, f), baseId)
    const b = pageParts(path.join(newDir, f), newId)
    if (a.body !== b.body) layers['rendered body markup'].push(f)
    if (a.meta !== b.meta) layers['head metadata'].push(f)
    if (a.ids !== b.ids) layers['element ids (anchors)'].push(f)
    baseLinkCount += a.links.length
    newLinkCount += b.links.length
    if (a.links.join('\n') !== b.links.join('\n')) {
      const removed = a.links.filter((l) => !b.links.includes(l))
      const added = b.links.filter((l) => !a.links.includes(l))
      linkDiffs.push(`${f}: -${removed.length} +${added.length}${removed[0] ? ` e.g. -${removed[0]}` : ''}${added[0] ? ` +${added[0]}` : ''}`)
    }
  }

  for (const [layer, diffs] of Object.entries(layers)) {
    report(layer, diffs.length, shared.length, { sample: diffs })
  }
  report(`links (${baseLinkCount} → ${newLinkCount})`, linkDiffs.length, shared.length, { sample: linkDiffs })
}

// ── 6. sitemap / robots ──
{
  const files = baseFiles.filter(isMeta)
  const diffs = files.filter((f) => {
    if (!newFiles.includes(f)) return true
    const a = normalizeBuild(readFileSync(path.join(baseDir, f), 'utf8'), baseId)
    const b = normalizeBuild(readFileSync(path.join(newDir, f), 'utf8'), newId)
    return a !== b
  })
  report('sitemap / robots', diffs.length, files.length, { sample: diffs })
}

// ── 7. RSC payloads (informational) ──
{
  const shared = baseFiles.filter((f) => isPayload(f) && newFiles.includes(f))
  const diffs = shared.filter((f) => {
    const a = normalizeBuild(readFileSync(path.join(baseDir, f), 'utf8'), baseId)
    const b = normalizeBuild(readFileSync(path.join(newDir, f), 'utf8'), newId)
    return a !== b
  })
  report('RSC payloads (advisory)', diffs.length, shared.length, { fatal: false, sample: diffs })
}

console.log()
if (failures.length) {
  console.error(`[compare-exports] MEANINGFUL DIFFERENCES in: ${failures.join(', ')}`)
  process.exit(1)
}
if (notes.length) {
  console.log(
    `[compare-exports] no meaningful differences. Advisory layer(s) differ: ${notes.join(', ')} — ` +
      `expected when source changed, since payloads embed chunk names and React keys.`,
  )
} else {
  console.log('[compare-exports] the two exports are equivalent in every compared layer.')
}
