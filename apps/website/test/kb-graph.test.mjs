// Knowledge-base graph derivation: page existence, slug validation, the backlink
// index, the glossary, and the two-href reference resolution.
//
// Everything is driven through `buildGraphFromRaw` with a hand-built raw graph, so
// these are real graph invariants rather than assertions about a fixture on disk.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as graphModule from '../lib/content/graph.ts'
import { urlForDefinition, urlForTheorem, urlForProof, urlForRemark, kbRefs, claimAnchorId, termAnchorId, kbAnchorPath, sectionAnchorId, partAnchorId, ownPageScope, embeddedScope } from '../lib/content/urls.ts'

const { buildGraphFromRaw, kbPageExists, kbNodeTitle } = graphModule.default ?? graphModule

import { NS, hu, narrative, claim, embed, raw } from './support/raw-graph.mjs'

const def = (g) => g.definitions.get(`/entities${NS}/def-egy`)
const thm = (g) => g.theorems.get(`/entities${NS}/tetel-egy`)
const prf = (g) => g.proofs.get(`/entities${NS}/biz-egy`)
const rem = (g) => g.remarks.get(`/entities${NS}/rem-egy`)

// ---------------------------------------------------------------------------

test('URLs are flat for definitions/theorems and nested for owned types', () => {
  const g = buildGraphFromRaw(raw())
  assert.equal(urlForDefinition(def(g)), '/hu/tudasbazis/definiciok/def-egy')
  assert.equal(urlForTheorem(thm(g)), '/hu/tudasbazis/tetelek/tetel-egy')
  assert.equal(urlForProof(prf(g)), '/hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/biz-egy')
  assert.equal(urlForRemark(rem(g)), '/hu/tudasbazis/definiciok/def-egy/megjegyzesek/rem-egy')
})

test('a URL does not contain the namespace, so reorganizing namespaces cannot move it', () => {
  const g = buildGraphFromRaw(raw())
  for (const url of [urlForDefinition(def(g)), urlForTheorem(thm(g)), urlForProof(prf(g))]) {
    assert.ok(!url.includes('proba'), `${url} leaks its namespace`)
  }
})

test('embedding records the chapter, the section and the index label', () => {
  const g = buildGraphFromRaw(raw())
  const e = g.embedding.get(`/entities${NS}/def-egy`)
  assert.equal(e.chapter.name, 'fejezet')
  assert.equal(e.section.name, 'szakasz')
  assert.equal(e.index, '1.1.', 'definitions and theorems are numbered in embed order')
  assert.equal(g.embedding.get(`/entities${NS}/biz-egy`).index, undefined, 'proofs are not numbered')
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
  assert.equal(kbPageExists(g, g.definitions.get(`/entities${NS}/arva`)), false)
})

test('titles: authored for definitions/theorems, derived from the owner otherwise', () => {
  const g = buildGraphFromRaw(raw())
  assert.equal(kbNodeTitle(g, def(g)), 'Első definíció')
  assert.equal(kbNodeTitle(g, thm(g)), 'Első tétel')
  assert.equal(kbNodeTitle(g, prf(g)), 'Bizonyítás: Első tétel')
  assert.equal(kbNodeTitle(g, rem(g)), 'Megjegyzés: Első definíció')
})

test('a reference gets a chapter href AND a knowledge-base href', () => {
  const g = buildGraphFromRaw(
    raw({
      references: {
        'r-thm': { display: 'a tétel', target: { type: 'theorem', name: 'tetel-egy', namespace: NS } },
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
        'r-claim': {
          display: 'az állítás',
          target: {
            type: 'claim',
            name: 'def-claim',
            parent: { type: 'definition', name: 'def-egy', namespace: NS },
          },
        },
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
        'r-thm': { display: 'a tétel', target: { type: 'theorem', name: 'tetel-egy', namespace: NS } },
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

test('two proofs of DIFFERENT theorems may share a slug', () => {
  const data = raw()
  data.theorems.push({
    ...hu, name: 'tetel-ketto', slug: 'tetel-ketto', title: 'Második tétel',
    body: [], references: {}, proofSlugs: ['biz-ketto'], remarkSlugs: [],
  })
  data.proofs.push({ ...hu, name: 'biz-ketto', slug: 'biz-egy', body: [], references: {}, remarkSlugs: [] })
  data.books[0].parts[0].chapters[0].sections[0].body.push(
    embed('theorem', 'tetel-ketto'),
    embed('proof', 'biz-ketto'),
  )
  const g = buildGraphFromRaw(data)
  assert.equal(urlForProof(g.proofs.get(`/entities${NS}/biz-ketto`)), '/hu/tudasbazis/tetelek/tetel-ketto/bizonyitasok/biz-egy')
})

test('a reference to a node embedded nowhere fails the build', () => {
  const data = raw({
    references: { 'r-arva': { display: 'árva', target: { type: 'definition', name: 'arva', namespace: NS } } },
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
  assert.equal(kbAnchorPath(prf(g)), 'tetelek.tetel-egy.bizonyitasok.biz-egy')
  assert.equal(kbAnchorPath(rem(g)), 'definiciok.def-egy.megjegyzesek.rem-egy')
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
