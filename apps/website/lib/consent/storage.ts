import { deleteCookieString, parseCookieHeader, serializeCookie } from './cookies'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_MS,
  EXCLUDE_COOKIE,
  EXCLUDE_MAX_AGE_MS,
} from './policy'
import { buildRecord, parseRecord, serializeRecord } from './record'
import type { ConsentDecision, ConsentRecord } from './record'

/**
 * The only module that touches `document.cookie`. Everything it does is
 * delegated to the pure helpers in cookies.ts and record.ts — this layer exists
 * purely to read and assign, so there is nothing here worth unit-testing and
 * nothing untestable anywhere else.
 *
 * Cookies rather than localStorage, deliberately: the browser enforces the
 * 12-month expiry natively (we range-check the timestamp too), the cookie policy
 * invites readers to verify our claims in DevTools and a cookie keeps that
 * literally checkable, and the ga_debug exclusion has to be a cookie anyway — so
 * this keeps one mechanism rather than two.
 */

/**
 * A Secure cookie is silently dropped over plain http, which would make the
 * banner reappear on every reload under `next dev`. Decided per call rather than
 * baked in, so dev and production share one code path.
 */
function isSecure(): boolean {
  return window.location.protocol === 'https:'
}

export function readConsent(): ConsentRecord | null {
  return parseRecord(parseCookieHeader(document.cookie).get(CONSENT_COOKIE))
}

/** Persist a decision against the policy version it was made under. */
export function writeConsent(decision: ConsentDecision, version: number): ConsentRecord {
  const record = buildRecord(decision, Date.now(), version)
  document.cookie = serializeCookie({
    name: CONSENT_COOKIE,
    value: serializeRecord(record),
    maxAgeSec: Math.floor(CONSENT_MAX_AGE_MS / 1000),
    secure: isSecure(),
  })
  return record
}

export function readExclusion(): boolean {
  return parseCookieHeader(document.cookie).get(EXCLUDE_COOKIE) === '1'
}

/**
 * Mark (or unmark) this browser's traffic as the operator's own. Events still
 * fire — they carry `traffic_type: internal` so a GA4 data filter can exclude
 * them — because silently dropping them would make it impossible to tell a
 * working integration from a broken one while testing.
 */
export function setExclusion(on: boolean): void {
  document.cookie = on
    ? serializeCookie({
        name: EXCLUDE_COOKIE,
        value: '1',
        maxAgeSec: Math.floor(EXCLUDE_MAX_AGE_MS / 1000),
        secure: isSecure(),
      })
    : deleteCookieString(EXCLUDE_COOKIE, isSecure())
}
