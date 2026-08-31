// The knowledge-base section cards as a DEPLOYED build counts them.
//
// `SITE_ENV` is read once, when the graph module is evaluated, and `kbSectionCards`
// reaches `kbPageExists` through its own static import of that module — so a single
// process can only ever have one of the two rule sets. Hence a file of its own,
// which the test runner executes as a separate process: it sets `SITE_ENV` before
// anything is imported, and everything it touches comes from that instance.
//
// What this pins is the 63/136-vs-84/191 difference: a card must not advertise a
// definition whose page the deployed build did not generate.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SITE_ENV = 'staging'

const { kbSectionCards } = await import('../lib/content/kb-sections.ts')
const { buildGraphFromRaw } = await import('../lib/content/graph.ts')
const { raw } = await import('./support/raw-graph.mjs')

const cardsOf = (data) => kbSectionCards(buildGraphFromRaw(data), 'hu')

// ---------------------------------------------------------------------------

test("a published chapter's nodes are counted, exactly as locally", () => {
  assert.deepEqual(
    cardsOf(raw()).map((c) => c.count),
    ['1 definíció', '1 tétel', '1 fogalom'],
  )
})

test('an unpublished chapter takes its nodes out of the counts', () => {
  // The pages do not exist on a deployed build, so the cards must not claim them.
  // The glossary keeps its row, as the glossary page does: its projection is over
  // `graph.glossary`, which the graph gates on its own terms.
  const cards = cardsOf(raw({ published: false }))
  assert.deepEqual(cards.slice(0, 2).map((c) => c.count), ['0 definíció', '0 tétel'])
})
