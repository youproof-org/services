// Knowledge-base graph derivation: page existence, slug validation, the backlink
// index, the glossary, and the two-href reference resolution.
//
// Everything is driven through `buildGraphFromRaw` with a hand-built raw graph, so
// these are real graph invariants rather than assertions about a fixture on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as graphModule from '../lib/content/graph.ts'
import { urlForDefinition, urlForTheorem, urlForProof, urlForRemark, kbRefs, claimAnchorId, termAnchorId, kbAnchorPath, kbOwnedIndex, kbNodeAtIndex, sectionAnchorId, partAnchorId, ownPageScope, embeddedScope } from '../lib/content/urls.ts'

const { buildGraphFromRaw, kbPageExists, kbNodeTitle, kbNodeLabel, kbOwnership } = graphModule.default ?? graphModule

import { NS, hu, ref, narrative, claim, embed, raw } from './support/raw-graph.mjs'

const def = (g) => g.definitions.get('definitions.def-egy')
const thm = (g) => g.theorems.get('theorems.tetel-egy')
const prf = (g) => g.proofs.get('theorems.tetel-egy.proofs.biz-egy')
const rem = (g) => g.remarks.get('definitions.def-egy.remarks.rem-egy')

// ---------------------------------------------------------------------------

test('URLs are flat for definitions/theorems and nested for owned types', () => {
  const g = buildGraphFromRaw(raw())
  assert.equal(urlForDefinition(def(g)), '/hu/tudasbazis/definiciok/def-egy')
  assert.equal(urlForTheorem(thm(g)), '/hu/tudasbazis/tetelek/tetel-egy')
  assert.equal(urlForProof(prf(g)), '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1')
  assert.equal(urlForRemark(rem(g)), '/hu/tudasbazis/definiciok/def-egy/megjegyzesek/1')
})

test('a URL does not contain the namespace, so reorganizing namespaces cannot move it', () => {
  const g = buildGraphFromRaw(raw())
  for (const url of [urlForDefinition(def(g)), urlForTheorem(thm(g)), urlForProof(prf(g))]) {
    assert.ok(!url.includes('proba'), `${url} leaks its namespace`)
  }
})

test('embedding records the chapter, the section and the index label', () => {
  const g = buildGraphFromRaw(raw())
  const e = g.embedding.get('definitions.def-egy')
  assert.equal(e.chapter.name, 'fejezet')
  assert.equal(e.section.name, 'szakasz')
  assert.equal(e.index, '1.1.', 'definitions and theorems are numbered in embed order')
  assert.equal(g.embedding.get('theorems.tetel-egy.proofs.biz-egy').index, undefined, 'proofs are not numbered')
})

test('a node embedded in a published chapter has a page', () => {
  const g = buildGraphFromRaw(raw({ published: true }))
  for (const n of [def(g), thm(g), prf(g), rem(g)]) assert.equal(kbPageExists(g, n), true)
})

test('a node embedded nowhere never has a page', () => {
  const g = buildGraphFromRaw(
    raw({
      extraDefinitions: [
        { ...hu, name: 'arva', slug: 'arva', title: 'Árva', body: [], references: {}, remarkSlugs: [] },
      ],
    }),
  )
  assert.equal(kbPageExists(g, g.definitions.get('definitions.arva')), false)
})

test('titles: authored for definitions/theorems, derived from the owner otherwise', () => {
  const g = buildGraphFromRaw(raw())
  assert.equal(kbNodeTitle(g, def(g)), 'Első definíció')
  assert.equal(kbNodeTitle(g, thm(g)), 'Első tétel')
  assert.equal(kbNodeTitle(g, prf(g)), 'Bizonyítás: Első tétel')
  assert.equal(kbNodeTitle(g, rem(g)), 'Megjegyzés: Első definíció')
})

test('a label is where a node sits in the book, and an untitled node sorts under it', () => {
  const untitled = raw()
  delete untitled.definitions[0].title
  const g = buildGraphFromRaw(untitled)
  // What the index pages show in grey beside the title, and what the narrative
  // writes beside the node itself.
  assert.equal(kbNodeLabel(g, def(g)), '1.1. Definíció')
  assert.equal(kbNodeLabel(g, thm(g)), '1.2. Tétel')
  assert.equal(kbNodeLabel(g, prf(g)), 'Bizonyítás', 'proofs are not numbered')
  // The fallback the index pages rely on: without it this row would sort under the
  // empty string, at the top of the list.
  assert.equal(kbNodeTitle(g, def(g)), '1.1. Definíció')
})

