// node --import tsx --import ./test/support/register.mjs layer1.mjs <grammar dir> <out.json>
// cwd: a website dir, CONTENT_DIR set. <grammar dir> is packages/display-templates/src of a
// services checkout that has the list format, so both builds find their tokens with one grammar.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const [grammarDir, outFile] = process.argv.slice(2)
const contentDir = process.env.CONTENT_DIR
const yaml = createRequire(path.resolve('package.json'))('js-yaml')
const { inlineTokens } = await import(path.join(grammarDir, 'inline-tokens.ts'))
const { fileReferenceTexts } = await import(path.join(grammarDir, 'references.ts'))
const g = await import(path.resolve('lib/content/graph.ts')).then((m) => m.default ?? m)
const graph = g.buildGraphFromRaw(await g.loadRawGraphData())
globalThis.__contentGraph = graph

const fqnOf = (t) => (t.type === 'external' ? t.url : t.fqn)
const targetsOf = (entry) => (entry.targets ?? [entry.target]).map(fqnOf)
const segmentsOf = (entry) =>
  entry.segments.map((s) =>
    s.kind === 'link'
      ? { kind: 'link', text: s.text, target: fqnOf(s.target), href: s.href ?? null, kbHref: s.kbHref ?? null }
      : { kind: 'text', text: s.text },
  )

const MAPS = ['chapters', 'sections', 'definitions', 'theorems', 'proofs', 'remarks', 'articles', 'newsletters', 'pages', 'landings']
const ownerKey = new Map()
for (const map of MAPS) for (const [key, node] of graph[map] ?? []) ownerKey.set(node, `${map}:${key}`)
const KB_TYPES = { definition: 'definitions', theorem: 'theorems', proof: 'proofs', remark: 'remarks' }
const STANDALONE = { article: 'articles', newsletter: 'newsletters', page: 'pages', landing: 'landings' }

function ownerOf(rel, doc) {
  const one = (map, test) => {
    const found = [...(graph[map]?.values() ?? [])].filter(test)
    if (found.length !== 1) throw new Error(`${rel}: ${found.length} ${map} match`)
    return found[0]
  }
  if (doc.type === 'chapter') return one('chapters', (n) => n.name === doc.name)
  if (doc.type === 'section') {
    const chapter = yaml.load(fs.readFileSync(path.join(contentDir, path.dirname(rel), 'chapter.yaml'), 'utf8'))
    return one('sections', (n) => n.name === doc.name && chapterNameOfSection.get(n) === chapter.name)
  }
  if (KB_TYPES[doc.type]) return one(KB_TYPES[doc.type], (n) => n.name === doc.name)
  if (STANDALONE[doc.type]) return one(STANDALONE[doc.type], (n) => n.name === doc.name || n.slug === doc.slug)
  return undefined
}
const chapterNameOfSection = new Map()
for (const chapter of graph.chapters.values()) for (const s of chapter.sections) chapterNameOfSection.set(s, chapter.name)

function* yamlFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* yamlFiles(full)
    else if (e.name.endsWith('.yaml')) yield full
  }
}

const kindOf = (type) =>
  KB_TYPES[type] ? 'entity' : type === 'section' || type === 'chapter' ? type : STANDALONE[type] ? 'standalone' : undefined

