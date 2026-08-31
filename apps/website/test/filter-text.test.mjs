// The matching predicate behind the knowledge-base list filters (ListFilter).
//
// The component itself is DOM work — it toggles `hidden` on rows it did not create
// — but which rows it hides is this pure function, and that is the part worth
// pinning down: accent- and case-insensitive, LaTeX-tolerant, and "nothing typed"
// meaning the whole list rather than none of it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as filterTextModule from '../lib/utils/filter-text.ts'

const { filterTextMatches, normaliseFilterText } = filterTextModule.default ?? filterTextModule

test('matches a substring anywhere in the row text', () => {
  assert.equal(filterTextMatches('természetes számok összeadása', 'számok'), true)
  assert.equal(filterTextMatches('természetes számok összeadása', 'összead'), true)
  assert.equal(filterTextMatches('természetes számok összeadása', 'gyűrű'), false)
})

test('an empty or whitespace-only query matches everything', () => {
  // The filter narrows a list that is already rendered: "nothing typed" can never
  // mean "no rows".
  assert.equal(filterTextMatches('bármi', ''), true)
  assert.equal(filterTextMatches('bármi', '   '), true)
})

test('accents and case do not have to be typed', () => {
  assert.equal(filterTextMatches('Euler-féle függvény', 'fuggveny'), true)
  assert.equal(filterTextMatches('Euler-féle függvény', 'EULER'), true)
  assert.equal(filterTextMatches('gyűrű', 'gyuru'), true)
  assert.equal(filterTextMatches('kettős tagadás', 'kettos'), true)
})

test('a query with accents still finds the row it came from', () => {
  // The normalisation is applied to BOTH sides, so pasting the name back in works.
  assert.equal(filterTextMatches('Euler-féle függvény', 'féle függvény'), true)
})

test('a name authored with inline LaTeX is matchable by what is left of it', () => {
  // The reader sees a rendered glyph, never the `$...$` source, so the delimiters
  // and the backslash must not stand between the two.
  const name = '$\\varphi$-függvény'
  assert.equal(filterTextMatches(name, 'varphi'), true)
  assert.equal(filterTextMatches(name, 'fuggveny'), true)
  assert.equal(filterTextMatches(name, '$'), true, 'a lone delimiter normalises away to the empty query')
  assert.equal(filterTextMatches('$n$ darab halmaz direkt szorzata', 'n darab'), true)
})

test('normalisation collapses whitespace so a stray double space still matches', () => {
  assert.equal(normaliseFilterText('  két   szó  '), 'ket szo')
  assert.equal(filterTextMatches('két szó', 'két  szó'), true)
})