test('a reference gets a chapter href AND a knowledge-base href', () => {
  const g = buildGraphFromRaw(
    raw({
      references: {
        'r-thm': ref('a tétel', 'theorems.tetel-egy'),
      },
    }),
  )
  const entry = def(g).references['r-thm']
  assert.equal(entry.href, '/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy')
  assert.equal(entry.kbHref, '/hu/tudasbazis/tetelek/tetel-egy')
})

test('a claim reference resolves to the slug anchor in both contexts', () => {
  const g = buildGraphFromRaw(
    raw({
      references: {
        'r-claim': ref('az állítás', 'definitions.def-egy.claims.def-claim'),
      },
    }),
  )
  const entry = def(g).references['r-claim']
  // Chapter context carries the node in the path; the node's own page does not.
  assert.equal(
    entry.href,
    '/hu/konyvek/konyv/fejezetek/fejezet#definiciok.def-egy.allitasok.def-allitas',
  )
  assert.equal(entry.kbHref, '/hu/tudasbazis/definiciok/def-egy#allitasok.def-allitas')
})

test('kbRefs swaps in the knowledge-base href and leaves other entries alone', () => {
  const g = buildGraphFromRaw(
    raw({
      references: {
        'r-thm': ref('a tétel', 'theorems.tetel-egy'),
        'r-ext': { display: 'kifelé', target: { type: 'external', url: 'https://example.org' } },
      },
    }),
  )
  const remapped = kbRefs(def(g).references)
  assert.equal(remapped['r-thm'].href, '/hu/tudasbazis/tetelek/tetel-egy')
  assert.equal(remapped['r-ext'].href, def(g).references['r-ext'].href, 'no kbHref means unchanged')
  assert.equal(
    def(g).references['r-thm'].href,
    '/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy',
    'the original map must not be mutated',
  )
})

// ---------------------------------------------------------------------------
// Backlink index
// ---------------------------------------------------------------------------

/**
 * A graph whose sources exercise every branch of the index: the chapter cites the
 * definition twice, its section cites a CLAIM of it, one theorem cites a TERM of
 * it, and a second, UNPUBLISHED chapter contributes a section source and (through
 * the theorem it embeds) an entity source. The last two are what a deployed build
 * has to drop.
 */
function backlinkFixture() {
  const data = raw()
  const chapter = data.books[0].parts[0].chapters[0]
  chapter.references = {
    'r-def': ref('a definíció', 'definitions.def-egy'),
    'r-def-ujra': ref('ugyanaz újra', 'definitions.def-egy'),
  }
  chapter.sections[0].references = {
    'r-claim': ref('az állítás', 'definitions.def-egy.claims.def-claim'),
  }
  data.theorems[0].references = {
    'r-term': ref('a fogalom', 'definitions.def-egy.terms.first-term'),
  }
  data.theorems.push({
    ...hu,
    name: 'tetel-ketto',
    slug: 'tetel-ketto',
    title: 'Második tétel',
    body: [narrative('Tétel.')],
    references: { 'r-def': ref('a definíció', 'definitions.def-egy') },
    proofSlugs: [],
    remarkSlugs: [],
  })
  data.books[0].parts[0].chapters.push({
    name: 'masodik',
    slug: 'masodik',
    locale: 'hu',
    title: 'Második fejezet',
    publishedAt: undefined,
    abstract: [],
    prologue: [],
    epilogue: [],
    references: {},
    sections: [
      {
        name: 'masodik-szakasz',
        slug: 'masodik-szakasz',
        locale: 'hu',
        title: 'Második szakasz',
        references: { 'r-def': ref('a definíció', 'definitions.def-egy') },
        body: [embed('theorems.tetel-ketto')],
      },
    ],
  })
  return data
}

/**
 * The graph module as a DEPLOYED build evaluates it.
 *
 * `SITE_ENV` gates page existence and is read once, when the graph module is
 * evaluated, so this needs a second instance of that module: a query string makes
 * a distinct module URL and therefore a fresh evaluation, leaving the statically
 * imported instance above with its local-build behaviour. Every export a test
 * reaches for must come from THIS instance — a graph built here and read with the
 * statically imported `kbPageExists` would answer with local-build rules.
 */
