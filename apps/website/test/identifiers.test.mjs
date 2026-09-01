// Identifier rules for the whole content model: the character rule, and the
// uniqueness scope for names and slugs across books, parts, chapters, sections,
// standalone items, namespaces and the knowledge base.
//
// Each rule is tested from BOTH sides. A uniqueness rule with only a negative test
// is indistinguishable from a stricter rule that happens to also reject the case
// you wrote down — and several of these scopes are deliberately narrow (two
// sections in different chapters may share a name; a definition and a theorem may
// share a slug). The positive tests are what pin that narrowness, so a later
// "tightening" of the validator fails here instead of silently outlawing content.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as graphModule from '../lib/content/graph.ts'
import { NS, hu, ref, narrative, embed, raw } from './support/raw-graph.mjs'

const { buildGraphFromRaw } = graphModule.default ?? graphModule

const build = (data) => buildGraphFromRaw(data)
const chapterOf = (data) => data.books[0].parts[0].chapters[0]
const partOf = (data) => data.books[0].parts[0]

/** A second, self-contained book — for the cross-book positive cases. */
function secondBook(data, { bookSlug = 'masik-konyv', chapterSlug = 'fejezet-ketto' } = {}) {
  data.episodeOrder.push('masik-konyv')
  data.books.push({
    name: 'masik-konyv',
    slug: bookSlug,
    locale: 'hu',
    title: 'Másik könyv',
    abstract: [],
    parts: [
      {
        name: 'masik-resz',
        slug: 'masik-resz',
        locale: 'hu',
        title: 'Másik rész',
        chapters: [
          {
            name: 'fejezet-ketto',
            slug: chapterSlug,
            locale: 'hu',
            title: 'Második fejezet',
            publishedAt: '2020-01-01 00:00:00',
            abstract: [],
            prologue: [],
            epilogue: [],
            references: {},
            sections: [],
          },
        ],
      },
    ],
  })
  return data.books[1].parts[0].chapters[0]
}

// ---------------------------------------------------------------------------
// The character rule
// ---------------------------------------------------------------------------

test('a dot in a name fails the build — it would split the reference grammar', () => {
  const data = raw()
  data.definitions[0].name = 'def.egy'
  assert.throws(() => build(data), /Invalid name 'def\.egy'/)
})

test('a dot in a slug fails the build — it would split the anchor grammar', () => {
  const data = raw()
  data.definitions[0].slug = 'def.egy'
  assert.throws(() => build(data), /Invalid slug 'def\.egy'/)
})

test('uppercase in a name fails the build, even for a mathematical symbol', () => {
  const data = raw()
  chapterOf(data).sections[0].name = 'muvelet-az-N-halmazon'
  assert.throws(() => build(data), /Invalid name 'muvelet-az-N-halmazon'/)
})

test('the character rule reaches claim names and term keys, not just node names', () => {
  const withClaim = raw()
  withClaim.definitions[0].body = [{ type: 'claim', name: 'Bad.Name', slug: 'jo', content: 'A.' }]
  assert.throws(() => build(withClaim), /Invalid name 'Bad\.Name'/)

  const withTerm = raw({ terms: { 'complement-in-A': { slug: 'komplementer', canonical: 'k' } } })
  withTerm.definitions[0].body = [narrative('Törzs.')]
  assert.throws(() => build(withTerm), /Invalid name 'complement-in-A'/)
})

test('a missing slug fails the build rather than producing "#undefined"', () => {
  const data = raw()
  delete partOf(data).slug
  assert.throws(() => build(data), /part resz has no slug/)
})

// ---------------------------------------------------------------------------
// Book hierarchy — uniqueness
// ---------------------------------------------------------------------------

