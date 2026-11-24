// node layer1-diff.mjs <base.json> <cand.json> <manifest.json> <content-cand dir>
import fs from 'node:fs'
import path from 'node:path'
const [baseFile, candFile, manifestFile, contentDir] = process.argv.slice(2)
const base = JSON.parse(fs.readFileSync(baseFile, 'utf8'))
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8'))
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const expected = new Map(manifest.changes.map((c) => {
  const [file, key] = c.where.split('#')
  const text = fs.readFileSync(path.join(contentDir, file), 'utf8')
  const type = text.match(/^type:\s*(\S+)/m)[1]
  const name = text.match(/^name:\s*(\S+)/m)[1]
  return [`ref ${type}s:${name}#${key}`, c]
}))
const found = []
for (const k of new Set([...Object.keys(base), ...Object.keys(cand)])) {
  const a = JSON.stringify(base[k]), b = JSON.stringify(cand[k])
  if (a !== b) found.push({ key: k, before: base[k], after: cand[k] })
}
const unexpected = found.filter((f) => !expected.has(f.key))
const missing = [...expected.keys()].filter((k) => !found.some((f) => f.key === k))
console.log(`layer 1: ${Object.keys(base).length} vs ${Object.keys(cand).length} entries, ${found.length} differences`)
for (const f of found) console.log(`  ${expected.has(f.key) ? 'expected  ' : 'UNEXPECTED'} ${f.key}\n      before: ${JSON.stringify(f.before)}\n      after:  ${JSON.stringify(f.after)}`)
for (const k of missing) console.log(`  MISSING   ${k} (in the manifest, but no difference found)`)
console.log(unexpected.length === 0 && missing.length === 0 ? 'layer 1 PASS' : 'layer 1 FAIL')
process.exit(unexpected.length === 0 && missing.length === 0 ? 0 : 1)
