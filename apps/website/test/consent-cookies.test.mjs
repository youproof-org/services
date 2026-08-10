import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  cookieDomainCandidates,
  deleteCookieString,
  gaCookieClearStrings,
  hasGaCookies,
  parseCookieHeader,
  parseGaDebugParam,
  serializeCookie,
} from '../lib/consent/cookies.ts'

test('parses a multi-cookie header', () => {
  const parsed = parseCookieHeader('a=1; b=2;   c=3')
  assert.deepEqual([...parsed], [['a', '1'], ['b', '2'], ['c', '3']])
})

test('parses an empty or absent header as no cookies', () => {
  for (const input of ['', null, undefined, ';', ' ; ']) {
    assert.equal(parseCookieHeader(input).size, 0)
  }
})

test('keeps "=" inside a cookie value', () => {
  // Base64 padding and percent-encoded JSON both produce these.
  assert.equal(parseCookieHeader('t=YWJj==; x=1').get('t'), 'YWJj==')
})

test('percent-decodes values, and survives a malformed sequence', () => {
  assert.equal(parseCookieHeader('r=%7B%22d%22%3A%22granted%22%7D').get('r'), '{"d":"granted"}')
  // A lone % would throw from decodeURIComponent; the raw value comes back
  // instead so the record parser can reject it.
  assert.equal(parseCookieHeader('r=100%').get('r'), '100%')
})

test('ignores nameless or valueless fragments', () => {
  const parsed = parseCookieHeader('=novalue; justname; ok=1')
  assert.deepEqual([...parsed], [['ok', '1']])
})

test('serializes with the attributes the consent cookie needs', () => {
  assert.equal(
    serializeCookie({ name: 'yp_consent', value: '{"d":"granted"}', maxAgeSec: 31536000, secure: true }),
    'yp_consent=%7B%22d%22%3A%22granted%22%7D; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
  )
})

test('omits Secure when not on https', () => {
  // next dev serves plain http; a Secure cookie would be dropped there, so the
  // banner would return on every reload.
  const cookie = serializeCookie({ name: 'x', value: '1', maxAgeSec: 60, secure: false })
  assert.ok(!cookie.includes('Secure'), cookie)
  assert.ok(cookie.includes('SameSite=Lax'))
})

test('deletes by way of Max-Age=0', () => {
  assert.equal(deleteCookieString('yp_consent', false), 'yp_consent=; Path=/; Max-Age=0; SameSite=Lax')
})

test('derives domain candidates broadest-last, stopping at two labels', () => {
  assert.deepEqual(cookieDomainCandidates('youproof.org'), ['youproof.org'])
  assert.deepEqual(cookieDomainCandidates('staging.youproof.org'), [
    'staging.youproof.org',
    'youproof.org',
  ])
  // Nothing to scope to: host-only deletion is all that applies.
  assert.deepEqual(cookieDomainCandidates('localhost'), [])
  assert.deepEqual(cookieDomainCandidates(''), [])
})

test('clears both GA cookies host-only and per domain candidate', () => {
  const strings = gaCookieClearStrings('staging.youproof.org', 'G-ABC123', true)
  // _ga and _ga_ABC123, each host-only plus two domain candidates.
  assert.equal(strings.length, 6)
  assert.ok(strings.every((s) => s.includes('Max-Age=0')))
  assert.ok(strings.some((s) => s.startsWith('_ga=') && !s.includes('Domain=')))
  assert.ok(strings.some((s) => s.startsWith('_ga_ABC123=') && s.endsWith('Domain=youproof.org')))
  // The G- prefix belongs to the measurement ID, not the cookie name.
  assert.ok(!strings.some((s) => s.includes('_ga_G-')))
})

test('clears only _ga when no measurement ID is configured', () => {
  const strings = gaCookieClearStrings('youproof.org', '', false)
  assert.equal(strings.length, 2)
  assert.ok(strings.every((s) => s.startsWith('_ga=')))
})

test('detects GA cookies that outlived the consent that created them', () => {
  // The case that motivated this: yp_consent deleted by hand, _ga left behind.
  assert.equal(hasGaCookies('_ga=GA1.1.123.456'), true)
  assert.equal(hasGaCookies('_ga_ABC123=GS1.1.x'), true)
  assert.equal(hasGaCookies('yp_consent=x; _ga_ABC123=GS1.1.x; other=1'), true)
})

test('does not mistake other cookies for GA cookies', () => {
  for (const header of ['', null, undefined, 'yp_consent=x', 'yp_ga_exclude=1', 'my_gap=1']) {
    assert.equal(hasGaCookies(header), false, `should not match ${JSON.stringify(header)}`)
  }
})

test('reads the ga_debug switch, both directions', () => {
  assert.equal(parseGaDebugParam('?ga_debug=exclude'), 'exclude')
  assert.equal(parseGaDebugParam('?ga_debug=include'), 'include')
  assert.equal(parseGaDebugParam('?a=1&ga_debug=exclude&b=2'), 'exclude')
})

test('ignores an absent or unrecognised ga_debug value', () => {
  for (const input of ['', null, undefined, '?ga_debug=', '?ga_debug=yes', '?other=exclude']) {
    assert.equal(parseGaDebugParam(input), null, `should ignore ${JSON.stringify(input)}`)
  }
})