test('two chapters in the SAME book sharing a slug fail, even across different parts', () => {
  // The part is flattened out of a chapter URL, so two chapters in different parts
  // of one book still collide. This is the case a part-scoped check would miss.
  const data = raw()
  data.books[0].parts.push({
    name: 'resz-ketto',
    slug: 'resz-ketto',
    locale: 'hu',
    title: 'Második rész',
    chapters: [
      {
        name: 'fejezet-ketto',
        slug: 'fejezet', // same slug as the chapter in part one
        locale: 'hu',
        title: 'Második fejezet',
        publishedAt: '2020-01-01 00:00:00',
        abstract: [], prologue: [], epilogue: [], references: {}, sections: [],
      },
    ],
  })
  assert.throws(() => build(data), /Identifier collision: 'fejezet'.*book 'konyv' chapters/s)
})

test('two chapters in DIFFERENT books may share a slug — the book segment disambiguates', () => {
  const data = raw()
  secondBook(data, { chapterSlug: 'fejezet' })
  const g = build(data)
  assert.equal(g.chapters.size, 2)
})

test('two parts in the same book sharing a slug fail', () => {
  const data = raw()
  data.books[0].parts.push({
    name: 'resz-ketto', slug: 'resz', locale: 'hu', title: 'Második rész', chapters: [],
  })
  assert.throws(() => build(data), /Identifier collision: 'resz'.*book 'konyv' parts/s)
})

test('two sections in the same chapter sharing a slug fail — duplicate in-page anchor', () => {
  const data = raw()
  chapterOf(data).sections.push({
    name: 'szakasz-ketto', slug: 'szakasz', locale: 'hu', title: 'Második szakasz',
    references: {}, body: [],
  })
  assert.throws(() => build(data), /Identifier collision: 'szakasz'.*chapter 'fejezet' sections/s)
})

test('two sections in DIFFERENT chapters may share a name AND a slug', () => {
  // Real content does this: `hol-tartunk-most` exists in two chapters. The anchor
  // is page-scoped, so nothing collides.
  const data = raw()
  const other = secondBook(data)
  other.sections.push({
    name: 'szakasz', slug: 'szakasz', locale: 'hu', title: 'Szakasz', references: {}, body: [],
  })
  const g = build(data)
  assert.equal(g.sections.size, 2)
})

// ---------------------------------------------------------------------------
// Standalone items
// ---------------------------------------------------------------------------

const standalone = (kind, name, slug, extra = {}) => ({
  kind, name, slug, locale: 'hu', title: name,
  abstract: [], prologue: [], epilogue: [], sections: [], references: {}, ...extra,
})

test('two articles sharing a slug fail — same URL', () => {
  const data = raw()
  data.standalones = [standalone('article', 'egy', 'ugyanaz'), standalone('article', 'ketto', 'ugyanaz')]
  assert.throws(() => build(data), /Identifier collision: 'ugyanaz'.*all articles/s)
})

test('an article and a newsletter may share a slug — different container segments', () => {
  const data = raw()
  data.standalones = [standalone('article', 'egy', 'ugyanaz'), standalone('newsletter', 'ketto', 'ugyanaz')]
  const g = build(data)
  assert.equal(g.articles.size, 1)
  assert.equal(g.newsletters.size, 1)
})

test('a page slug equal to a container segment fails — it sits at the locale root', () => {
  const data = raw()
  data.standalones = [standalone('page', 'utkozo', 'konyvek')]
  assert.throws(() => build(data), /collides with a container segment/)
})

test('the container-segment guard covers anchor-only segments too', () => {
  // `fogalmak` is the glossary URL segment and the term anchor segment; a page
  // slugged that way would shadow the glossary.
  const data = raw()
  data.standalones = [standalone('page', 'utkozo', 'fogalmak')]
  assert.throws(() => build(data), /collides with a container segment/)
})

test('an ordinary page slug is accepted', () => {
  const data = raw()
  data.standalones = [standalone('page', 'impresszum', 'impresszum')]
  const g = build(data)
  assert.equal(g.pages.size, 1)
})

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

test('a definition and a theorem may share a name and a slug', () => {
  const data = raw()
  data.theorems.push({
    ...hu, name: 'def-egy', slug: 'def-egy', title: 'Ütköző tétel',
    body: [], references: {}, proofSlugs: [], remarkSlugs: [],
  })
  chapterOf(data).sections[0].body.push(embed('theorems.def-egy'))
  const g = build(data)
  assert.ok(g.definitions.has('definitions.def-egy'))
  assert.equal(g.theorems.size, 2)
})

