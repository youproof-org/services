import { CLOCK_SKEW_TOLERANCE_MS, CONSENT_MAX_AGE_MS } from './policy'

/**
 * The stored consent record and the rules for interpreting it.
 *
 * Pure by design (see policy.ts): `now` and `current` are parameters, never read
 * from the environment, so every branch below is deterministically testable.
 */

export type ConsentDecision = 'granted' | 'denied'

/** What the caller should do: honour a decision, or ask for one. */
export type ResolvedConsent = ConsentDecision | 'ask'

/**
 * Keys are terse because this rides on every same-origin request. Expanding them
 * would be a wire-size regression for no reader benefit — the cookie is machine
 * state, and the human-readable version of it is the cookie policy page.
 */
export interface ConsentRecord {
  /** The decision. */
  d: ConsentDecision
  /** ISO-8601 UTC instant the decision was made. */
  t: string
  /** The cookiePolicyVersion in effect when the decision was made. */
  v: number
}

function isDecision(value: unknown): value is ConsentDecision {
  return value === 'granted' || value === 'denied'
}

/**
 * Parse a raw cookie value into a record, or null if it is absent, malformed, or
 * fails validation. Callers treat null exactly like "no decision yet".
 *
 * A version below 1 is rejected: 0 is the "content not promoted" sentinel and
 * must never appear in a persisted record, so seeing it means something wrote
 * garbage.
 */
export function parseRecord(raw: string | null | undefined): ConsentRecord | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { d, t, v } = parsed as Record<string, unknown>
  if (!isDecision(d)) return null
  if (typeof t !== 'string' || Number.isNaN(Date.parse(t))) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return null
  return { d, t, v }
}

export function serializeRecord(record: ConsentRecord): string {
  return JSON.stringify({ d: record.d, t: record.t, v: record.v })
}

export function buildRecord(decision: ConsentDecision, now: number, version: number): ConsentRecord {
  return { d: decision, t: new Date(now).toISOString(), v: version }
}

/**
 * Decide what to do with a stored record.
 *
 * The asymmetry on a stale version is deliberate and is the whole point of
 * versioning the policy:
 *
 *   - stale + granted -> ask. They agreed to less than we now do, so the old
 *     grant cannot cover the new purpose.
 *   - stale + denied  -> stay denied. Nothing is running for them, so no new
 *     purpose is active either; re-asking a rejector is nagging, not compliance.
 *     They are asked again at the 12-month expiry regardless.
 *
 * A record NEWER than the build is honoured rather than re-asked. That happens
 * when the CDN serves an older bundle — most obviously after a rollback — and a
 * newer consent subsumes an older policy. This branch is only expressible
 * because the version is an orderable integer.
 */
export function resolveDecision(
  record: ConsentRecord | null,
  now: number,
  current: number,
): ResolvedConsent {
  // Defensive: `current` < 1 means the content declaring the policy version was
  // not present at build time, in which case the feature is off entirely and
  // callers should not reach this. Never invent a decision from a broken build.
  if (!Number.isInteger(current) || current < 1) return 'ask'
  if (!record) return 'ask'

  const decidedAt = Date.parse(record.t)
  if (decidedAt - now > CLOCK_SKEW_TOLERANCE_MS) return 'ask'
  if (now - decidedAt > CONSENT_MAX_AGE_MS) return 'ask'

  if (record.v > current) return record.d
  if (record.v < current) return record.d === 'denied' ? 'denied' : 'ask'
  return record.d
}
