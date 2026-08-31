// The three knowledge-base section cards, derived once for the knowledge-base root
// page and the homepage entry block.
//
// The cards are what both places advertise about the knowledge base, so what is
// pinned here is that a card's number is the number of pages a reader can actually
// reach: `kbSectionCards` counts through `kbPageExists`, and the glossary's number is
// the row count the glossary page lists rather than the count of terms.
//
// This file runs under LOCAL build rules (no `SITE_ENV`); the deployed rules, where
// an unpublished chapter takes its nodes' pages with it, are in
// kb-sections-deployed.test.mjs — `SITE_ENV` is read once per process, when the graph
// module is evaluated, so the two cannot share one.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as sectionsModule from '../lib/content/kb-sections.ts'
import * as graphModule from '../lib/content/graph.ts'

const { kbSectionCards } = sectionsModule.default ?? sectionsModule
const { buildGraphFromRaw } = graphModule.default ?? graphModule

import { hu, narrative, raw } from './support/raw-graph.mjs'

/** A definition no chapter embeds, and which therefore has no page. */
const unembedded = {
  ...hu,
  name: 'def-beagyazatlan',
  slug: 'def-beagyazatlan',
  title: 'Beágyazatlan definíció',
  terms: {},
  body: [narrative('Törzs.')],
  references: {},
  remarkSlugs: [],
}

const cardsOf = (data) => kbSectionCards(buildGraphFromRaw(data), 'hu')

// ---------------------------------------------------------------------------

test('three cards, in the order the reader meets them, each linking to its own index', () => {
  assert.deepEqual(
    cardsOf(raw()).map((c) => [c.nameKey, c.href]),
    [
      ['definitionsIndex', '/hu/tudasbazis/definiciok'],
      ['theoremsIndex', '/hu/tudasbazis/tetelek'],
      ['glossary', '/hu/tudasbazis/fogalmak'],
    ],
  )
})

test("a card's count is the dictionary's sentence with the number in it", () => {
  // The number belongs to the code and the wording around it to locales.json, so
  // what a card carries is the formatted label, not a bare integer.
  assert.deepEqual(
    cardsOf(raw()).map((c) => c.count),
    ['1 definíció', '1 tétel', '1 fogalom'],
  )
})

test('a node with no page is not counted, so no card can name a page it cannot link to', () => {
  const cards = cardsOf(raw({ extraDefinitions: [unembedded] }))
  assert.equal(cards[0].count, '1 definíció', 'the unembedded definition is not advertised')
})

test('locally an unpublished chapter still counts: its nodes do have pages', () => {
  // The 84/191 side of the local-vs-deployed difference. A draft chapter renders
  // normally on a local build, so its definitions and theorems are reachable.
  const cards = cardsOf(raw({ published: false }))
  assert.deepEqual(cards.slice(0, 2).map((c) => c.count), ['1 definíció', '1 tétel'])
})

test("the glossary's number is its ROWS, not its terms — synonyms are names too", () => {
  // The glossary page is an index of names, so a term with two synonyms is three of
  // them. Counting terms here would put a number on the card that the page the card
  // links to visibly contradicts.
  const cards = cardsOf(
    raw({
      terms: {
        'first-term': {
          slug: 'elso-fogalom',
          display: '[első]',
          canonical: 'első fogalom',
          synonyms: ['másik név', 'harmadik név'],
        },
      },
    }),
  )
  assert.equal(cards[2].count, '3 fogalom')
})
