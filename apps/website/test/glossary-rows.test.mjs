// The glossary page's row projection and the site's one Hungarian collation.
//
// `glossaryRows` is a pure function over `GlossaryEntry[]`, so most of this runs on
// hand-written entries; the graph-derived cases go through `buildGraphFromRaw` so
// the entries fed in are the real ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as rowsModule from '../lib/content/glossary-rows.ts'
import * as collateModule from '../lib/content/collate.ts'
import * as graphModule from '../lib/content/graph.ts'

const { glossaryRows } = rowsModule.default ?? rowsModule
const { compareHu } = collateModule.default ?? collateModule
const { buildGraphFromRaw } = graphModule.default ?? graphModule

import { raw, narrative } from './support/raw-graph.mjs'

/** A glossary entry the way `buildGlossary` emits one. */
const entry = (canonical, { synonyms = [], owner = 'def-egy', ownerTitle = 'Első definíció', termKey = canonical, href } = {}) => ({
  termKey,
  canonical,
  ownerName: owner,
  ownerTitle,
  href: href ?? `/hu/tudasbazis/definiciok/${owner}#fogalmak.${termKey}`,
  synonyms,
})

// ---------------------------------------------------------------------------

test('a term with two synonyms yields three rows: the list is an index of names', () => {
  const rows = glossaryRows([entry('gyűrű', { synonyms: ['ring', 'algebrai gyűrű'] })])
  assert.equal(rows.length, 3, 'N synonyms -> N + 1 rows')
  assert.deepEqual(
    rows.map((r) => r.name).sort(compareHu),
    ['algebrai gyűrű', 'gyűrű', 'ring'],
  )
  assert.deepEqual(
    rows.map((r) => r.isCanonical),
    rows.map((r) => r.name === 'gyűrű'),
    'exactly the canonical form is marked canonical',
  )
})

test('a term with no synonyms yields exactly one row', () => {
  const rows = glossaryRows([entry('nullelem')])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].isCanonical, true)
})

test('a synonym row names its canonical form and points at the same href', () => {
  // A synonym row sends the reader to a page titled with a different word, so the
  // row has to be able to say which term it is a name for.
  const rows = glossaryRows([entry('egységelem', { synonyms: ['neutrális elem'] })])
  const synonym = rows.find((r) => r.name === 'neutrális elem')
  const canonical = rows.find((r) => r.name === 'egységelem')
  assert.equal(synonym.canonical, 'egységelem')
  assert.equal(synonym.isCanonical, false)
  assert.equal(synonym.href, canonical.href, 'both names lead to the one defining anchor')
  assert.equal(synonym.ownerName, canonical.ownerName)
  assert.equal(synonym.termKey, canonical.termKey)
})

test('a synonym sorts under its own initial, not its canonical form\'s', () => {
  // "zenit" is a synonym of "alma": if synonyms were tucked under their canonical
  // form it would sit first. It must sort where a reader looks for it.
  const rows = glossaryRows([entry('alma', { synonyms: ['zenit'] }), entry('barack')])
  assert.deepEqual(rows.map((r) => r.name), ['alma', 'barack', 'zenit'])
})

test('á sorts among a, not after z', () => {
  const rows = glossaryRows(['zebra', 'ábel', 'alma', 'abel'].map((n) => entry(n)))
  assert.deepEqual(rows.map((r) => r.name), ['abel', 'ábel', 'alma', 'zebra'])
  assert.ok(compareHu('á', 'b') < 0, 'á before b')
  assert.ok(compareHu('á', 'z') < 0, 'á before z')
  assert.ok(compareHu('a', 'á') !== 0, 'and the two are ordered, not tied')
})

test('the collation is Hungarian, not code-point: digraphs and numbers', () => {
  assert.deepEqual(
    ['sz', 'csiga', 'cukor', 's', 'gyűrű', 'g'].sort(compareHu),
    ['cukor', 'csiga', 'g', 'gyűrű', 's', 'sz'],
    'c before cs, g before gy, s before sz',
  )
  assert.deepEqual(
    ['elem 10', 'elem 2', 'elem 1'].sort(compareHu),
    ['elem 1', 'elem 2', 'elem 10'],
    'numeric: 2 before 10',
  )
})

test('a string that is both a synonym and someone else\'s canonical form yields two distinct rows', () => {
  // 6 strings in the real content are exactly this. Neither row may swallow the
  // other, and each must keep its own destination - which is why a row is
  // identified by (owner, term key, name) and never by its name.
  const rows = glossaryRows([
    entry('nullelem', { owner: 'def-nulla', ownerTitle: 'Nullelem', termKey: 'zero-element' }),
    entry('additív egység', {
      owner: 'def-gyuru',
      ownerTitle: 'Gyűrű',
      termKey: 'additive-identity',
      synonyms: ['nullelem'],
    }),
  ])
  const both = rows.filter((r) => r.name === 'nullelem')
  assert.equal(both.length, 2, 'the same visible text on two rows')
  assert.equal(new Set(both.map((r) => r.href)).size, 2, 'pointing at different nodes')
  assert.deepEqual(both.map((r) => r.isCanonical).sort(), [false, true])
  assert.equal(
    new Set(both.map((r) => `${r.ownerName}|${r.termKey}|${r.name}`)).size,
    2,
    '(owner, term key, name) tells them apart',
  )
})

test('rows are ordered reproducibly when two names tie', () => {
  // Two nodes define the same canonical form (9 do in the real content). The sort
  // must not depend on the order the entries arrive in.
  const a = entry('inverz', { owner: 'def-a', ownerTitle: 'Alfa', termKey: 'inverse' })
  const b = entry('inverz', { owner: 'def-b', ownerTitle: 'Béta', termKey: 'inverse' })
  const forward = glossaryRows([a, b]).map((r) => r.ownerName)
  const backward = glossaryRows([b, a]).map((r) => r.ownerName)
  assert.deepEqual(forward, ['def-a', 'def-b'], 'ties broken by the owner title')
  assert.deepEqual(backward, forward)
})

test('the projection runs on the graph\'s own glossary entries', () => {
  const data = raw({
    terms: {
      'first-term': {
        slug: 'elso-fogalom',
        display: '[első]',
        canonical: 'első fogalom',
        synonyms: ['zárófogalom'],
      },
      'second-term': { slug: 'masodik-fogalom', display: '[második]', canonical: 'második fogalom' },
    },
  })
  data.definitions[0].body = [narrative('Törzs [[first-term]] és [[second-term]].')]
  const g = buildGraphFromRaw(data)
  const rows = glossaryRows(g.glossary)
  assert.equal(g.glossary.length, 2)
  assert.equal(rows.length, 3, '2 terms + 1 synonym')
  assert.deepEqual(rows.map((r) => r.name), ['első fogalom', 'második fogalom', 'zárófogalom'])
  const synonym = rows.find((r) => r.name === 'zárófogalom')
  assert.equal(synonym.href, '/hu/tudasbazis/definiciok/def-egy#fogalmak.elso-fogalom')
  assert.equal(synonym.canonical, 'első fogalom')
  assert.equal(synonym.ownerTitle, 'Első definíció')
})
