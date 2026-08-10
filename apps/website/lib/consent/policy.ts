/**
 * Constants shared by the consent logic and the browser layer.
 *
 * Deliberately dependency-free — no `window`, no `document`, no `Date.now()` —
 * so everything importing it stays unit-testable under
 * `node --import tsx --test`. Time always enters the logic as a parameter.
 */

/** First-party cookie holding the visitor's analytics decision. */
export const CONSENT_COOKIE = 'yp_consent'

/**
 * First-party cookie marking the operator's own test visits. Only ever created
 * by deliberately visiting `?ga_debug=exclude`; see lib/consent/cookies.ts.
 */
export const EXCLUDE_COOKIE = 'yp_ga_exclude'

/**
 * 12 months — the consent lifetime for this site. Doubles as the cookie's
 * Max-Age, so a stale record physically expires as well as being range-checked
 * on read. Belt and braces: we do not want to depend on our own expiry
 * arithmetic being the only thing standing between us and an ancient consent.
 */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/** 2 years. A personal debug setting, not a compliance-relevant cookie. */
export const EXCLUDE_MAX_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000

/**
 * Tolerance for a consent timestamp dated in the future. Modest clock skew
 * between write and read is normal; a record further ahead than this is treated
 * as untrustworthy and re-asked rather than honoured.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 24 * 60 * 60 * 1000
