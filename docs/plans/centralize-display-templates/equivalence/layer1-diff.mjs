// node layer1-diff.mjs <base.json> <cand.json> step4|step4a [manifest.json] [report.json]
// step4:  every occurrence, every file's text and every other entry identical; backlink counts
//         checked by rule. A pre-cleanup base also shows the removed and retargeted references.
// step4a: differences exactly the manifest's places; backlinks identical.
import fs from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
const [baseFile, candFile, mode, manifestFile, reportFile] = process.argv.slice(2)
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const base = read(baseFile), cand = read(candFile)
const manifest = manifestFile && manifestFile !== '-' ? read(manifestFile) : []
const report = { intended: [], unexpected: [], info: [] }
const unexpected = (what, detail) => report.unexpected.push({ what, ...detail })
const intended = (what, detail) => report.intended.push({ what, ...detail })

const REFLEXIVE_FROM = 'definitions.reflexiv-relacio.terms.reflexive-relation'
const REFLEXIVE_TO = 'definitions.reflexiv-relacio'
const REFLEXIVE_FILE = /antiszimmetrikus-relacio-megjegyzes\.yaml$/
let removed
// CLEANUP names a JSON file mapping a content commit to the files it changed, for a base taken
// before the cleanup commits: a difference in such a file is attributed to that commit.
const cleanup = process.env.CLEANUP ? read(process.env.CLEANUP) : {}
const cleanupCommitOf = (file) => Object.keys(cleanup).find((commit) => cleanup[commit].includes(file))
const collapse = (s) => s.replace(/\s+/g, ' ').trim()
const bracketed = (s) => collapse(s.replace(/⟦/g, '[').replace(/⟧/g, ']'))
const plain = (s) => collapse(s.replace(/[⟦⟧]/g, ''))
const plainManifest = (s) => collapse(s.replace(/[[\]]/g, ''))
const fileText = (f) => f.marked.join('\n¶\n')
const withoutEmptyText = (o) => o && { ...o, segments: o.segments.filter((s) => s.kind === 'link' || s.text !== '') }
const occurrences = (dump, file) => Array.from({ length: dump.files[file]?.occurrences ?? 0 }, (_, i) => withoutEmptyText(dump.refs[`ref ${file}#${i}`]))
const markedOf = (o) => o.segments.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('')
const withoutDates = (v) => JSON.parse(JSON.stringify(v ?? null).replace(/"dateModified":"[^"]*"/g, '"dateModified":"DATE"'))
const links = (occs) => occs.flatMap((o) => o.segments.filter((s) => s.kind === 'link'))

for (const p of base.problems) unexpected('base dump problem', { detail: p })
for (const p of cand.problems) unexpected('candidate dump problem', { detail: p })

// The candidate uses the list as the plan requires: each item once, in order.
for (const [file, f] of Object.entries(cand.files)) {
  if (f.unused.length || f.reused.length || f.inOrder === false) unexpected('candidate list not single-use in order', { file, unused: f.unused, reused: f.reused })
  if (f.inOrder === undefined) unexpected('candidate file still has a dictionary', { file })
}
for (const [file, f] of Object.entries(base.files)) {
  if (f.unused.length) report.info.push({ what: 'base declares references the text never uses', file, keys: f.unused })
}

const files = [...new Set([...Object.keys(base.files), ...Object.keys(cand.files)])].sort()
for (const file of files) {
  if (!base.files[file] || !cand.files[file]) unexpected('file in one build only', { file, base: !!base.files[file], cand: !!cand.files[file] })
}
const common = files.filter((f) => base.files[f] && cand.files[f])

// ── Occurrences and page text ──
const manifestByFile = new Map()
for (const row of manifest) {
  if (!manifestByFile.has(row.file)) manifestByFile.set(row.file, [])
  manifestByFile.get(row.file).push(row)
}
let occurrencesCompared = 0
const reorderedFiles = new Set()
for (const file of common) {
  const b = base.files[file], c = cand.files[file]
  const bOcc = occurrences(base, file), cOcc = occurrences(cand, file)
  if (mode === 'step4') {
    if (bOcc.length !== cOcc.length) unexpected('occurrence count differs', { file, base: bOcc.length, cand: cOcc.length })
    for (let i = 0; i < Math.min(bOcc.length, cOcc.length); i++) {
      occurrencesCompared++
      if (isDeepStrictEqual(bOcc[i], cOcc[i])) continue
      const d = { file, position: i, before: bOcc[i], after: cOcc[i] }
      const listed = manifest.find((m) => m.file === file && cOcc[i].targets.includes(m.target) && markedOf(bOcc[i]) === m.before && markedOf(cOcc[i]) === m.after)
      if (listed) intended(`listed step 4 change: ${listed.reason.split('.')[0]}`, d)
      else if (isReflexiveRetarget(file, bOcc[i], cOcc[i])) intended('retargeted reflexive relation link', d)
      else if (cleanupCommitOf(file) && bOcc[i].segments.length === 0) intended(`${cleanupCommitOf(file)}: a reference without a display got one`, d)
      else unexpected('reference occurrence differs', d)
    }
    let expectedText = bracketed(fileText(b))
    for (const m of manifest.filter((m) => m.file === file)) expectedText = expectedText.split(m.before).join(m.after)
    const actualText = bracketed(fileText(c))
    if (expectedText !== actualText) {
      const d = { file, ...firstDiff(expectedText, actualText) }
      if (cleanupCommitOf(file)) intended(`${cleanupCommitOf(file)}: the file's text changed in that commit`, d)
      else if (plainManifest(expectedText) === plainManifest(actualText)) unexpected('link boundaries differ', d)
      else unexpected('page text differs', d)
    }
    continue
  }

  // step4a: walk the candidate's occurrences, consuming one base occurrence per target.
  const rows = manifestByFile.get(file) ?? []
  const usedRows = new Set()
  let i = 0
  for (const occ of cOcc) {
    if (occ.targets.length === 1 && !rows.some((r) => r.targets.length === 1 && r.targets[0] === occ.targets[0])) {
      occurrencesCompared++
      if (!isDeepStrictEqual(bOcc[i], occ)) unexpected('single reference differs', { file, basePosition: i, before: bOcc[i], after: occ })
      i++
      continue
    }
    const members = bOcc.slice(i, i + occ.targets.length)
    const row = rows.find((r, k) => !usedRows.has(k) && isDeepStrictEqual([...r.targets].sort(), [...occ.targets].sort()))
    if (!row) {
      unexpected('multi-reference not in the manifest', { file, targets: occ.targets })
      i += occ.targets.length
      continue
    }
    usedRows.add(rows.indexOf(row))
    occurrencesCompared += members.length
    const memberTargets = members.map((m) => m.targets[0])
    const linkTargets = occ.segments.filter((s) => s.kind === 'link').map((s) => s.target)
    if (!isDeepStrictEqual([...memberTargets].sort(), [...occ.targets].sort()) || members.some((m) => m.targets.length !== 1)) {
      unexpected('multi-reference targets are not the base members', { file, members: memberTargets, targets: occ.targets })
    }
    const reordered = !isDeepStrictEqual(memberTargets, linkTargets)
    if (reordered && !row.reorders) unexpected('reordered without reorders in the manifest', { file, before: row.before, after: row.after })
    if (!reordered && row.reorders) unexpected('manifest says reorders, but the order is kept', { file, before: row.before })
    for (const t of occ.targets) {
      const before = links(members).find((s) => s.target === t), after = occ.segments.find((s) => s.kind === 'link' && s.target === t)
      if (before?.href !== after?.href || before?.kbHref !== after?.kbHref) unexpected('link href differs', { file, target: t, before, after })
    }
    const wordsChanged = plainManifest(row.before) !== plainManifest(row.after)
    if (wordsChanged && !row.change && !row.reorders) unexpected('words change without change in the manifest', { file, before: row.before, after: row.after })
    if (!wordsChanged && row.change) unexpected('manifest records a change, but the words are the same', { file, before: row.before })
    const kind = row.change && reordered ? 'words change and reorder' : row.change ? 'words change' : reordered ? 'reorder' : row.before === row.after ? 'identical' : 'link boundary only'
    if (reordered) reorderedFiles.add(file)
    intended(`converted place: ${kind}`, { file, template: row.template, before: row.before, after: row.after, change: row.change })
    i += occ.targets.length
  }
  if (i !== bOcc.length) unexpected('base occurrences left over', { file, consumed: i, base: bOcc.length })
  rows.forEach((r, k) => { if (!usedRows.has(k)) unexpected('manifest place not found in the candidate', { file, before: r.before }) })

  // The file's text, with each manifest place's before replaced by its after, must be the candidate's.
  let expected = bracketed(fileText(b))
  let from = 0
  for (const row of [...rows].sort((x, y) => expected.indexOf(x.before) - expected.indexOf(y.before))) {
    const at = expected.indexOf(row.before, from)
    if (at === -1) { unexpected('manifest before not in the base text', { file, before: row.before }); continue }
    expected = expected.slice(0, at) + row.after + expected.slice(at + row.before.length)
    from = at + row.after.length
  }
  const actual = bracketed(fileText(c))
  if (expected !== actual) {
    const d = firstDiff(expected, actual)
    unexpected(plainManifest(expected) === plainManifest(actual) ? 'link boundaries differ outside the manifest' : 'page text differs outside the manifest', { file, expected: d.a, actual: d.b })
  }
  const bLinks = links(bOcc).map((s) => s.target), cLinks = links(cOcc).map((s) => s.target)
  if (!isDeepStrictEqual([...bLinks].sort(), [...cLinks].sort())) unexpected('the file links different targets', { file })
}
for (const file of manifestByFile.keys()) if (!common.includes(file)) unexpected('manifest file not found', { file })

// ── Backlinks ──
const owningEntity = (t) => t.replace(/\.(claims|terms)\.[^.]+$/, '')
const isUrl = (t) => /^[a-z]+:\/\//.test(t)
// source -> entity -> target ('*' for all) -> count. A base in the dictionary format counts
// declared keys, a list-format build counts citations.
function citations(dump) {
  const own = new Map()
  const bump = (src, e, t) => {
    if (!own.has(src)) own.set(src, new Map())
    const m = own.get(src)
    m.set(`${e} ${t}`, (m.get(`${e} ${t}`) ?? 0) + 1)
  }
  for (const [file, f] of Object.entries(dump.files)) {
    const src = f.owner.slice(f.owner.indexOf(':') + 1)
    const targets = f.inOrder === undefined
      ? f.declared.flatMap((d) => d.targets)
      : occurrences(dump, file).flatMap((o) => o.targets)
    for (const t of targets) {
      if (isUrl(t)) continue
      bump(src, owningEntity(t), '*')
      bump(src, owningEntity(t), t)
    }
  }
  return own
}
const collator = new Intl.Collator('hu', { sensitivity: 'variant', numeric: true })
function checkBacklinkRule(dump, label) {
  const own = citations(dump)
  let lists = 0, nodes = 0, bad = 0
  for (const [key, rows] of Object.entries(dump.owners)) {
    if (!key.startsWith('backlinks ')) continue
    const [, entity, target] = key.split(' ')
    lists++
    const inTree = new Set()
    const walk = (level) => {
      for (let k = 0; k < level.length; k++) {
        const r = level[k]
        nodes++
        inTree.add(r.fqn)
        const expected = (own.get(r.fqn)?.get(`${entity} ${target}`) ?? 0) + r.children.reduce((s, c) => s + c.count, 0)
        if (r.count !== expected) { bad++; unexpected(`${label}: backlink count is not the citation count`, { list: key, source: r.fqn, count: r.count, expected }) }
        if (k > 0) {
          const p = level[k - 1]
          if (p.count < r.count || (p.count === r.count && collator.compare(p.title, r.title) > 0)) { bad++; unexpected(`${label}: backlink rows out of order`, { list: key, rows: [p.fqn, r.fqn] }) }
        }
        walk(r.children)
      }
    }
    walk(rows)
    for (const [src, m] of own) {
      if (m.get(`${entity} ${target}`) && !inTree.has(src) && !/^\/(articles|newsletters|pages|landings)\//.test(src)) {
        bad++
        unexpected(`${label}: a citing source has no backlink row`, { list: key, source: src })
      }
    }
  }
  report.info.push({ what: `${label}: backlink rule checked`, lists, nodes, failures: bad })
}
checkBacklinkRule(base, 'base')
checkBacklinkRule(cand, 'candidate')

const backlinkKeys = (d) => Object.keys(d.owners).filter((k) => k.startsWith('backlinks '))
let countChanges = 0, orderChanges = 0
for (const key of new Set([...backlinkKeys(base), ...backlinkKeys(cand)])) {
  const a = base.owners[key], b = cand.owners[key]
  if (isDeepStrictEqual(a, b)) continue
  if (mode === 'step4a') { unexpected('backlinks differ', { list: key, before: a, after: b }); continue }
  const paths = (rows, pre = '') => (rows ?? []).flatMap((r) => [`${pre}/${r.fqn}`, ...paths(r.children, `${pre}/${r.fqn}`)])
  const shapeA = paths(a), shapeB = paths(b)
  if (!isDeepStrictEqual([...shapeA].sort(), [...shapeB].sort())) {
    const gone = shapeA.filter((p) => !shapeB.includes(p)), added = shapeB.filter((p) => !shapeA.includes(p))
    const d = { list: key, gone, added }
    if (explainedByCleanup(key, gone, added)) intended('backlink rows from a removed or retargeted reference', d)
    else unexpected('backlink rows differ', d)
    continue
  }
  if (isDeepStrictEqual([...shapeA], [...shapeB])) countChanges++
  else orderChanges++
}
if (mode === 'step4') report.info.push({ what: 'backlink lists whose counts change (checked by rule above)', countOnly: countChanges, countAndOrder: orderChanges })

// ── Other entries: labels, titles, row lines, reference panels, structured data ──
const otherKeys = (d) => Object.keys(d.owners).filter((k) => !k.startsWith('backlinks '))
let otherCompared = 0
for (const key of new Set([...otherKeys(base), ...otherKeys(cand)])) {
  otherCompared++
  const a = withoutDates(base.owners[key]), b = withoutDates(cand.owners[key])
  if (isDeepStrictEqual(a, b)) continue
  const d = { key, before: a, after: b }
  const sdListed = key.startsWith('structuredData ') && manifest.some((m) => JSON.stringify(a).split(plainManifest(m.before)).join(plainManifest(m.after)) === JSON.stringify(b))
  if (sdListed) { intended('structured data description follows a listed step 4 change', d); continue }
  if (key.startsWith('structuredData ') && descriptionFollowsManifest(key, a, b)) { intended('structured data description follows a converted place', d); continue }
  const panelFile = () => common.find((f) => f.endsWith(`/${key.split(':')[1]}.yaml`))
  if (key.startsWith('referencePanels ') && a && b && isDeepStrictEqual([...a].sort(), [...b].sort()) && (mode === 'step4' || reorderedFiles.has(panelFile()))) {
    intended(mode === 'step4' ? 'reference panel order follows the order of appearance' : 'reference panel order follows a reordered place', d)
  }
  else if (explainedEntry(key, a, b)) intended('panel or citation from a removed or retargeted reference', d)
  else unexpected('entry differs', d)
}

// ── Explanations for a base taken before the cleanup commits ──
function isReflexiveRetarget(file, a, b) {
  if (!REFLEXIVE_FILE.test(file)) return false
  const swap = (o) => JSON.parse(JSON.stringify(o).split(REFLEXIVE_FROM).join(REFLEXIVE_TO).replace(/fogalmak\.reflexive-relation|#[^"]*reflexive-relation[^"]*/g, ''))
  return isDeepStrictEqual(a.targets, [REFLEXIVE_FROM]) && isDeepStrictEqual(b.targets, [REFLEXIVE_TO]) &&
    isDeepStrictEqual(a.segments.map((s) => s.text), b.segments.map((s) => s.text))
}
function removedPairs() {
  const pairs = new Set()
  for (const [file, f] of Object.entries(base.files)) {
    const src = f.owner.slice(f.owner.indexOf(':') + 1)
    for (const d of f.declared) if (f.unused.includes(d.key)) for (const t of d.targets) pairs.add(`${src} ${t}`)
    if (REFLEXIVE_FILE.test(file)) pairs.add(`${src} ${REFLEXIVE_FROM}`).add(`${src} ${REFLEXIVE_TO}`)
  }
  return pairs
}

function explainedByCleanup(key, gone, added) {
  removed ??= removedPairs()
  const [, entity, target] = key.split(' ')
  const matches = (r) => (target === '*' ? owningEntity(r.split(' ')[1]) === entity : r.endsWith(` ${target}`))
  const changed = [...gone, ...added]
  const explained = changed.filter((p) => [...removed].some((r) => r.startsWith(`${p.split('/').pop()} `) && matches(r)))
  return changed.every((p) => explained.includes(p) || explained.some((e) => e.startsWith(`${p}/`)))
}
function explainedEntry(key, a, b) {
  removed ??= removedPairs()
  if (!key.startsWith('referencePanels ') && !key.startsWith('structuredData ')) return false
  const [type, name] = key.split(' ')[1].split(':')
  return [...removed].some((r) => r.split(' ')[0].endsWith(`.${name}`)) && !!a && !!b && type !== undefined
}

// The description is a truncated excerpt of the body, so a word change shifts where it is cut.
function descriptionFollowsManifest(key, a, b) {
  const name = key.split(' ')[1].split(':')[1]
  const rows = manifest.filter((m) => m.file?.endsWith(`/${name}.yaml`) && plainManifest(m.before) !== plainManifest(m.after))
  if (!rows.length || !a || !b) return false
  const descriptions = (v) => v['@graph'].map((g) => g.description)
  const strip = (v) => JSON.stringify({ ...v, '@graph': v['@graph'].map(({ description, ...g }) => g) })
  if (strip(a) !== strip(b)) return false
  return descriptions(a).every((da, i) => {
    const db = descriptions(b)[i]
    if (da === db) return true
    let x = (da ?? '').replace(/\u2026$/, '')
    for (const m of rows) x = x.split(plainManifest(m.before)).join(plainManifest(m.after))
    const y = (db ?? '').replace(/\u2026$/, '')
    return x.startsWith(y) || y.startsWith(x)
  })
}

function firstDiff(a, b) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  let ea = a.length, eb = b.length
  while (ea > i && eb > i && a[ea - 1] === b[eb - 1]) { ea--; eb-- }
  return { a: a.slice(Math.max(0, i - 60), ea + 30), b: b.slice(Math.max(0, i - 60), eb + 30) }
}

const tally = (list) => Object.entries(list.reduce((m, x) => ((m[x.what] = (m[x.what] ?? 0) + 1), m), {}))
console.log(`layer 1 (${mode}): ${common.length} files, ${occurrencesCompared} base occurrences compared, ${otherCompared} other entries compared`)
for (const x of report.info) console.log(`  info: ${JSON.stringify(x).slice(0, 300)}`)
console.log(`  intended: ${report.intended.length}`)
for (const [what, n] of tally(report.intended)) console.log(`    ${n}  ${what}`)
console.log(`  unexpected: ${report.unexpected.length}`)
for (const [what, n] of tally(report.unexpected)) console.log(`    ${n}  ${what}`)
for (const u of report.unexpected.slice(0, 15)) console.log(`  UNEXPECTED ${JSON.stringify(u).slice(0, 700)}`)
if (reportFile) fs.writeFileSync(reportFile, JSON.stringify(report, null, 1))
console.log(report.unexpected.length === 0 ? 'layer 1 PASS' : 'layer 1 FAIL')
process.exit(report.unexpected.length === 0 ? 0 : 1)
