// The helpers for reading inline markup the way the website renders it: the
// entities it decodes first and where it counts a sentence as starting.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { atSentenceStart, decodeInlineEntities, inlineTokens } from '../src/index'

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
