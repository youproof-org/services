// node layer2.mjs <outA> <versionA> <outB> <versionB> [report.json]
import fs from 'node:fs'
import path from 'node:path'
const [outA, verA, outB, verB, reportFile] = process.argv.slice(2)

function walk(dir, base = dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walk(full, base, out)
    else out.push(path.relative(base, full))
  }
  return out
}

const HASH_RE = /((?:static\/(?:chunks|css|media)\/)[^"'\s)\\]*?)[0-9a-f]{16}/g
const hashNames = (s) => { let prev; do { prev = s; s = s.replace(HASH_RE, '$1HASH') } while (s !== prev); return s }

function load(root, version) {
  const files = walk(root)
  const buildId = fs.readdirSync(path.join(root, '_next/static')).find((d) => !['chunks', 'css', 'flight', 'media'].includes(d))
  const flightToPage = new Map()
  for (const f of files.filter((f) => f.endsWith('.html'))) {
    for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/_next\/static\/flight\/([0-9a-f]+)\.js/g)) flightToPage.set(m[1], f)
  }
  const normPath = (f) => {
    const fm = f.match(/^_next\/static\/flight\/([0-9a-f]+)\.js$/)
    if (fm) return `_next/static/flight/[${flightToPage.get(fm[1]) ?? 'UNREFERENCED ' + fm[1]}].js`
    return hashNames(f.split(buildId).join('BUILD_ID'))
  }
  const normText = (s) => {
    s = s.split(buildId).join('BUILD_ID').split(buildId.replace(/-/g, '_')).join('BUILD_ID')
    s = s.replace(/_next\/static\/flight\/([0-9a-f]+)\.js/g, (_, h) => `_next/static/flight/[${flightToPage.get(h) ?? h}].js`)
    s = hashNames(s)
    s = s.split(version).join('VERSION')
    s = s.replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod/>')
    s = s.replace(/(\\*")dateModified\1:\1[^"\\]*\1/g, '$1dateModified$1:$1DATE$1')
    return s
  }
  const map = new Map()
  for (const f of files) {
    const key = normPath(f)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(f)
  }
  return { root, files, map, normText }
}

function contentOf(t, f) {
  const raw = fs.readFileSync(path.join(t.root, f), 'utf8')
  if (f.startsWith('_next/static/flight/')) {
    const parts = [...raw.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map((m) => JSON.parse(m[1]))
    return t.normText(parts.join(''))
  }
  return t.normText(raw)
}

const A = load(outA, verA), B = load(outB, verB)
const onlyA = [...A.map.keys()].filter((k) => !B.map.has(k) || B.map.get(k).length !== A.map.get(k).length)
const onlyB = [...B.map.keys()].filter((k) => !A.map.has(k) || A.map.get(k).length !== B.map.get(k).length)
const COMPARED = /\.(html|txt|xml)$|^_next\/static\/flight\//
const diffs = []
for (const [key, [fa]] of A.map) {
  if (!B.map.has(key) || !COMPARED.test(key)) continue
  if (A.map.get(key).length > 1) continue
  const a = contentOf(A, fa), b = contentOf(B, B.map.get(key)[0])
  if (a === b) continue
  let i = 0
  while (a[i] === b[i]) i++
  let ea = a.length, eb = b.length
  while (ea > i && eb > i && a[ea - 1] === b[eb - 1]) { ea--; eb-- }
  diffs.push({ file: key, before: a.slice(Math.max(0, i - 80), ea + 40), after: b.slice(Math.max(0, i - 80), eb + 40) })
}
const comparedCount = [...A.map.keys()].filter((k) => B.map.has(k) && COMPARED.test(k)).length
console.log(`layer 2: ${A.files.length} vs ${B.files.length} files; ${onlyA.length} paths only in A, ${onlyB.length} only in B; ${comparedCount} compared, ${diffs.length} differ`)
for (const k of onlyA.slice(0, 10)) console.log(`  only A: ${k}`)
for (const k of onlyB.slice(0, 10)) console.log(`  only B: ${k}`)
for (const d of diffs.slice(0, 12)) console.log(`  DIFF ${d.file}\n    A: ${JSON.stringify(d.before).slice(0, 400)}\n    B: ${JSON.stringify(d.after).slice(0, 400)}`)
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify({ onlyA, onlyB, diffs }, null, 1))
process.exit(onlyA.length || onlyB.length || diffs.length ? 1 : 0)