async function deployedModule() {
  const before = process.env.SITE_ENV
  process.env.SITE_ENV = 'staging'
  try {
    const staging = await import('../lib/content/graph.ts?env=staging')
    return staging.default ?? staging
  } finally {
    if (before === undefined) delete process.env.SITE_ENV
    else process.env.SITE_ENV = before
  }
}

/** The same fixture built as a deployed build sees it. */
async function deployedGraph(data) {
  return (await deployedModule()).buildGraphFromRaw(data)
}

/**
 * The tree flattened depth-first: one entry per row, `[kind, fqn, count, depth]`.
 *
 * Depth-first is the order the panel renders in, so an expectation written this way
 * reads as the list a reader would see, indents included.
 */
const rowsOf = (list, depth = 0) =>
  list.flatMap((r) => [[r.kind, r.fqn, r.count, depth], ...rowsOf(r.children, depth + 1)])

/** Every node of a tree, whatever its depth. */
const nodesOf = (list) => list.flatMap((r) => [r, ...nodesOf(r.children)])

test('backlinks group every source of one entity by where in the book it is', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  const b = g.backlinks.get('definitions.def-egy')
  // Chapter, then its sections, then the entities embedded in them. The fixture's
  // theorems are embedded in the two sections, so neither is a top-level row: the
  // first chapter cites the definition twice itself and holds a section that cites
  // it once and a theorem that cites it once, which is 4; the second chapter cites
  // nothing itself and is here only because what it contains does.
  assert.deepEqual(rowsOf(b.all), [
    ['chapter', 'books.konyv.chapters.fejezet', 4, 0],
    ['section', 'books.konyv.chapters.fejezet.sections.szakasz', 2, 1],
    ['theorem', 'theorems.tetel-egy', 1, 2],
    ['chapter', 'books.konyv.chapters.masodik', 2, 0],
    ['section', 'books.konyv.chapters.masodik.sections.masodik-szakasz', 2, 1],
    ['theorem', 'theorems.tetel-ketto', 1, 2],
  ])
})

test('a count is never less than the counts nested under it', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  const b = g.backlinks.get('definitions.def-egy')
  // The accumulation rule, as an invariant over every node rather than as the two
  // numbers above: a container speaks for everything under it, so its count is its
  // children's total plus whatever its own narrative added.
  for (const node of nodesOf(b.all)) {
    const nested = node.children.reduce((total, child) => total + child.count, 0)
    assert.ok(node.count >= nested, `${node.fqn} counts ${node.count} over ${nested} nested`)
    assert.ok(
      node.children.every((child, i) => i === 0 || node.children[i - 1].count >= child.count),
      `${node.fqn}'s children are not ordered by count`,
    )
  }
  assert.ok(
    b.all.every((row, i) => i === 0 || b.all[i - 1].count >= row.count),
    'the top level is ordered by count, highest first',
  )
})

test('a reference to a claim or a term is a reference to the entity that owns it', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  const b = g.backlinks.get('definitions.def-egy')
  // Neither the claim nor the term has a page, so both land under the definition —
  // and `byTarget`, keyed by the FULL target name, narrows the same list to each.
  // The narrowed lists are grouped too, so the one section that cites the claim is
  // still shown inside the chapter it belongs to.
  assert.deepEqual(rowsOf(b.byTarget.get('definitions.def-egy.claims.def-claim')), [
    ['chapter', 'books.konyv.chapters.fejezet', 1, 0],
    ['section', 'books.konyv.chapters.fejezet.sections.szakasz', 1, 1],
  ])
  assert.deepEqual(rowsOf(b.byTarget.get('definitions.def-egy.terms.first-term')), [
    ['chapter', 'books.konyv.chapters.fejezet', 1, 0],
    ['section', 'books.konyv.chapters.fejezet.sections.szakasz', 1, 1],
    ['theorem', 'theorems.tetel-egy', 1, 2],
  ])
  // The entity's own name is a target like any other, not the whole list. Both
  // chapters count 2 here, and the tie goes to the title in Hungarian collation.
  assert.deepEqual(rowsOf(b.byTarget.get('definitions.def-egy')), [
    ['chapter', 'books.konyv.chapters.fejezet', 2, 0],
    ['chapter', 'books.konyv.chapters.masodik', 2, 0],
    ['section', 'books.konyv.chapters.masodik.sections.masodik-szakasz', 2, 1],
    ['theorem', 'theorems.tetel-ketto', 1, 2],
  ])
  assert.equal(b.byTarget.size, 3)
})