const out = { refs: {}, files: {}, owners: {}, problems: [] }
const seenOwners = new Set()
for (const full of yamlFiles(contentDir)) {
  const rel = path.relative(contentDir, full)
  const doc = yaml.load(fs.readFileSync(full, 'utf8'))
  const kind = kindOf(doc?.type)
  if (!kind) continue
  const node = ownerOf(rel, doc)
  seenOwners.add(node)
  const refs = node.references ?? {}
  const listFormat = Array.isArray(refs)
  const used = new Map()
  const sequence = []
  let n = 0
  const resolve = (token, source) => {
    const k = listFormat ? token.index : token.key
    const entry = token.kind === (listFormat ? 'ref' : 'legacy-ref') ? refs[k] : undefined
    if (entry === undefined) {
      if (token.kind === 'ref' || listFormat) out.problems.push(`${rel}: token ${source} has no reference`)
      return source
    }
    used.set(k, (used.get(k) ?? 0) + 1)
    sequence.push(k)
    const segments = segmentsOf(entry)
    out.refs[`ref ${rel}#${n}`] = { targets: targetsOf(entry), segments }
    n++
    return segments.map((s) => (s.kind === 'link' ? `\u27e6${s.text}\u27e7` : s.text)).join('')
  }
  const render = (text) => {
    let result = ''
    let at = 0
    for (const { token, start, source } of inlineTokens(text)) {
      result += text.slice(at, start)
      at = start + source.length
      if (token.kind === 'ref' || token.kind === 'legacy-ref') result += resolve(token, source)
      else if (token.kind === 'bold-italic' || token.kind === 'bold') {
        const fence = token.kind === 'bold' ? '**' : '***'
        result += fence + render(token.inner) + fence
      } else result += source
    }
    return result + text.slice(at)
  }
  const marked = fileReferenceTexts(doc, kind).map(render)
  const keys = listFormat ? refs.map((_, i) => i) : Object.keys(refs)
  const unused = keys.filter((k) => !used.has(k))
  const reused = listFormat ? keys.filter((k) => used.get(k) > 1) : []
  const inOrder = listFormat ? sequence.every((k, i) => k === i) : undefined
  out.files[rel] = {
    owner: ownerKey.get(node),
    occurrences: n,
    declared: listFormat
      ? refs.map((e, i) => ({ item: i, targets: targetsOf(e) }))
      : Object.entries(refs).map(([key, e]) => ({ key, targets: targetsOf(e) })),
    unused,
    reused,
    inOrder,
    marked,
  }
}
for (const map of MAPS) {
  for (const [key, node] of graph[map] ?? []) {
    const refs = node.references ?? []
    const count = Array.isArray(refs) ? refs.length : Object.keys(refs).length
    if (count > 0 && !seenOwners.has(node)) out.problems.push(`${map}:${key} has ${count} references but no content file was matched to it`)
    for (const section of map === 'articles' || map === 'newsletters' || map === 'pages' || map === 'landings' ? node.sections ?? [] : []) {
      const sr = section.references ?? []
      if ((Array.isArray(sr) ? sr.length : Object.keys(sr).length) > 0) out.problems.push(`${map}:${key} section ${section.name} has references the scan doesn't cover`)
    }
  }
}

const tree = (rows) => rows.map((r) => ({ fqn: r.fqn, title: r.title, count: r.count, children: tree(r.children) }))
for (const [entity, b] of graph.backlinks) {
  out.owners[`backlinks ${entity} *`] = tree(b.all)
  for (const [target, rows] of b.byTarget) out.owners[`backlinks ${entity} ${target}`] = tree(rows)
}

let panels
globalThis.React ??= (await import(createRequire(path.resolve('package.json')).resolve('react'))).default
try {
  panels = (await import(path.resolve('components/kb/panels/ReferencePanel.tsx'))).referencePanels
} catch (err) {
  out.problems.push(`referencePanels not loaded: ${err.message.split('\n')[0]}`)
}
const sd = await import(path.resolve('lib/content/structured-data.ts')).then((m) => m.default ?? m)
for (const node of g.kbNodes(graph)) {
  const id = `${node.type}:${node.name}`
  out.owners[`kbNodeLabel ${id}`] = g.kbNodeLabel(graph, node)
  out.owners[`kbNodeTitle ${id}`] = g.kbNodeTitle(graph, node)
  out.owners[`kbEntityRowLines ${id}`] = g.kbEntityRowLines(graph, node)
  if (!g.kbPageExists(graph, node)) continue
  if (panels) out.owners[`referencePanels ${id}`] = panels(node).map((p) => p.target)
  out.owners[`structuredData ${id}`] = sd.kbEntityStructuredData(graph, node)
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]))
fs.writeFileSync(outFile, JSON.stringify({ ...out, refs: sortKeys(out.refs), owners: sortKeys(out.owners) }, null, 1) + '\n')
console.log(`${Object.keys(out.refs).length} reference occurrences in ${Object.keys(out.files).length} files, ${Object.keys(out.owners).length} other entries, ${out.problems.length} problems`)
for (const p of out.problems.slice(0, 20)) console.log(`  ${p}`)
