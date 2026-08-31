// The meta-description of a knowledge-base entity page.
//
// `kbExcerpt` is a pure function over a node's body, its references and its terms,
// so most of this runs on hand-written bodies; the last case goes through
// `buildGraphFromRaw` so the node fed in is a real one.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as excerptModule from '../lib/content/kb-excerpt.ts'
import * as graphModule from '../lib/content/graph.ts'

const { kbExcerpt } = excerptModule.default ?? excerptModule
const { buildGraphFromRaw } = graphModule.default ?? graphModule

import { raw } from './support/raw-graph.mjs'

/** A node with just the fields the excerpt reads. */
const node = (body, { references, terms } = {}) => ({
  type: 'definition',
  name: 'n',
  slug: 'n',
  locale: 'hu',
  namespace: '/proba',
  remarks: [],
  references: references ?? {},
  terms,
  body,
})

const narrative = (content) => ({ type: 'narrative', content })

// ---------------------------------------------------------------------------

test('the first narrative block, as plain text', () => {
  assert.equal(
    kbExcerpt(node([narrative('Egy egyszerű mondat.'), narrative('A második.')])),
    'Egy egyszerű mondat.',
  )
})

test('emphasis markers come out, the words stay', () => {
  assert.equal(
    kbExcerpt(node([narrative('Egy ***nagyon*** fontos **állítás**.')])),
    'Egy nagyon fontos állítás.',
  )
})

test('a reference and a term become the words they display', () => {
  const excerpt = kbExcerpt(
    node([narrative('Legyen $R$ egy [ring], amelyben van [[unit]].')], {
      references: { ring: { display: 'gyűrű', target: { type: 'external', url: 'x' } } },
      terms: { unit: { display: '[egység]', canonical: 'egység' } },
    }),
  )
  assert.equal(excerpt, 'Legyen R egy gyűrű, amelyben van egység.')
})

test('a display form is itself markup: its own math and emphasis are resolved too', () => {
  const excerpt = kbExcerpt(
    node([narrative('Tekintsük a [mod] gyűrűt.')], {
      references: {
        mod: { display: 'modulo $m$ ***maradékok***', target: { type: 'external', url: 'x' } },
      },
    }),
  )
  assert.equal(excerpt, 'Tekintsük a modulo m maradékok gyűrűt.')
})

test('an unresolved reference or term is left as authored rather than dropped', () => {
  // Nothing in the content model guarantees a ref map entry for every token, and a
  // silently deleted word would be harder to notice than a visible one.
  assert.equal(kbExcerpt(node([narrative('Egy [nincs-ilyen] token.')])), 'Egy [nincs-ilyen] token.')
})

test('math survives while it reads as text, and is dropped when it is TeX source', () => {
  assert.equal(kbExcerpt(node([narrative('Legyen $a*b$ szorzat.')])), 'Legyen a*b szorzat.')
  assert.equal(kbExcerpt(node([narrative('Legyen $\\frac{m}{d}$ a hányados.')])), 'Legyen a hányados.')
})

test('a bracket inside math is part of the formula, not a reference', () => {
  // The token order of InlineText: `$[a]_n$` matches as math, so `[a]` is never
  // looked up in the ref map — which is what stops a residue class from being
  // replaced by whatever a ref named "a" happens to display.
  const excerpt = kbExcerpt(
    node([narrative('Az $[a]_n$ maradékosztály.')], {
      references: { a: { display: 'VALAMI MÁS', target: { type: 'external', url: 'x' } } },
    }),
  )
  assert.equal(excerpt, 'Az [a]_n maradékosztály.')
})

test('HTML entities are resolved, and superscripts keep their text', () => {
  assert.equal(
    kbExcerpt(node([narrative('Egy &ndash; kettő &nbsp;&ndash; a $p$^k^ hatvány.')])),
    'Egy – kettő – a pk hatvány.',
  )
})

test("a body with no narrative block takes the first block's lead-in", () => {
  // 59 of the 537 nodes are this shape: a formula introduced by its lead-in and
  // nothing else.
  const excerpt = kbExcerpt(
    node([
      { type: 'formula', leadIn: 'Ekkor teljesül az alábbi:', content: '\\ker f' },
      narrative('Ez már a második blokk.'),
    ]),
  )
  assert.equal(excerpt, 'Ekkor teljesül az alábbi:')
})

test("a formula's content is never the excerpt, but its lead-out is", () => {
  assert.equal(
    kbExcerpt(node([{ type: 'formula', content: 'A\\sube B', leadOut: 'Azaz $A$ része $B$-nek.' }])),
    'Azaz A része B-nek.',
  )
})

test('a list, a figure and a quote contribute their prose', () => {
  assert.equal(
    kbExcerpt(node([{ type: 'ordered-list', leadIn: 'Tegyük fel:', items: ['egy', 'kettő'] }])),
    'Tegyük fel:',
  )
  assert.equal(
    kbExcerpt(node([{ type: 'figure', src: 'a.svg', caption: 'Az ábra.' }])),
    'Az ábra.',
  )
  assert.equal(kbExcerpt(node([{ type: 'quote', quote: 'Idézet.' }])), 'Idézet.')
})

test('a subsection or details wrapper is looked inside', () => {
  assert.equal(
    kbExcerpt(node([{ type: 'details', title: 'Részletek', blocks: [narrative('Belül.')] }])),
    'Belül.',
  )
})

test('a LaTeX-only block is not what a web page describes', () => {
  assert.equal(
    kbExcerpt(node([
      { ...narrative('Csak a könyvben.'), context: 'latex' },
      narrative('A weben ez.'),
    ])),
    'A weben ez.',
  )
})

test('a body with no prose at all has no excerpt', () => {
  // Then buildPageMeta falls back to the locale's default description, which is
  // still better than an empty one. No node in the content is this shape.
  assert.equal(kbExcerpt(node([{ type: 'formula', content: 'A\\sube B' }])), undefined)
  assert.equal(kbExcerpt(node([])), undefined)
})

test('a long excerpt is cut at a word boundary, with an ellipsis', () => {
  const long = `Legyen ${'szó '.repeat(60)}vége.`
  const excerpt = kbExcerpt(node([narrative(long)]))
  assert.ok(excerpt.length <= 161, `got ${excerpt.length} characters`)
  assert.ok(excerpt.endsWith('szó…'), excerpt)
  assert.ok(!excerpt.includes('  '), 'no dangling space before the ellipsis')
})

test('a short excerpt is not truncated at all', () => {
  const short = 'Rövid mondat.'
  assert.equal(kbExcerpt(node([narrative(short)])), short)
})

test('over the real graph: the definition of the fixture describes itself', () => {
  const graph = buildGraphFromRaw(raw())
  const definition = graph.definitions.get('definitions.def-egy')
  // Body: `Törzs [[first-term]].` with the term displaying `[első]`.
  assert.equal(kbExcerpt(definition), 'Törzs első.')
})
