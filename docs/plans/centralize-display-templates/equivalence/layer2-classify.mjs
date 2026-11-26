// OUT_A=<out A> OUT_B=<out B> [PRE_CLEANUP=1] node layer2-classify.mjs <layer2 report.json> step4|step4a <manifest.json | -> [classified.json]
// Sorts every file in a layer2.mjs report into the kinds of difference it holds, and lists the
// files with a difference no kind explains. The report holds, per file, the span from the first
// to the last differing character of the normalized texts; OUT_A and OUT_B are the two exports,
// read again where a whole page is needed. A flight file takes the verdict of its page's .txt,
// since the build's check-flight step asserts that the two hold the same payload.
//
// Kinds:
//   separators   React's <!-- --> between adjacent text nodes, which move with the text.
//   empty-text   [] where a resolved display had an empty text segment (payload only).
//   backlinks    backlink counts and the order of backlink rows.
//   panel-order  the order of the reference panels on a knowledge-base page.
//   listed       a step 4 change from the step 4 manifest.
//   retarget     the reflexive relation link (a base before fe9c658 only).
//   removed      backlink rows, panels and structured data citations of a removed reference
//                (a base before 36ad8f1 only).
//   converted    the page text equals the base text with every converted place's before
//                replaced by its after, and the links point at the same targets (step4a).
import fs from 'node:fs'
const [reportFile, mode, manifestFile, outFile] = process.argv.slice(2)
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
const manifest = manifestFile && manifestFile !== '-' ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : []
const preCleanup = process.env.PRE_CLEANUP === '1'

const plainManifest = (s) => s.replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()
const isRsc = (file) => !file.endsWith('.html') && !file.endsWith('.xml')

