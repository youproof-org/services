/**
 * Derives the browser suite's expected values from the content graph.
 *
 * The numbers these tests assert — how many rows a backlink list has, how many
 * entries an index serves — are properties of the CONTENT, and they differ between
 * env modes: a deployed build gives no page to an entity in an unpublished chapter,
 * so `buildBacklinkIndex` drops it as a source and the index lists lose the rows.
 * Hardcoding them pins the suite to one build mode; reading them off the page under
 * test would compare the page to itself and assert nothing. So they come from the
 * data layer, which is the only third party to the two.
 *
 * The same applies to WHICH entity a test uses. A test that needs "an entity nothing
 * cites" must be handed one that has a page in this build, not a URL that was true
 * when the test was written.
 *
 * Run under tsx with the `server-only` shim (see e2e/support/global-setup.ts), the
 * same way test/*.test.mjs reach the graph.
 */
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import '../../scripts/lib/load-env.mjs'
import * as graphModule from '../../lib/content/graph.ts'
import * as urlsModule from '../../lib/content/urls.ts'
import * as keysModule from '../../lib/content/keys.ts'
import * as glossaryModule from '../../lib/content/glossary-rows.ts'

const pick = (m) => m.default ?? m
const { buildContentGraph, kbPageExists, kbNodes, kbNodeTitle, kbNodeLabel } = pick(graphModule)
const { urlForKbNode } = pick(urlsModule)
const { keyForKbNode } = pick(keysModule)
const { glossaryRows } = pick(glossaryModule)

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(websiteRoot, 'out')
const LOCALE = 'hu'

/**
 * A backlink tree flattened into the order the panel renders it: pre-order, which is
 * what `<li>`s with nested `<ul>`s inside them come out as, so index N here is the
 * Nth `.backlinks-panel_link` on the page.
 */
function flatten(sources, depth = 0, out = []) {
  for (const source of sources) {
    out.push({ ...source, depth })
    flatten(source.children, depth + 1, out)
  }
  return out
}

/** The leading index of a row's first line with its digits blanked ("16.1." -> "n.n."). */
const numberShape = (label) => {
  const index = /^\d+(?:\.\d+)*\./.exec(label)
  return index ? index[0].replace(/\d+/g, 'n') : '(none)'
}
/** What stands between that index and the title — only an entity row has one. */
const typeWord = (label) => /^\d+(?:\.\d+)*\.\s([^:]+):/.exec(label)?.[1] ?? '(none)'
/**
 * The literal leading index of a row's first line ("16."). The rest of the line is
 * not asserted: it goes through `InlineText`, so a title carrying math renders as
 * elements whose text is not the source string.
 */
const numberPrefix = (label) => /^\d+(?:\.\d+)*\./.exec(label)?.[0] ?? ''

/** Everything a spec asserts about one rendered backlink list. */
function describeList(sources) {
  const rows = flatten(sources)
  const linesByKind = {}
  const kindsByDepth = {}
  for (const row of rows) {
    const entry = (linesByKind[row.kind] ??= { number: new Set(), typeWord: new Set(), ownership: new Set() })
    entry.number.add(numberShape(row.label))
    entry.typeWord.add(typeWord(row.label))
    entry.ownership.add(row.ownership ?? '(none)')
    ;(kindsByDepth[row.depth] ??= new Set()).add(row.kind)
  }
  return {
    rows: rows.length,
    topRows: sources.length,
    ownershipRows: rows.filter((row) => row.ownership).length,
    nestedRows: rows.filter((row) => row.children.length > 0).length,
    depths: [...new Set(rows.map((row) => row.depth))].sort(),
    kinds: [...new Set(rows.map((row) => row.kind))].sort(),
    topCountSum: sources.reduce((total, source) => total + source.count, 0),
    topFirstCount: sources[0]?.count ?? 0,
    firstHref: rows[0]?.href ?? null,
    lastHref: rows[rows.length - 1]?.href ?? null,
    firstNumberPrefix: numberPrefix(rows[0]?.label ?? ''),
    kindsByDepth: Object.fromEntries(
      Object.entries(kindsByDepth).map(([depth, kinds]) => [depth, [...kinds].sort()]),
    ),
    linesByKind: Object.fromEntries(
      Object.entries(linesByKind).map(([kind, sets]) => [
        kind,
        Object.fromEntries(Object.entries(sets).map(([key, values]) => [key, [...values].sort()])),
      ]),
    ),
  }
}

const graph = await buildContentGraph()

/** Every node this build gives a page to, in this locale, with its URL and key. */
const pages = []
for (const node of kbNodes(graph)) {
  if (node.locale !== LOCALE || !kbPageExists(graph, node)) continue
  const url = urlForKbNode(node)
  if (url) pages.push({ node, url, key: keyForKbNode(node) })
}

const backlinksOf = (entry) => graph.backlinks.get(entry.key)?.all ?? []

/**
 * The busiest list in the build. Chosen rather than named so the suite keeps
 * asserting "the long end of the range" whatever the content does; every list-shape
 * assertion is derived from whichever entity that turns out to be.
 */
const busiest = pages.reduce((best, entry) =>
  flatten(backlinksOf(entry)).length > flatten(backlinksOf(best)).length ? entry : best,
)

