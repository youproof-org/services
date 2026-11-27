// The helpers for reading inline markup the way the website renders it: the
// entities it decodes first and where it counts a sentence as starting.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { atSentenceStart, decodeInlineEntities, inlineTokens, placedInlineTokens, renderedReferences } from '../src/index'

test('the authored entities decode to their characters, a non-breaking space to a plain one', () => {
  assert.equal(decodeInlineEntities('1&ndash;2 &amp; a&nbsp;b &#x2663;'), '1–2 & a b ♣')
  assert.equal(decodeInlineEntities('&mdash; &lt;'), '&mdash; &lt;')
})

test('a token starts a sentence at the start of the text or after a sentence end', () => {
  assert.equal(atSentenceStart('[0] x', 0), true)
  assert.equal(atSentenceStart('  [0] x', 2), true)
  assert.equal(atSentenceStart('Lásd. [0]', 6), true)
  assert.equal(atSentenceStart('Igen! \n[0]', 7), true)
  assert.equal(atSentenceStart('Miért? [0]', 7), true)
  assert.equal(atSentenceStart('lásd [0]', 5), false)
  assert.equal(atSentenceStart('lásd: [0]', 6), false)
})

test('sentence starts are counted on the decoded text', () => {
  const text = decodeInlineEntities('Vége.&nbsp;[0]')
  const [ref] = inlineTokens(text)
  assert.equal(atSentenceStart(text, ref.start), true)
})

test('the start of a text that does not start a sentence is not a sentence start, but a sentence end in it still is', () => {
  assert.equal(atSentenceStart('[0] x', 0, false), false)
  assert.equal(atSentenceStart('  [0] x', 2, false), false)
  assert.equal(atSentenceStart('Lásd. [0]', 6, false), true)
  assert.equal(atSentenceStart('lásd [0]', 5, true), false)
})

const placed = (text: string) =>
  [...renderedReferences(text)].map(({ token, start, sentenceStart }) => [token.kind === 'ref' ? token.index : token.kind, start, sentenceStart])

test('a reference at the start of a bold run starts a sentence only when the run does', () => {
  assert.deepEqual(placed('Ha $n$ ***[0] x***, akkor'), [[0, 10, false]])
  assert.deepEqual(placed('***[0] x***, akkor'), [[0, 3, true]])
  assert.deepEqual(placed('Vége. **[0] x**'), [[0, 8, true]])
  assert.deepEqual(placed('lásd **x. [0]** és **[1]**'), [[0, 10, true], [1, 21, false]])
})

test('the rule applies to a figure\'s [*] too, and a name token is found where a reference is', () => {
  assert.deepEqual(placed('Ezt mutatja **[*]**. [*] és [regi]'), [['self-ref', 14, false], ['self-ref', 21, true], ['legacy-ref', 28, false]])
})

test('the tokens of a text carry the sentence start of the text they are read from', () => {
  const tokens = [...placedInlineTokens('**[0]** és [1]. [2]', false)]
  assert.deepEqual(tokens.map(({ source, sentenceStart }) => [source, sentenceStart]), [['**[0]**', false], ['[1]', false], ['[2]', true]])
})
