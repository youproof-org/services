// The postbuild size gate over exported HTML pages (check-page-size.mjs), and the
// semantics of its known-oversize list: listed pages over the limit only warn, a
// listed page under the limit or missing from the export fails, and any other page
// over the limit fails. Unpublished chapters are listed for a local build only,
// since a deployed build renders them as stubs.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluatePageSizes,
  KNOWN_OVERSIZE,
  KNOWN_OVERSIZE_UNPUBLISHED,
  knownOversizeFor,
  PAGE_SIZE_LIMIT,
} from '../scripts/lib/page-size.mjs'

const LIMIT = 1000
const evaluate = (sizes, knownOversize = []) =>
  evaluatePageSizes(new Map(Object.entries(sizes)), { limit: LIMIT, knownOversize })

test('the limit is just under the 2 MiB Ahrefs measures', () => {
  assert.equal(PAGE_SIZE_LIMIT, 1_990_000)
  assert.ok(PAGE_SIZE_LIMIT < 2 * 1024 * 1024)
})

test('pages at or under the limit pass', () => {
  assert.deepEqual(evaluate({ 'a.html': LIMIT, 'b.html': 1 }), { errors: [], warnings: [] })
})

test('an unlisted page over the limit fails, with its size and overshoot', () => {
  const { errors, warnings } = evaluate({ 'a.html': LIMIT + 1, 'b.html': 10 })
  assert.deepEqual(warnings, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^a\.html is 1,001 bytes, over the 1,000 limit by 1\./)
})

test('a listed page over the limit is only a warning', () => {
  const { errors, warnings } = evaluate({ 'big.html': 5000 }, ['big.html'])
  assert.deepEqual(errors, [])
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /^big\.html is 5,000 bytes/)
})

test('a listed page under the limit fails, so the list can only shrink', () => {
  const { errors, warnings } = evaluate({ 'big.html': LIMIT }, ['big.html'])
  assert.deepEqual(warnings, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /under the 1,000 limit now\. Remove it from the known-oversize list\./)
})

test('a listed page missing from the export fails', () => {
  const { errors } = evaluate({ 'a.html': 1 }, ['gone.html'])
  assert.deepEqual(errors, ['gone.html is on the known-oversize list but not in the export. Remove it from the list.'])
})

test('listing one page does not excuse another', () => {
  const { errors, warnings } = evaluate({ 'big.html': 5000, 'other.html': 2000 }, ['big.html'])
  assert.equal(warnings.length, 1)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /^other\.html/)
})

test('oversize pages are reported largest first', () => {
  const { errors } = evaluate({ 'small.html': 1500, 'large.html': 9000, 'mid.html': 3000 })
  assert.deepEqual(
    errors.map((e) => e.split(' ')[0]),
    ['large.html', 'mid.html', 'small.html'],
  )
})

test('the known-oversize lists name chapter pages, each once across both', () => {
  const every = [...KNOWN_OVERSIZE, ...KNOWN_OVERSIZE_UNPUBLISHED]
  assert.equal(new Set(every).size, every.length)
  for (const page of every) assert.match(page, /^hu\/konyvek\/[^/]+\/fejezetek\/[^/]+\.html$/)
})

test('a deployed build allows only the published chapters, a local build the unpublished ones too', () => {
  assert.deepEqual(knownOversizeFor('production'), KNOWN_OVERSIZE)
  assert.deepEqual(knownOversizeFor('staging'), KNOWN_OVERSIZE)
  for (const local of [undefined, '', 'development']) {
    assert.deepEqual(knownOversizeFor(local), [...KNOWN_OVERSIZE, ...KNOWN_OVERSIZE_UNPUBLISHED])
  }
})

test('on a deployed build, an unpublished chapter published before it is split fails', () => {
  const [unpublished] = KNOWN_OVERSIZE_UNPUBLISHED
  const sizes = new Map([...KNOWN_OVERSIZE, unpublished].map((page) => [page, PAGE_SIZE_LIMIT + 1]))
  const { errors } = evaluatePageSizes(sizes, { knownOversize: knownOversizeFor('production') })
  assert.equal(errors.length, 1)
  assert.ok(errors[0].startsWith(unpublished))
})