/**
 * The short end of the same range: still grouped into containers, and with a proof
 * among its sources, because the spec checks that a proof row names its theorem and
 * then says which of its children the row leads to.
 */
const shortListCandidates = pages
  .map((entry) => ({ entry, sources: backlinksOf(entry) }))
  .filter(({ sources }) => {
    const rows = flatten(sources)
    return sources.length >= 2 && rows.length >= 4 && rows.some((row) => row.kind === 'proof')
  })
  .sort((a, b) => flatten(a.sources).length - flatten(b.sources).length)
if (shortListCandidates.length === 0) throw new Error('no entity with a short, grouped backlink list carrying a proof')
const shortList = shortListCandidates[0]
const shortRows = flatten(shortList.sources)
const shortProofIndex = shortRows.findIndex((row) => row.kind === 'proof')

/** An entity nothing cites — the empty state, which is most of the build. */
const uncited = pages.find((entry) => backlinksOf(entry).length === 0)
if (!uncited) throw new Error('no entity with an empty backlink list')

/**
 * A proof, for the two menu items that must be absent: no proof defines a term, and a
 * claim inside a proof is a build error, so neither mode has anything to reveal.
 */
const termlessProof = pages.find(
  (entry) => entry.node.type === 'proof' && Object.keys(entry.node.terms ?? {}).length === 0,
)
if (!termlessProof) throw new Error('no proof without terms')

const indexRowCount = (nodes) =>
  [...nodes.values()].filter((node) => node.locale === LOCALE && kbPageExists(graph, node)).length

const fixtures = {
  siteEnv: process.env.SITE_ENV ?? '',
  pageCount: pages.length,
  busiest: { url: busiest.url, ...describeList(backlinksOf(busiest)) },
  shortList: {
    url: shortList.entry.url,
    rows: shortRows.length,
    topRows: shortList.sources.length,
    firstCount: shortList.sources[0].count,
    firstNumberPrefix: numberPrefix(shortRows[0].label),
    proofRow: {
      index: shortProofIndex,
      typeWord: typeWord(shortRows[shortProofIndex].label),
      numberPrefix: numberPrefix(shortRows[shortProofIndex].label),
      ownership: shortRows[shortProofIndex].ownership ?? '',
    },
  },
  uncited: { url: uncited.url },
  termlessProof: { url: termlessProof.url },
  /**
   * Rows in the inbound list of every entity that has any, keyed by URL — for a spec
   * that names its entity for a reason of its own (a body property, say) and still
   * needs a count that moves with the build. Absent means none, i.e. the empty state.
   */
  incomingRowsByUrl: Object.fromEntries(
    pages
      .map((entry) => [entry.url, flatten(backlinksOf(entry)).length])
      .filter(([, rows]) => rows > 0),
  ),
  lists: {
    glossaryRows: glossaryRows(graph.glossary).length,
    definitionRows: indexRowCount(graph.definitions),
    theoremRows: indexRowCount(graph.theorems),
  },
}

/**
 * The graph and the export must be the same build, or every number here is about a
 * page set the browser is not being served — and the failure would surface as a row
 * count being 24 out rather than as the mismatch it is.
 *
 * SITE_ENV decides both and nothing in out/ records which value produced it, so the
 * page set itself is the evidence. Counted in both directions: a graph with pages the
 * export lacks is the dev/deployed mismatch one way round, and an export with pages
 * the graph lacks is the other.
 */
function assertExportAgrees() {
  if (!existsSync(OUT)) return
  const kbRoot = path.join(OUT, LOCALE, 'tudasbazis')
  if (!existsSync(kbRoot)) return

  const missing = pages.filter((entry) => !existsSync(path.join(OUT, `${entry.url}.html`)))
  const indexPages = new Set(
    ['definiciok', 'tetelek', 'fogalmak'].map((name) => path.join(kbRoot, `${name}.html`)),
  )
  const exported = []
  const walkDir = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walkDir(full)
      else if (entry.name.endsWith('.html') && !indexPages.has(full)) exported.push(full)
    }
  }
  walkDir(kbRoot)

  if (missing.length === 0 && exported.length === pages.length) return
  throw new Error(
    `the content graph and out/ disagree about which entity pages exist: the graph has ` +
      `${pages.length}, out/ has ${exported.length}` +
      (missing.length > 0 ? `, and ${missing.length} of the graph's are not in out/ (e.g. ${missing[0].url})` : '') +
      `.\nSITE_ENV is "${fixtures.siteEnv || '(unset)'}" here; build and test with the same value ` +
      `— e.g. SITE_ENV=staging pnpm build && SITE_ENV=staging pnpm test:e2e.`,
  )
}
assertExportAgrees()

const outFile = path.join(websiteRoot, 'e2e', '.generated', 'fixtures.json')
mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(fixtures, null, 2)}\n`)
console.log(
  `[e2e-fixtures] SITE_ENV=${fixtures.siteEnv || '(unset)'}: ${fixtures.pageCount} entity page(s); ` +
    `busiest ${fixtures.busiest.url} (${fixtures.busiest.rows} rows); ` +
    `lists ${fixtures.lists.glossaryRows}/${fixtures.lists.definitionRows}/${fixtures.lists.theoremRows}`,
)