test('a backlink row links to the source: an entity page, a chapter, or a section anchor', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  const byFqn = new Map(nodesOf(g.backlinks.get('definitions.def-egy').all).map((r) => [r.fqn, r]))
  const shapeOf = (fqn) => {
    const { children, ...row } = byFqn.get(fqn)
    return row
  }
  // `label` is the row's first line and `title` is what its level is ordered by, so
  // both are on every row: the numbers cannot be the tie-breaker ("1.10." sorts
  // before "1.9."), and the title alone is not what the reader is shown.
  assert.deepEqual(shapeOf('books.konyv.chapters.fejezet'), {
    kind: 'chapter',
    fqn: 'books.konyv.chapters.fejezet',
    title: 'Fejezet',
    label: '1. Fejezet',
    href: '/hu/konyvek/konyv/fejezetek/fejezet',
    count: 4,
  })
  assert.deepEqual(shapeOf('books.konyv.chapters.fejezet.sections.szakasz'), {
    kind: 'section',
    fqn: 'books.konyv.chapters.fejezet.sections.szakasz',
    title: 'Szakasz',
    label: '1.1. Szakasz',
    href: `/hu/konyvek/konyv/fejezetek/fejezet#${sectionAnchorId({ slug: 'szakasz', locale: 'hu' })}`,
    count: 2,
  })
  assert.deepEqual(shapeOf('theorems.tetel-egy'), {
    kind: 'theorem',
    fqn: 'theorems.tetel-egy',
    title: 'Első tétel',
    label: '1.2. Tétel: Első tétel',
    href: '/hu/tudasbazis/tetelek/tetel-egy',
    count: 1,
  })
})

/** The same fixture, with the proof and two remarks citing the definition as well. */
function ownedSourceFixture() {
  const data = backlinkFixture()
  const citesTheDefinition = { 'r-def': ref('a definíció', 'definitions.def-egy') }
  data.proofs[0].references = citesTheDefinition
  data.proofs[0].remarkSlugs = ['rem-ketto']
  data.remarks[0].references = citesTheDefinition
  data.remarks.push({
    ...hu,
    name: 'rem-ketto',
    body: [narrative('Megjegyzés a bizonyításhoz.')],
    references: citesTheDefinition,
  })
  data.books[0].parts[0].chapters[0].sections[0].body.push(
    embed('theorems.tetel-egy.proofs.biz-egy.remarks.rem-ketto'),
  )
  return data
}

test('a proof or a remark row names the definition or theorem its page belongs to', () => {
  const g = buildGraphFromRaw(ownedSourceFixture())
  const byFqn = new Map(nodesOf(g.backlinks.get('definitions.def-egy').all).map((r) => [r.fqn, r]))
  const linesOf = (fqn) => {
    const row = byFqn.get(fqn)
    return [row.label, row.ownership]
  }
  // A proof's own name is "Bizonyítás", which names nothing: what the reader
  // recognizes is the numbered theorem, and the second line says which of the things
  // hanging off it this row leads to.
  assert.deepEqual(linesOf('theorems.tetel-egy.proofs.biz-egy'), [
    '1.2. Tétel: Első tétel',
    'bizonyítás',
  ])
  assert.deepEqual(linesOf('definitions.def-egy.remarks.rem-egy'), [
    '1.1. Definíció: Első definíció',
    'megjegyzés',
  ])
  // Two steps down the chain, and the whole chain is on the line: the row leads to
  // the remark, whose page is one of the theorem's.
  assert.deepEqual(linesOf('theorems.tetel-egy.proofs.biz-egy.remarks.rem-ketto'), [
    '1.2. Tétel: Első tétel',
    'bizonyítás → megjegyzés',
  ])
  // …and a definition or a theorem has no second line at all, rather than an empty
  // one: it IS the top of its chain.
  assert.deepEqual(linesOf('theorems.tetel-egy'), ['1.2. Tétel: Első tétel', undefined])
  assert.equal('ownership' in byFqn.get('theorems.tetel-egy'), false)
})

test('a container earns a row even though it cites nothing itself', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  const b = g.backlinks.get('definitions.def-egy')
  // The second chapter's own narrative has no reference to the definition at all —
  // the section inside it and the theorem embedded in that section are what cite it.
  // A reader asking where the definition is used still wants to be told the chapter.
  const second = b.all.find((row) => row.fqn === 'books.konyv.chapters.masodik')
  assert.equal(second.count, 2)
  assert.deepEqual(
    second.children.map((c) => c.fqn),
    ['books.konyv.chapters.masodik.sections.masodik-szakasz'],
  )
})

