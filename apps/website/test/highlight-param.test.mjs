// The arrival highlight's parameter: the one place a URL value reaches a selector
// (sub-plan §7.2, D7).
//
// D7's first condition is that the value is validated against the FQN character rule
// BEFORE it becomes a selector — strictly `[a-z0-9-]` segments joined by dots, and
// anything else rejected outright rather than escaped. This file is that condition,
// written as a test: every hostile shape below is a value someone can type into the
// address bar, and every one of them has to be turned away by `isTargetFqn` and, if a
// caller forgot to ask, by `highlightSelector` itself.
//
// The browser half is `e2e/kb-highlight.test.ts`, which arrives at a real page with a
// crafted parameter and finds nothing marked and nothing thrown.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  HIGHLIGHT_PARAM,
  TARGET_ATTR,
  highlightSelector,
  isTargetFqn,
  urlWithHighlight,
} from '../lib/kb/highlight.ts'

/**
 * Real fully qualified names, read out of the local export's own `data-target-fqn`
 * values — one per leaf kind that actually appears there, all eleven of them, plus
 * the longest of the 651 distinct values, at 155 characters.
 *
 * `grep -rho 'data-target-fqn="[^"]*"' out | sort -u` is where they come from; the
 * leaf-kind tally over that list is terms 197, theorems 119, claims 118, sections 97,
 * definitions 57, chapters 24, remarks 21, proofs 9, pages 4, articles 4, books 1.
 * There is no `parts.` target in the content, which is why `InlineText` has no branch
 * for one.
 */
const REAL = [
  'definitions.antiszimmetrikus-relacio',
  'theorems.abszolutertek-euklideszi-norma',
  'definitions.antiszimmetrikus-relacio.terms.antisymmetric-relation',
  'definitions.euklideszi-gyuru.claims.euclidean-division-can-be-performed',
  'theorems.bezout-lemma.proofs.bezout-lemma-bizonyitas',
  'definitions.asszocialt.remarks.asszocialt-megjegyzes',
  'books.alice-es-bob',
  'books.alice-es-bob.chapters.alice-bob-es-a-kinaiak',
  'books.alice-es-bob.chapters.alice-bob-es-a-kinaiak.sections.a-kinai-maradektetel',
  'articles.a-megalazott-geniusz',
  'pages.adatkezeles',
  'theorems.peano-nullosszeg-tagjai.proofs.peano-nullosszeg-tagjai-bizonyitas' +
    '.remarks.peano-nullosszeg-tagjai-bizonyitas-megjegyzes.terms.reductio-ad-absurdum',
]

test('every shape of a real fully qualified name is accepted', () => {
  for (const fqn of REAL) {
    assert.equal(isTargetFqn(fqn), true, fqn)
  }
})

test('a single segment is accepted, and digits and hyphens are ordinary characters', () => {
  // Not an FQN the content produces — the grammar pairs a container with a name — but
  // the character rule is the whole of what D7 asks for here, and the selector it
  // builds simply matches nothing.
  assert.equal(isTargetFqn('definitions'), true)
  assert.equal(isTargetFqn('theorems.tetel-2-b'), true)
  assert.equal(isTargetFqn('a'), true)
})

/**
 * Everything that must be rejected, named by what it is.
 *
 * The first group is what an attacker would try — the characters that end an attribute
 * selector or open a new clause; the second is malformed FQNs, which must be turned
 * away for the same reason even though they are harmless.
 */
const HOSTILE = {
  'a double quote closing the attribute selector': 'definitions.x"',
  'a quote plus an injected clause': 'x"], [data-target-fqn^="',
  'a single quote': "definitions.x'",
  'a square bracket': 'definitions.x]',
  'an opening bracket': 'definitions.[x',
  'a universal selector': '*',
  'a selector with a universal clause': 'definitions.x"], *, [x="',
  'a descendant combinator': 'definitions.x span',
  'a class selector': '.term',
  'an id selector': '#kb-panel',
  'a comma': 'definitions.x,definitions.y',
  'a colon and a pseudo-class': 'definitions.x:has(script)',
  'a backslash escape': 'definitions.x\\"',
  'a parenthesis': 'definitions.x)',
  'a space': 'definitions gyuru-test',
  'a tab': 'definitions.\tx',
  'a newline': 'definitions.x\n',
  'a carriage return and a linefeed': 'definitions.x\r\n[y]',
  'a leading space': ' definitions.x',
  'a trailing space': 'definitions.x ',
  'a percent-encoded quote, decoded': decodeURIComponent('definitions.x%22'),
  'a percent-encoded bracket, decoded': decodeURIComponent('definitions.x%5D'),
  'a literal percent escape that was never decoded': 'definitions.x%22',
  'a bare percent sign': 'definitions.100%',
  'unicode: an accented Hungarian name': 'definitions.gyűrű-test',
  'unicode: a homoglyph for a Latin a': 'definitions.аbc',
  'unicode: a zero-width space': 'definitions.x​y',
  'unicode: an emoji': 'definitions.🙂',
  'uppercase': 'Definitions.Gyuru-Test',
  'an underscore': 'definitions.gyuru_test',
  'a slash': 'definitions/gyuru-test',
  'an angle bracket': 'definitions.<script>',
  'an ampersand': 'definitions.x&y',
  'an empty value': '',
  'an empty segment': 'definitions..gyuru-test',
  'two empty segments': 'a...b',
  'a leading dot': '.definitions.gyuru-test',
  'a trailing dot': 'definitions.gyuru-test.',
  'a lone dot': '.',
  // Both are made only of legal characters, so the length cap is the whole of what
  // turns them away — and it turns them away before the value is looked at rather
  // than searching for a 10 KB name and not finding it.
  'a very long value, otherwise legal': `definitions.${'x'.repeat(600)}`,
  'a very long value of legal segments': Array.from({ length: 400 }, () => 'ab').join('.'),
}