test('two remarks on the same owner sharing a slug fail', () => {
  const data = raw()
  data.definitions[0].remarkSlugs = ['rem-egy', 'rem-ketto']
  data.remarks.push({
    ...hu, name: 'rem-ketto', slug: 'rem-egy', body: [narrative('M.')], references: {},
  })
  chapterOf(data).sections[0].body.push(embed('definitions.def-egy.remarks.rem-ketto'))
  assert.throws(() => build(data), /Identifier collision: 'rem-egy'.*remarks of definition 'def-egy'/s)
})

test('a claim and a term on one node MAY share a slug — distinct anchor segments', () => {
  // This is a deliberate relaxation: before the anchor grammar nested them under
  // `allitasok.`/`fogalmak.`, both were flat and shared one per-node namespace.
  const data = raw({ terms: { 'a-term': { slug: 'ugyanaz', canonical: 'ugyanaz' } } })
  data.definitions[0].body = [
    narrative('Törzs [[a-term]].'),
    { type: 'claim', name: 'egy-allitas', slug: 'ugyanaz', content: 'A.' },
  ]
  const g = build(data)
  const node = g.definitions.get('definitions.def-egy')
  assert.equal(node.terms['a-term'].slug, 'ugyanaz')
})

test('two claims on one node sharing a NAME fail, not just a slug', () => {
  // The name is what a cross-reference resolves against, so a duplicate makes the
  // reference ambiguous even when the slugs differ.
  const data = raw({ terms: {} })
  data.definitions[0].body = [
    { type: 'claim', name: 'ugyanaz', slug: 'egy', content: 'A.' },
    { type: 'claim', name: 'ugyanaz', slug: 'ketto', content: 'B.' },
  ]
  assert.throws(() => build(data), /Identifier collision: 'ugyanaz'.*within claims of definition def-egy/s)
})

test('a claim block inside a proof fails the build', () => {
  const data = raw()
  data.proofs[0].body = [narrative('Bizonyítás.'), { type: 'claim', name: 'allitas', slug: 'a', content: 'A.' }]
  assert.throws(() => build(data), /contains a claim block/)
})

test('a term on a proof is accepted — the asymmetry with claims is deliberate', () => {
  const data = raw()
  data.proofs[0].terms = { 'proof-term': { slug: 'bizonyitas-fogalom', canonical: 'fogalom' } }
  data.proofs[0].body = [narrative('Bizonyítás [[proof-term]].')]
  const g = build(data)
  assert.equal(g.proofs.get('theorems.tetel-egy.proofs.biz-egy').terms['proof-term'].slug, 'bizonyitas-fogalom')
})

test('a namespace path segment must satisfy the character rule', () => {
  const data = raw()
  for (const list of [data.definitions, data.theorems, data.proofs, data.remarks]) {
    for (const n of list) n.namespace = '/Proba'
  }
  for (const b of chapterOf(data).sections[0].body) {
    if (b.type === 'embed') b.target.namespace = '/Proba'
  }
  assert.throws(() => build(data), /Invalid name 'Proba'/)
})

// ---------------------------------------------------------------------------
// The part model
// ---------------------------------------------------------------------------

test('a part carries slug and locale through to the graph', () => {
  const g = build(raw())
  const part = g.parts.get('books.konyv.parts.resz')
  assert.equal(part.slug, 'resz')
  assert.equal(part.locale, 'hu')
})

// ---------------------------------------------------------------------------
// Authored ownership lists
// ---------------------------------------------------------------------------
//
// A `proofs:` / `remarks:` entry is the only thing that attaches a child to its
// parent, and every way of getting one wrong is silent during wiring. The positive
// cases matter as much as the negative ones here: the scope is deliberately global
// per child type (one file, one owner), and nothing about it may start rejecting a
// parent that legitimately owns several children.

