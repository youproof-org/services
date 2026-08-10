import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildRecord,
  parseRecord,
  resolveDecision,
  serializeRecord,
} from '../lib/consent/record.ts'
import { CLOCK_SKEW_TOLERANCE_MS, CONSENT_MAX_AGE_MS } from '../lib/consent/policy.ts'

const NOW = Date.parse('2026-08-10T12:00:00.000Z')
const CURRENT = 2

/** A record `ageMs` old, at version `v`. */
function aged(decision, ageMs, v = CURRENT) {
  return { d: decision, t: new Date(NOW - ageMs).toISOString(), v }
}

test('round-trips a record through serialize/parse', () => {
  const record = buildRecord('granted', NOW, 3)
  assert.deepEqual(parseRecord(serializeRecord(record)), record)
})

test('buildRecord stamps an ISO-8601 UTC instant', () => {
  assert.equal(buildRecord('denied', NOW, 1).t, '2026-08-10T12:00:00.000Z')
})

test('parseRecord rejects anything it cannot trust', () => {
  const bad = [
    [null, 'absent'],
    [undefined, 'undefined'],
    ['', 'empty string'],
    ['not json', 'malformed JSON'],
    ['[]', 'array'],
    ['"granted"', 'bare string'],
    ['null', 'JSON null'],
    ['{"t":"2026-08-10T12:00:00Z","v":1}', 'missing decision'],
    ['{"d":"maybe","t":"2026-08-10T12:00:00Z","v":1}', 'unknown decision'],
    ['{"d":"granted","v":1}', 'missing timestamp'],
    ['{"d":"granted","t":"not a date","v":1}', 'unparseable timestamp'],
    ['{"d":"granted","t":"2026-08-10T12:00:00Z"}', 'missing version'],
    ['{"d":"granted","t":"2026-08-10T12:00:00Z","v":"1"}', 'version as string'],
    ['{"d":"granted","t":"2026-08-10T12:00:00Z","v":1.5}', 'fractional version'],
    // 0 is the "content not promoted" sentinel and must never be persisted.
    ['{"d":"granted","t":"2026-08-10T12:00:00Z","v":0}', 'version 0'],
  ]
  for (const [raw, why] of bad) {
    assert.equal(parseRecord(raw), null, `should reject ${why}`)
  }
})

test('honours a current-version decision', () => {
  assert.equal(resolveDecision(aged('granted', 0), NOW, CURRENT), 'granted')
  assert.equal(resolveDecision(aged('denied', 0), NOW, CURRENT), 'denied')
})

test('asks when there is no record', () => {
  assert.equal(resolveDecision(null, NOW, CURRENT), 'ask')
})

test('a stale version re-asks a grant but leaves a rejection alone', () => {
  // The asymmetry is the point: an old grant cannot cover a new purpose, but a
  // rejector has nothing running, so re-asking them is nagging.
  assert.equal(resolveDecision(aged('granted', 0, CURRENT - 1), NOW, CURRENT), 'ask')
  assert.equal(resolveDecision(aged('denied', 0, CURRENT - 1), NOW, CURRENT), 'denied')
})

test('honours a record newer than the build instead of re-asking', () => {
  // Happens when the CDN serves an older bundle, most obviously after a
  // rollback. A newer consent subsumes an older policy.
  assert.equal(resolveDecision(aged('granted', 0, CURRENT + 1), NOW, CURRENT), 'granted')
  assert.equal(resolveDecision(aged('denied', 0, CURRENT + 1), NOW, CURRENT), 'denied')
})

test('expires a record at the 12-month boundary', () => {
  assert.equal(resolveDecision(aged('granted', CONSENT_MAX_AGE_MS - 1000), NOW, CURRENT), 'granted')
  assert.equal(resolveDecision(aged('granted', CONSENT_MAX_AGE_MS + 1000), NOW, CURRENT), 'ask')
  // Expiry outranks the stale-denied rule: an ancient rejection is re-asked.
  assert.equal(resolveDecision(aged('denied', CONSENT_MAX_AGE_MS + 1000, CURRENT - 1), NOW, CURRENT), 'ask')
})

test('tolerates modest clock skew but distrusts a far-future record', () => {
  const skewed = { d: 'granted', t: new Date(NOW + CLOCK_SKEW_TOLERANCE_MS - 1000).toISOString(), v: CURRENT }
  assert.equal(resolveDecision(skewed, NOW, CURRENT), 'granted')
  const absurd = { d: 'granted', t: new Date(NOW + CLOCK_SKEW_TOLERANCE_MS + 1000).toISOString(), v: CURRENT }
  assert.equal(resolveDecision(absurd, NOW, CURRENT), 'ask')
})

test('never invents a decision when the build has no policy version', () => {
  // current < 1 means the content declaring the policy was absent at build time.
  for (const current of [0, -1, 1.5, Number.NaN]) {
    assert.equal(resolveDecision(aged('granted', 0, 1), NOW, current), 'ask')
  }
})
