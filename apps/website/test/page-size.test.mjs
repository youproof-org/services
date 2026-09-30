// The postbuild size gate over exported HTML pages (check-page-size.mjs): any page
// over the limit fails.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluatePageSizes, PAGE_SIZE_LIMIT } from '../scripts/lib/page-size.mjs'

const LIMIT = 1000
const evaluate = (sizes) => evaluatePageSizes(new Map(Object.entries(sizes)), { limit: LIMIT })

test('the limit is just under the 2 MiB Ahrefs measures', () => {
  assert.equal(PAGE_SIZE_LIMIT, 1_990_000)
  assert.ok(PAGE_SIZE_LIMIT < 2 * 1024 * 1024)
})

test('pages at or under the limit pass', () => {
  assert.deepEqual(evaluate({ 'a.html': LIMIT, 'b.html': 1 }), [])
})

test('a page over the limit fails, with its size and overshoot', () => {
  const errors = evaluate({ 'a.html': LIMIT + 1, 'b.html': 10 })
  assert.deepEqual(errors, ['a.html is 1,001 bytes, over the 1,000 limit by 1.'])
})

test('oversize pages are reported largest first', () => {
  const errors = evaluate({ 'small.html': 1500, 'large.html': 9000, 'mid.html': 3000 })
  assert.deepEqual(
    errors.map((e) => e.split(' ')[0]),
    ['large.html', 'mid.html', 'small.html'],
  )
})