test('a theorem listing a proof no file answers to fails, naming the parent and the entry', () => {
  const data = raw()
  data.theorems[0].proofSlugs = ['biz-egy', 'biz-hianyzik']
  assert.throws(
    () => build(data),
    /theorem tetel-egy lists 'biz-hianyzik' as proofs entry 2.*no proof of that name was loaded/s,
  )
})

test('a definition listing a remark no file answers to fails', () => {
  const data = raw()
  data.definitions[0].remarkSlugs = ['rem-egy', 'rem-hianyzik']
  assert.throws(
    () => build(data),
    /definition def-egy lists 'rem-hianyzik' as remarks entry 2.*no remark of that name was loaded/s,
  )
})

test('a proof listing a remark no file answers to fails — a proof is a parent too', () => {
  const data = raw()
  data.proofs[0].remarkSlugs = ['rem-hianyzik']
  assert.throws(() => build(data), /proof biz-egy lists 'rem-hianyzik' as remarks entry 1/)
})

test('two theorems listing the same proof fail — one file cannot have two owners', () => {
  // Wiring keeps the last claimant, so the other theorem's list silently loses the
  // proof; the collision has to be reported instead of the losing entry looking
  // like a missing file.
  const data = raw()
  data.theorems.push({
    ...hu,
    name: 'tetel-ketto',
    slug: 'tetel-ketto',
    title: 'Második tétel',
    body: [narrative('Tétel.')],
    references: {},
    proofSlugs: ['biz-egy'],
    remarkSlugs: [],
  })
  chapterOf(data).sections[0].body.push(embed('theorems.tetel-ketto'))
  assert.throws(
    () => build(data),
    /Identifier collision: 'biz-egy'.*theorem tetel-egy \(proofs entry 1\).*theorem tetel-ketto \(proofs entry 1\).*within proof ownership/s,
  )
})

test('a definition and a theorem listing the same remark fail — one ownership scope', () => {
  const data = raw()
  data.theorems[0].remarkSlugs = ['rem-egy']
  assert.throws(
    () => build(data),
    /Identifier collision: 'rem-egy'.*definition def-egy.*theorem tetel-egy.*within remark ownership/s,
  )
})

test('a parent listing one child twice fails — the entry number tells the two apart', () => {
  const data = raw()
  data.theorems[0].proofSlugs = ['biz-egy', 'biz-egy']
  assert.throws(
    () => build(data),
    /Identifier collision: 'biz-egy'.*theorem tetel-egy \(proofs entry 1\).*theorem tetel-egy \(proofs entry 2\)/s,
  )
})

test('a theorem may list two proofs — both attach, in the authored order', () => {
  const data = raw()
  data.theorems[0].proofSlugs = ['biz-egy', 'biz-ketto']
  data.proofs.push({
    ...hu,
    name: 'biz-ketto',
    slug: 'biz-ketto',
    body: [narrative('Másik bizonyítás.')],
    references: {},
    remarkSlugs: [],
  })
  chapterOf(data).sections[0].body.push(embed('theorems.tetel-egy.proofs.biz-ketto'))
  const g = build(data)
  assert.deepEqual(
    g.theorems.get('theorems.tetel-egy').proofs.map(p => p.name),
    ['biz-egy', 'biz-ketto'],
  )
})

test('two parents may each own a remark, as long as they are different remarks', () => {
  const data = raw()
  data.proofs[0].remarkSlugs = ['rem-ketto']
  data.remarks.push({
    ...hu,
    name: 'rem-ketto',
    slug: 'rem-ketto',
    body: [narrative('Megjegyzés.')],
    references: {},
  })
  const g = build(data)
  assert.deepEqual(
    g.definitions.get('definitions.def-egy').remarks.map(r => r.name),
    ['rem-egy'],
  )
  assert.deepEqual(
    g.proofs.get('theorems.tetel-egy.proofs.biz-egy').remarks.map(r => r.name),
    ['rem-ketto'],
  )
})