test('an entity with no incoming reference has no entry at all', () => {
  const g = buildGraphFromRaw(backlinkFixture())
  assert.equal(g.backlinks.has('theorems.tetel-egy'), false)
})

test('a source whose page this build does not generate is dropped', async () => {
  const g = await deployedGraph(backlinkFixture())
  const b = g.backlinks.get('definitions.def-egy')
  // Both sources inside the unpublished chapter go, and the chapter they were
  // grouped under goes with them: the theorem's own page is not generated at all,
  // and the section's anchor lives in a chapter body that a deployed build replaces
  // with a stub.
  assert.deepEqual(rowsOf(b.all), [
    ['chapter', 'books.konyv.chapters.fejezet', 4, 0],
    ['section', 'books.konyv.chapters.fejezet.sections.szakasz', 2, 1],
    ['theorem', 'theorems.tetel-egy', 1, 2],
  ])
  assert.deepEqual(rowsOf(b.byTarget.get('definitions.def-egy')), [
    ['chapter', 'books.konyv.chapters.fejezet', 2, 0],
  ])
})

// ---------------------------------------------------------------------------
// The ownership chain (sub-plan §6.1, second table in §6.5)
// ---------------------------------------------------------------------------

/**
 * The shared fixture with a second and a third proof on its theorem, both embedded
 * in the same section so both have a page.
 *
 * The content has no such theorem — 190 theorems with exactly one proof, one with
 * none (measured) — and that is the case the design turns on: a menu item had to
 * pick one proof, a list does not (D4). So it is built here rather than waited for.
 */
function rawWithThreeProofs() {
  const data = raw()
  data.theorems[0].proofSlugs = ['biz-egy', 'biz-ketto', 'biz-harom']
  for (const name of ['biz-ketto', 'biz-harom']) {
    data.proofs.push({ ...hu, name, body: [narrative('Bizonyítás.')], references: {}, remarkSlugs: [] })
    data.books[0].parts[0].chapters[0].sections[0].body.push(embed(`theorems.tetel-egy.proofs.${name}`))
  }
  return data
}

const namesOf = (nodes) => nodes.map((n) => n.name)

test('a theorem owns its proofs and its remarks, and has no parent', () => {
  const g = buildGraphFromRaw(raw())
  const o = kbOwnership(g, thm(g))
  assert.equal(o.parent, undefined, 'a theorem is the top of its chain')
  assert.deepEqual(namesOf(o.proofs), ['biz-egy'])
  assert.deepEqual(namesOf(o.remarks), [])
})

test('a theorem with three proofs owns all three, in authored order', () => {
  const g = buildGraphFromRaw(rawWithThreeProofs())
  // The point of D4: no "first one" is picked, so nothing here is length 1.
  assert.deepEqual(namesOf(kbOwnership(g, thm(g)).proofs), ['biz-egy', 'biz-ketto', 'biz-harom'])
})

test('a definition owns its remarks and nothing else', () => {
  const g = buildGraphFromRaw(raw())
  const o = kbOwnership(g, def(g))
  assert.equal(o.parent, undefined)
  assert.deepEqual(namesOf(o.proofs), [])
  assert.deepEqual(namesOf(o.remarks), ['rem-egy'])
})

test('a proof links up to its theorem and down to its own remarks', () => {
  const g = buildGraphFromRaw(raw())
  const o = kbOwnership(g, prf(g))
  assert.equal(o.parent, thm(g))
  assert.deepEqual(namesOf(o.proofs), [])
  assert.deepEqual(namesOf(o.remarks), [])
})

test('a remark owns nothing, so its chain is the one link up to its owner', () => {
  const g = buildGraphFromRaw(raw())
  const o = kbOwnership(g, rem(g))
  assert.equal(o.parent, def(g))
  assert.deepEqual(namesOf(o.proofs), [])
  assert.deepEqual(namesOf(o.remarks), [])
})