test('every hostile value is rejected', () => {
  for (const [what, value] of Object.entries(HOSTILE)) {
    assert.equal(isTargetFqn(value), false, `accepted ${what}: ${JSON.stringify(value)}`)
  }
})

test('the selector builder rejects too, rather than escaping', () => {
  // The point of the throw: a caller that forgot to validate gets a crash, not a
  // selector built out of a URL. Nothing in the app relies on it — both callers check
  // first — which is exactly why it has to be asserted here.
  for (const [what, value] of Object.entries(HOSTILE)) {
    assert.throws(
      () => highlightSelector(value),
      /is not a fully qualified name/,
      `built a selector for ${what}: ${JSON.stringify(value)}`,
    )
  }
})

test('the selector matches the name itself and anything inside it, on a segment boundary', () => {
  const selector = highlightSelector('definitions.gyuru-test')
  assert.equal(
    selector,
    `[${TARGET_ATTR}="definitions.gyuru-test"], [${TARGET_ATTR}^="definitions.gyuru-test."]`,
  )
  // The prefix clause is what makes the unfiltered list work: §7.2's "all incoming
  // means all" puts references aimed at the entity's terms and claims in the entity's
  // own list, and those carry a longer name than the entity does. The trailing dot is
  // what keeps `definitions.gyuru` from matching `definitions.gyuru-test`.
  assert.match(selector, /\^="definitions\.gyuru-test\."/)
  assert.equal(highlightSelector('definitions.gyuru').includes('definitions.gyuru-test'), false)
})

test('the URL a followed row leads to is its own href plus the one parameter', () => {
  const base = 'https://youproof.org/hu/tudasbazis/definiciok/gyuru-test'
  const href = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele#szakaszok.oszthatosag'
  assert.equal(
    urlWithHighlight(href, 'definitions.gyuru-test', base),
    'https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele' +
      `?${HIGHLIGHT_PARAM}=definitions.gyuru-test#szakaszok.oszthatosag`,
  )
})

test('the fragment and any existing query survive, and the FQN is not escaped', () => {
  const base = 'https://youproof.org/hu/tudasbazis/definiciok/gyuru-test'
  // No row carries a query today, but the parameter is appended to whatever is there
  // rather than replacing it — the same care the other two scrubbers take.
  assert.equal(
    urlWithHighlight('/hu/x?a=1#b', 'definitions.gyuru-test', base),
    `https://youproof.org/hu/x?a=1&${HIGHLIGHT_PARAM}=definitions.gyuru-test#b`,
  )
  // Dots and hyphens are not escaped by URLSearchParams, so the address bar shows the
  // fully qualified name as it is written — which matters only because it is what the
  // arrival reads back.
  assert.equal(
    urlWithHighlight('/hu/x', 'definitions.gyuru-test.terms.gyuru', base).endsWith(
      'definitions.gyuru-test.terms.gyuru',
    ),
    true,
  )
})

test('what the parameter carries round-trips through a URL', () => {
  // The two halves put together: what `urlWithHighlight` writes is what a
  // `URLSearchParams` read hands back, and it is still a valid target.
  for (const fqn of REAL) {
    const url = new URL(urlWithHighlight('/hu/x#y', fqn, 'https://youproof.org/hu/z'))
    const read = url.searchParams.get(HIGHLIGHT_PARAM)
    assert.equal(read, fqn)
    assert.equal(isTargetFqn(read), true)
    assert.equal(url.hash, '#y')
  }
})