const separators = (s) => s.split('<!-- -->').join('')
const emptyText = (s) => s.split('[[],["$","a",').join('["$","a",').replace(/("\]\}\]),\[\]\]/g, '$1')
const backlinkCounts = (s) =>
  s.replace(/("?data-backlink-count"?[:=]"?)\d+/g, '$1N').replace(/\d+ hivatkozás/g, 'N hivatkozás')
const REFLEXIVE = [
  ['definiciok.reflexiv-relacio.fogalmak.reflexiv-relacio', 'definiciok.reflexiv-relacio'],
  ['/hu/tudasbazis/definiciok/reflexiv-relacio#fogalmak.reflexiv-relacio', '/hu/tudasbazis/definiciok/reflexiv-relacio'],
  ['definitions.reflexiv-relacio.terms.reflexive-relation', 'definitions.reflexiv-relacio'],
]
const retarget = (s) => REFLEXIVE.reduce((t, [a, b]) => t.split(a).join(b), s)
const linkTextPairs = manifest.flatMap((m) => {
  const a = [...m.before.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1])
  const b = [...m.after.matchAll(/\[([^\]]*)\]/g)].map((x) => x[1])
  return a.length === b.length ? a.map((x, i) => [x, b[i]]).filter(([x, y]) => x !== y) : []
})
const listed = (s) => linkTextPairs.reduce((t, [a, b]) => t.split(a).join(b), s)

const rscIds = (t) => t.replace(/\$L[0-9a-f]+/g, '$L').replace(/(^|\n)[0-9a-f]+:(T[0-9a-f]+,)?/g, '$1:')
const elements = (s, file) => (isRsc(file) ? rscIds(s).split(/(?=\["\$")|(?=\{"key":)|(?=\{"@)|\n/) : s.split(/(?=<)|(?=\{"@)/))
const PANEL_OR_BACKLINK = /backlinks-panel|kb-panel|panel_title|data-kb-panel|nth-child|data-backlink|hivatkozás/
const STRUCTURAL = /^(<\/[a-z0-9]+>|[\]}),"$undefinedL\s:]*|[0-9a-f]+:)$/
const multiset = (list) => list.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map())
function residual(a, b, file) {
  const ma = multiset(elements(a, file)), mb = multiset(elements(b, file))
  const onlyA = [], onlyB = []
  for (const [k, n] of ma) for (let i = (mb.get(k) ?? 0); i < n; i++) onlyA.push(k)
  for (const [k, n] of mb) for (let i = (ma.get(k) ?? 0); i < n; i++) onlyB.push(k)
  return { onlyA, onlyB }
}
// The elements between the common prefix and suffix: what moved when the multisets agree.
function moved(a, b, file) {
  const ea = elements(a, file), eb = elements(b, file)
  let i = 0
  while (i < ea.length && ea[i] === eb[i]) i++
  let ja = ea.length, jb = eb.length
  while (ja > i && jb > i && ea[ja - 1] === eb[jb - 1]) { ja--; jb-- }
  return [...ea.slice(i, ja), ...eb.slice(i, jb)]
}

// Plain text and link targets, for the step4a check.
const PANELS_HTML = /<h2 id="kb-panel-title-[^"]*"[^>]*>[\s\S]*?<\/h2>|<section aria-labelledby="kb-panel-title-[^"]*"[\s\S]*?<\/section>|<style>[^<]*<\/style>/g
function plainHtml(s) {
  return s.replace(PANELS_HTML, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<meta [^>]*>/g, '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ')
}
function plainRsc(s) {
  const t = s.replace(/\["\$","[^"]*",(?:"(?:[^"\\]|\\.)*"|null),/g, '[')
  const out = []
  for (const m of t.matchAll(/"children":"((?:[^"\\]|\\.)*)"|(?<=[[,])"((?:[^"\\]|\\.)*)"(?=[,\]])/g)) {
    const v = m[1] ?? m[2]
    if (v.startsWith('$')) continue
    out.push(v)
  }
  return out.join('').replace(/\s+/g, ' ')
}
const hrefs = (s) => [...s.matchAll(/href(?:=|":)"([^"]*)"/g)].map((m) => m[1]).sort()

const outA = process.env.OUT_A, outB = process.env.OUT_B
// The normalization layer2.mjs applies, for reading a whole file again: build id, file hashes,
// flight file names, dates.
const HASH_RE = /((?:static\/(?:chunks|css|media)\/)[^"'\s)\\]*?)[0-9a-f]{16}/g
const hashNames = (t) => { let prev; do { prev = t; t = t.replace(HASH_RE, '$1HASH') } while (t !== prev); return t }
function reader(root) {
  const buildId = fs.readdirSync(`${root}/_next/static`).find((x) => !['chunks', 'css', 'flight', 'media'].includes(x))
  return (file) => {
    let t = fs.readFileSync(`${root}/${file}`, 'utf8')
    t = t.split(buildId).join('BUILD_ID').split(buildId.replace(/-/g, '_')).join('BUILD_ID')
    t = t.replace(/_next\/static\/flight\/([0-9a-f]+)\.js/g, '_next/static/flight/F.js')
    t = hashNames(t).replace(/<lastmod>[^<]*<\/lastmod>/g, '<lastmod/>').replace(/(\\*")dateModified\1:\1[^"\\]*\1/g, '$1dateModified$1:$1DATE$1')
    return separators(t)
  }
}
const readA = outA && reader(outA), readB = outB && reader(outB)
const appliedOnPage = new Map()
// The manifest writes a place as it reads mid-sentence; at the start of a sentence the site capitalizes it.
const variants = (x, y) => [[x, y], [x[0].toUpperCase() + x.slice(1), y[0].toUpperCase() + y.slice(1)]]
const htmlPanelOrder = new Set()
// An RSC payload as one tree: every "$L<id>" replaced by its chunk, the panel descriptors of a
// knowledge-base page sorted, and the chunk ids dropped. Equal trees render the same page up to
// the order of its panels.
function resolvedRsc(t, sortBacklinkRows) {
  const chunks = new Map()
  for (const line of t.split(/\n(?=[0-9a-f]+:)/)) {
    const m = line.match(/^([0-9a-f]+):([\s\S]*)$/)
    if (!m) continue
    let v = m[2]
    try { v = JSON.parse(v) } catch {}
    chunks.set(m[1], v)
  }
  const used = new Set()
  const walk = (v, depth = 0) => {
    if (depth > 200) return v
    if (typeof v === 'string') {
      const ref = v.match(/^\$[L@]?([0-9a-f]+)$/)
      if (ref && chunks.has(ref[1])) { used.add(ref[1]); return walk(chunks.get(ref[1]), depth + 1) }
      if (/^[[{]/.test(v)) { try { return { json: walk(JSON.parse(v), depth + 1) } } catch {} }
      return v
    }
    if (Array.isArray(v)) {
      const out = v.map((x) => walk(x, depth + 1))
      const isRow = (x) => Array.isArray(x) && x[0] === '$' && x[1] === 'li' && /backlinks-panel_source/.test(x[3]?.className ?? '')
      if (sortBacklinkRows && out.length > 1 && out.every(isRow)) return out.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x))
      if (out.length > 1 && out.every((x) => x && typeof x === 'object' && !Array.isArray(x) && 'key' in x && 'title' in x)) {
        return out.map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x))
      }
      return out
    }
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, depth + 1)]))
    return v
  }
  for (const v of chunks.values()) walk(v)
  const root = walk(chunks.get('0'))
  const rest = [...chunks].filter(([id]) => id !== '0' && !used.has(id)).map(([, v]) => JSON.stringify(walk(v))).sort()
  return JSON.stringify([root, rest])
}
// Each panel's title and section, sorted, in place of the first: the panels as a set.
function sortPanels(t) {
  const blocks = t.match(PANELS_HTML) ?? []
  let first = true
  const rest = t.replace(PANELS_HTML, () => (first ? ((first = false), '\u0000PANELS\u0000') : ''))
  return rest.replace('\u0000PANELS\u0000', [...blocks].sort().join(''))
}
const results = []
const flightFollows = []
const tally = {}
function classifyOne(d, disabled = new Set()) {
  const kinds = []
  let a = d.before, b = d.after
  const step = (kind, fn) => {
    if (a === b || disabled.has(kind)) return
    const na = fn(a), nb = fn(b)
    if (na !== a || nb !== b) {
      a = na
      b = nb
      kinds.push(kind)
    }
  }
  step('separators', separators)
  if (mode === 'step4') step('empty-text', emptyText)
  if (mode === 'step4') {
    step('backlinks', backlinkCounts)
    if (a !== b && !disabled.has('listed')) { const la = listed(a); if (la !== a) { a = la; kinds.push('listed') } }
    if (preCleanup && a !== b && !disabled.has('retarget')) { const ra = retarget(a); if (ra !== a) { a = ra; kinds.push('retarget') } }
  }
  if (mode === 'step4' && a !== b) {
    if (!isRsc(d.file)) {
      let fa = readA(d.file), fb = readB(d.file)
      if (kinds.includes('listed')) fa = listed(fa)
      if (kinds.includes('retarget')) fa = retarget(fa)
      const na = sortPanels(fa), nb = sortPanels(fb)
      if (na === nb) { a = b; kinds.push('panel-order'); htmlPanelOrder.add(d.file) }
    } else if (d.file.endsWith('.txt')) {
      let fa = readA(d.file), fb = readB(d.file)
      if (kinds.includes('empty-text')) { fa = emptyText(fa); fb = emptyText(fb) }
      if (kinds.includes('backlinks')) { fa = backlinkCounts(fa); fb = backlinkCounts(fb) }
      if (kinds.includes('listed')) fa = listed(fa)
      if (kinds.includes('retarget')) fa = retarget(fa)
      if (resolvedRsc(fa, kinds.includes('backlinks')) === resolvedRsc(fb, kinds.includes('backlinks'))) {
        a = b
        if (htmlPanelOrder.has(d.file.replace(/\.txt$/, '.html'))) kinds.push('panel-order')
        else kinds.push('PAYLOAD-ONLY REORDER')
      }
    }
  }
  let verdict = a === b && !kinds.includes('PAYLOAD-ONLY REORDER') ? 'explained' : null
  if (verdict && !isRsc(d.file)) appliedOnPage.set(d.file, [])
  let detail
  if (!verdict && mode === 'step4') {
    const { onlyA, onlyB } = residual(a, b, d.file)
    if (onlyA.length === 0 && onlyB.length === 0) {
      const m = moved(a, b, d.file).filter((e) => !STRUCTURAL.test(e))
      const odd = m.filter((e) => !PANEL_OR_BACKLINK.test(e))
      const backlinkRows = m.some((e) => /backlinks-panel_(source|nested|link|label|count)|data-backlink/.test(e))
      const panels = m.some((e) => /kb-panel-title-reference|data-kb-panel-kind="reference"|nth-child/.test(e))
      if (odd.length === 0) {
        if (backlinkRows) kinds.push('backlinks')
        if (panels || !backlinkRows) kinds.push('panel-order')
        verdict = 'explained'
      } else detail = { moved: odd.slice(0, 6) }
    } else {
      const odd = [...onlyA, ...onlyB].filter((e) => !STRUCTURAL.test(e) && !PANEL_OR_BACKLINK.test(e))
      const jsonLd = odd.filter((e) => !/"@id"|"@type"|schema\.org|^[0-9a-f]+:T[0-9a-f]+,|^\{"key":"reference"|^:\["[^"]*"\]$|^<style>#kb-panel|^:$/.test(e))
      if (preCleanup && odd.length === 0) { kinds.push('removed'); verdict = 'explained' }
      else if (preCleanup && jsonLd.length === 0) { kinds.push('removed (panels and structured data citations)'); verdict = 'explained' }
      else detail = { onlyA: onlyA.slice(0, 6), onlyB: onlyB.slice(0, 6) }
    }
  }
  if (!verdict && mode === 'step4a') {
    const page = isRsc(d.file) ? (d.file.match(/^_next\/static\/flight\/\[(.*)\]\.js$/)?.[1] ?? d.file.replace(/\.txt$/, '.html')) : d.file
    const sameTargets = JSON.stringify(hrefs(a)) === JSON.stringify(hrefs(b))
    if (!isRsc(d.file)) {
      const full = (dir) => (dir === outA ? readA : readB)(d.file)
      let expected = plainHtml(full(outA))
      const actual = plainHtml(full(outB))
      const applied = []
      for (const m of manifest) {
        for (const [x, y] of variants(plainManifest(m.before), plainManifest(m.after))) {
          const k = expected.split(x).length - 1
          if (k && x !== y) { expected = expected.split(x).join(y); applied.push([x, y, k]) }
        }
      }
      appliedOnPage.set(page, applied)
      if (expected === actual && sameTargets) {
        kinds.push('converted')
        const panels = (t) => (t.match(PANELS_HTML) ?? []).join('')
        if (panels(full(outA)) !== panels(full(outB))) kinds.push('panel-order')
        verdict = 'explained'
      } else {
        let i = 0
        while (expected[i] === actual[i]) i++
        detail = { sameTargets, expected: expected.slice(Math.max(0, i - 120), i + 120), actual: actual.slice(Math.max(0, i - 120), i + 120) }
      }
    } else {
      const applied = appliedOnPage.get(page)
      const letters = (t) => multiset([...plainRsc(t).normalize('NFC')].filter((c) => /[\p{L}\p{N}]/u.test(c)))
      const la = letters(a), lb = letters(b)
      const bump = (str, sign) => { for (const c of str) if (/[\p{L}\p{N}]/u.test(c)) la.set(c, (la.get(c) ?? 0) + sign) }
      for (const [x, y, k] of applied ?? []) for (let i = 0; i < k; i++) { bump(x, -1); bump(y, 1) }
      const keys = new Set([...la.keys(), ...lb.keys()])
      const off = [...keys].filter((c) => (la.get(c) ?? 0) !== (lb.get(c) ?? 0)).map((c) => `${c}:${(la.get(c) ?? 0) - (lb.get(c) ?? 0)}`)
      if (off.length === 0 && sameTargets) {
        kinds.push(applied === undefined ? 'payload structure only, page HTML identical' : applied.length === 0 ? 'payload structure only, page differs in separators only' : 'converted (letters and link targets, as on its page)')
        verdict = 'explained'
      } else detail = { sameTargets, page, pageApplied: applied?.length ?? null, letterDifference: off.slice(0, 20) }
    }
  }
  return { verdict, kinds, detail }
}
const ABLATABLE = ['separators', 'empty-text', 'backlinks', 'listed', 'retarget']
for (const d of [...report.diffs].sort((x, y) => isRsc(x.file) - isRsc(y.file))) {
  let { verdict, kinds, detail } = classifyOne(d)
  if (verdict === 'explained') {
    const disabled = new Set()
    for (const k of kinds.filter((k) => ABLATABLE.includes(k))) {
      disabled.add(k)
      if (classifyOne(d, disabled).verdict !== 'explained') disabled.delete(k)
    }
    kinds = classifyOne(d, disabled).kinds
  }
  if (!verdict && d.file.startsWith('_next/static/flight/')) {
    const txt = d.file.match(/^_next\/static\/flight\/\[(.*)\.html\]\.js$/)?.[1] + '.txt'
    flightFollows.push({ d, txt, kinds })
    continue
  }
  verdict ??= 'UNEXPECTED'
  const key = verdict === 'explained' ? kinds.join(' + ') : 'UNEXPECTED'
  tally[key] = (tally[key] ?? 0) + 1
  results.push({ file: d.file, verdict, kinds, detail })
}
// A flight file holds the same payload as the page's .txt, which the build's check-flight step
// asserts, so it takes the .txt's verdict.
for (const { d, txt, kinds } of flightFollows) {
  const t = results.find((r) => r.file === txt)
  const verdict = t?.verdict ?? 'UNEXPECTED'
  const all = [...(t?.kinds ?? []), 'flight copy of the .txt']
  const key = verdict === 'explained' ? all.join(' + ') : 'UNEXPECTED'
  tally[key] = (tally[key] ?? 0) + 1
  results.push({ file: d.file, verdict, kinds: all, detail: t ? undefined : { missing: txt } })
}
console.log(`layer 2 classified (${mode}${preCleanup ? ', pre-cleanup base' : ''}): ${report.diffs.length} differing files, ${report.onlyA.length + report.onlyB.length} paths in one build only`)
for (const [k, n] of Object.entries(tally).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
for (const r of results.filter((r) => r.verdict === 'UNEXPECTED').slice(0, 10)) console.log(`  UNEXPECTED ${r.file}\n    ${JSON.stringify(r.detail ?? null).slice(0, 1200)}`)
if (outFile) fs.writeFileSync(outFile, JSON.stringify(results, null, 1))
process.exit(results.some((r) => r.verdict === 'UNEXPECTED') || report.onlyA.length || report.onlyB.length ? 1 : 0)