test('a child whose page this build does not generate is dropped, not linked', async () => {
  // The unpublished chapter takes the whole chain's pages with it on a deployed
  // build, so this asserts the filter from both ends: no parent, no children.
  const { buildGraphFromRaw: build, kbOwnership: ownership } = await deployedModule()
  const g = build(raw({ published: false }))
  assert.deepEqual(namesOf(ownership(g, thm(g)).proofs), [], 'the proof has no page on staging')
  assert.equal(ownership(g, prf(g)).parent, undefined, 'nor does the theorem above it')
  assert.equal(ownership(g, rem(g)).parent, undefined)
  // Locally the same fixture keeps every link, which is what makes the drop a
  // filter rather than a missing relation.
  const local = buildGraphFromRaw(raw({ published: false }))
  assert.deepEqual(namesOf(kbOwnership(local, thm(local)).proofs), ['biz-egy'])
})

test('the glossary points at the page-relative term anchor of the owner\'s page', () => {
  // The glossary links to a term on the node's OWN page, so the node drops out of
  // the anchor path: `#fogalmak.{slug}`, not `#definiciok.{d}.fogalmak.{slug}`.
  // That distinction is the whole point of an anchor being page-relative, and the
  // glossary is now the only place in the graph that depends on it besides kbHref.
  const g = buildGraphFromRaw(raw())
  assert.equal(g.glossary.length, 1)
  const row = g.glossary[0]
  const d = def(g)
  assert.equal(row.termKey, 'first-term')
  assert.equal(row.canonical, 'első fogalom')
  assert.equal(
    row.href,
    `${urlForDefinition(d)}#${termAnchorId(ownPageScope(d), 'first-term', d.terms['first-term'])}`,
  )
  assert.equal(row.href, '/hu/tudasbazis/definiciok/def-egy#fogalmak.elso-fogalom')
  // The chapter-context form must NOT be what the glossary links to.
  assert.ok(!row.href.includes('definiciok.def-egy.fogalmak'))
})
test('the same term key defined by two nodes yields two glossary rows', () => {
  const data = raw()
  data.theorems[0].terms = {
    'first-term': { slug: 'elso-fogalom', display: '[első]', canonical: 'első fogalom' },
  }
  data.theorems[0].body = [{ type: 'narrative', content: 'Tétel [[first-term]].' }]
  const g = buildGraphFromRaw(data)
  assert.equal(g.glossary.length, 2, 'one row per (defining node, term key)')
  assert.deepEqual(
    g.glossary.map((e) => e.ownerName).sort(),
    ['def-egy', 'tetel-egy'],
    'both defining nodes are listed, so a duplicated term is visible rather than hidden',
  )
})

test('a glossary row carries the term\'s synonyms, and an empty list when there are none', () => {
  // The synonyms are authored on the term, not on the row: one row per (owner, term
  // key) either way. A term without them must still expose an array, so a caller
  // can iterate without a guard.
  const data = raw({
    terms: {
      'first-term': {
        slug: 'elso-fogalom',
        display: '[első]',
        canonical: 'első fogalom',
        synonyms: ['elsődleges fogalom', 'egyes fogalom'],
      },
      'second-term': { slug: 'masodik-fogalom', display: '[második]', canonical: 'második fogalom' },
    },
  })
  data.definitions[0].body = [narrative('Törzs [[first-term]] és [[second-term]].')]
  const g = buildGraphFromRaw(data)
  assert.equal(g.glossary.length, 2, 'still one row per (owner, term key)')
  const byKey = new Map(g.glossary.map((e) => [e.termKey, e]))
  assert.deepEqual(byKey.get('first-term').synonyms, ['elsődleges fogalom', 'egyes fogalom'])
  assert.deepEqual(byKey.get('second-term').synonyms, [], 'no synonyms authored -> empty list')
})

test('an anchor slug is used verbatim; a missing one falls back to the name', () => {
  const data = raw({ terms: { 'no-slug-term': { display: '[x]', canonical: 'nincs slug' } } })
  data.definitions[0].body = [
    { type: 'narrative', content: 'Törzs [[no-slug-term]].' },
    { type: 'claim', name: 'unslugged-claim', content: 'Állítás.' },
  ]
  const g = buildGraphFromRaw(data)
  assert.equal(g.glossary[0].href, '/hu/tudasbazis/definiciok/def-egy#fogalmak.no-slug-term')
})

test('two definitions sharing a slug fail the build', () => {
  const data = raw({
    extraDefinitions: [
      { ...hu, name: 'masik', slug: 'def-egy', title: 'Másik', body: [], references: {}, remarkSlugs: [] },
    ],
  })
  assert.throws(() => buildGraphFromRaw(data), /Identifier collision/)
})

test('two claims on one node sharing a slug fail the build', () => {
  const data = raw()
  data.definitions[0].body = [
    { type: 'claim', name: 'a', slug: 'ugyanaz', content: 'A.' },
    { type: 'claim', name: 'b', slug: 'ugyanaz', content: 'B.' },
  ]
  data.definitions[0].terms = {}
  assert.throws(() => buildGraphFromRaw(data), /Identifier collision/)
})

test('a reference to a node embedded nowhere fails the build', () => {
  const data = raw({
    references: { 'r-arva': ref('árva', 'definitions.arva') },
    extraDefinitions: [
      { ...hu, name: 'arva', slug: 'arva', title: 'Árva', body: [], references: {}, remarkSlugs: [] },
    ],
  })
  assert.throws(() => buildGraphFromRaw(data), /embedded in no chapter/)
})

test('an anchor is the localized dotted path of the node, rooted at its own type', () => {
  const g = buildGraphFromRaw(raw())
  const d = def(g)
  assert.equal(kbAnchorPath(d), 'definiciok.def-egy')
  assert.equal(kbAnchorPath(thm(g)), 'tetelek.tetel-egy')
  // An owned type carries its owner's path, exactly as its URL does.
  assert.equal(kbAnchorPath(prf(g)), 'tetelek.tetel-egy.bizonyitasok.1')
  assert.equal(kbAnchorPath(rem(g)), 'definiciok.def-egy.megjegyzesek.1')
  assert.equal(sectionAnchorId({ slug: 'szakasz', locale: 'hu' }), 'szakaszok.szakasz')
  assert.equal(partAnchorId({ slug: 'resz', locale: 'hu' }), 'reszek.resz')
})

test('a claim/term anchor is page-relative: the page node drops out of the path', () => {
  const g = buildGraphFromRaw(raw())
  const d = def(g)
  const claim = { name: 'def-claim', slug: 'def-allitas' }
  assert.equal(claimAnchorId(embeddedScope(d), claim), 'definiciok.def-egy.allitasok.def-allitas')
  assert.equal(claimAnchorId(ownPageScope(d), claim), 'allitasok.def-allitas')
  assert.equal(
    termAnchorId(embeddedScope(d), 'first-term', d.terms['first-term']),
    'definiciok.def-egy.fogalmak.elso-fogalom',
  )
  assert.equal(termAnchorId(ownPageScope(d), 'first-term', d.terms['first-term']), 'fogalmak.elso-fogalom')
})

test('every anchor segment is localized — no English container name survives', () => {
  const g = buildGraphFromRaw(raw())
  const d = def(g)
  const anchors = [
    kbAnchorPath(d), kbAnchorPath(thm(g)), kbAnchorPath(prf(g)), kbAnchorPath(rem(g)),
    claimAnchorId(embeddedScope(d), { name: 'x' }),
    termAnchorId(embeddedScope(d), 'y', {}),
    sectionAnchorId({ slug: 's', locale: 'hu' }),
    partAnchorId({ slug: 'p', locale: 'hu' }),
  ]
  for (const id of anchors) {
    for (const segment of id.split('.').filter((_, i) => i % 2 === 0)) {
      assert.ok(
        !/^(definitions?|theorems?|proofs?|remarks?|claims?|terms?|sections?|parts?)$/.test(segment),
        `${id} contains the English segment '${segment}'`,
      )
    }
  }
})

test('an unknown locale fails loudly rather than emitting a bare anchor', () => {
  assert.throws(() => sectionAnchorId({ slug: 's', locale: 'xx' }), /Unknown locale/)
})

// ---------------------------------------------------------------------------
// Indexed addresses for the owned types
// ---------------------------------------------------------------------------
//
// A proof and a remark are addressed by their position in the list of the node that
// owns them, so every case below needs a list with more than one entry — which the
// content has nowhere (190 theorems with exactly one proof, 72 nodes with exactly
// one remark, measured). Today's content therefore exercises the number 1 and
// nothing else, and these fixtures are the only place the design is put under the
// load it was chosen for.

/** The shared fixture with two remarks on its proof, both embedded so both exist. */
function rawWithTwoRemarksOnTheProof() {
  const data = raw()
  data.proofs[0].remarkSlugs = ['rem-biz-egy', 'rem-biz-ketto']
  for (const name of ['rem-biz-egy', 'rem-biz-ketto']) {
    data.remarks.push({ ...hu, name, body: [narrative('Megjegyzés.')], references: {} })
    data.books[0].parts[0].chapters[0].sections[0].body.push(
      embed(`theorems.tetel-egy.proofs.biz-egy.remarks.${name}`),
    )
  }
  return data
}

/**
 * The shared fixture with a second proof listed FIRST and embedded in a chapter that
 * is not published, so a deployed build generates a page for the second entry of the
 * list and not for the first.
 */
function rawWithUnpublishedFirstProof() {
  const data = raw()
  data.theorems[0].proofSlugs = ['biz-ketto', 'biz-egy']
  data.proofs.push({
    ...hu,
    name: 'biz-ketto',
    body: [narrative('Másik bizonyítás.')],
    references: {},
    remarkSlugs: [],
  })
  data.books[0].parts[0].chapters.push({
    name: 'masodik',
    slug: 'masodik',
    locale: 'hu',
    title: 'Második fejezet',
    publishedAt: undefined,
    abstract: [],
    prologue: [],
    epilogue: [],
    references: {},
    sections: [
      {
        name: 'masodik-szakasz',
        slug: 'masodik-szakasz',
        locale: 'hu',
        title: 'Második szakasz',
        references: {},
        body: [embed('theorems.tetel-egy.proofs.biz-ketto')],
      },
    ],
  })
  return data
}

test('the proofs of one theorem are addressed 1, 2, 3 — in the URL and in the anchor', () => {
  const g = buildGraphFromRaw(rawWithThreeProofs())
  const proofs = thm(g).proofs
  assert.deepEqual(proofs.map((p) => kbOwnedIndex(p)), [1, 2, 3])
  assert.deepEqual(proofs.map((p) => urlForProof(p)), [
    '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1',
    '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/2',
    '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/3',
  ])
  assert.deepEqual(proofs.map((p) => kbAnchorPath(p)), [
    'tetelek.tetel-egy.bizonyitasok.1',
    'tetelek.tetel-egy.bizonyitasok.2',
    'tetelek.tetel-egy.bizonyitasok.3',
  ])
})

test("a remark of a proof carries both positions: its owner's and its own", () => {
  const g = buildGraphFromRaw(rawWithTwoRemarksOnTheProof())
  const second = prf(g).remarks[1]
  assert.equal(
    urlForRemark(second),
    '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1/megjegyzesek/2',
  )
  assert.equal(kbAnchorPath(second), 'tetelek.tetel-egy.bizonyitasok.1.megjegyzesek.2')
})

test('an unpublished first sibling keeps its place, so the visible proof is still the second', async () => {
  // The index counts the authored list, not the built one: publishing the missing
  // chapter later must not renumber a page that was already live, and a link the
  // reader can see must not disagree with the address it points at.
  const { buildGraphFromRaw: build, kbOwnership: ownership } = await deployedModule()
  const g = build(rawWithUnpublishedFirstProof())
  const visible = ownership(g, thm(g)).proofs
  assert.deepEqual(visible.map((p) => p.name), ['biz-egy'], 'only the published proof is linkable')
  assert.equal(kbOwnedIndex(visible[0]), 2)
  assert.equal(urlForProof(visible[0]), '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/2')
})

test('an index segment addresses one node, and every other spelling addresses none', () => {
  // One spelling per address: a padded, signed, fractional or zero-based segment is
  // not a second way to reach the page, it is a 404. The segment comes off the
  // address bar, so none of these is hypothetical.
  const g = buildGraphFromRaw(rawWithThreeProofs())
  const proofs = thm(g).proofs
  assert.equal(kbNodeAtIndex(proofs, '2'), proofs[1])
  for (const segment of ['0', '01', '4', '1.0', '-1', '+1', ' 1', '1a', '', undefined]) {
    assert.equal(kbNodeAtIndex(proofs, segment), undefined, `'${segment}' must address nothing`)
  }
})

test('an owner-less remark has no position, so its anchor keeps its name', () => {
  const data = raw()
  data.remarks.push({
    ...hu,
    name: 'rem-arva',
    body: [narrative('Megjegyzés.')],
    references: {},
  })
  const g = buildGraphFromRaw(data)
  const orphan = [...g.remarks.values()].find((r) => r.name === 'rem-arva')
  assert.equal(orphan.attachedTo, undefined)
  assert.equal(kbOwnedIndex(orphan), null)
  assert.equal(urlForRemark(orphan), null)
  assert.equal(kbAnchorPath(orphan), 'megjegyzesek.rem-arva')
})
