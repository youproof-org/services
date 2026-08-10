/**
 * Cookie and query-string string handling. Strings in, strings out — nothing here
 * touches `document`, so it is all unit-testable (see policy.ts). The one-line
 * `document.cookie = …` assignments live in storage.ts and gtag.ts.
 */

export interface CookieOptions {
  name: string
  value: string
  maxAgeSec: number
  /**
   * Set the Secure attribute. Passed in rather than sniffed so `next dev` over
   * plain http still works — a Secure cookie is silently dropped there, which
   * would make the banner reappear on every reload during development.
   */
  secure: boolean
}

/**
 * Parse a `document.cookie` string. Values are percent-decoded; a value
 * containing `=` is preserved, since only the first `=` separates name from
 * value.
 */
export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>()
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    const raw = part.slice(eq + 1).trim()
    try {
      out.set(name, decodeURIComponent(raw))
    } catch {
      // A malformed percent sequence is not worth failing over: keep it raw and
      // let the record parser reject it.
      out.set(name, raw)
    }
  }
  return out
}

/**
 * No `Domain` attribute, deliberately: the cookie stays host-only so
 * youproof.org and staging.youproof.org hold independent decisions. No
 * `HttpOnly` either — client JS is the only reader, and adding it would silently
 * break the feature rather than harden anything.
 */
export function serializeCookie({ name, value, maxAgeSec, secure }: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function deleteCookieString(name: string, secure: boolean): string {
  return serializeCookie({ name, value: '', maxAgeSec: 0, secure })
}

/**
 * Domain suffixes a cookie on `hostname` could plausibly be scoped to, broadest
 * last, stopping at two labels. Used only for deletion: the browser ignores an
 * attempt to set a Domain it does not permit, so an over-broad candidate is
 * harmless, whereas missing the right one leaves a GA cookie behind.
 */
export function cookieDomainCandidates(hostname: string): string[] {
  const labels = hostname.split('.').filter(Boolean)
  if (labels.length < 2) return [] // localhost, or an IP — host-only is all there is
  const out: string[] = []
  for (let i = 0; i <= labels.length - 2; i += 1) {
    out.push(labels.slice(i).join('.'))
  }
  return out
}

/**
 * The GA cookie names to clear: every `_ga*` cookie actually present, plus the
 * `_ga_<id>` this build would create even if it is not there yet.
 *
 * Enumerating what exists rather than deriving only from our own measurement ID
 * matters because GA4 scopes `_ga` to the REGISTRABLE DOMAIN (`cookie_domain:
 * 'auto'` resolves to `.youproof.org`, not to the host). So cookies created on
 * staging are visible on production, carrying a different property's `_ga_<id>`
 * that we would otherwise never think to remove. It also means we can clean up
 * when our own measurement ID is unset.
 */
export function gaCookieNames(
  header: string | null | undefined,
  measurementId: string,
): string[] {
  const names = new Set<string>(['_ga'])
  for (const name of parseCookieHeader(header).keys()) {
    if (name === '_ga' || name.startsWith('_ga_')) names.add(name)
  }
  const suffix = measurementId.replace(/^G-/, '')
  if (suffix) names.add(`_ga_${suffix}`)
  return [...names].sort()
}

/**
 * Every `document.cookie` assignment needed to remove the given GA cookies.
 *
 * Each is cleared host-only and once per domain candidate, because we cannot know
 * from script which scope GA actually used. The leading-dot form is not emitted
 * separately: RFC 6265 has the browser ignore a leading dot, so
 * `Domain=youproof.org` already matches a cookie stored as `.youproof.org`.
 */
export function gaCookieClearStrings(
  hostname: string,
  names: readonly string[],
  secure: boolean,
): string[] {
  const out: string[] = []
  for (const name of names) {
    out.push(deleteCookieString(name, secure))
    for (const domain of cookieDomainCandidates(hostname)) {
      out.push(`${deleteCookieString(name, secure)}; Domain=${domain}`)
    }
  }
  return out
}

/**
 * Whether GA4's own cookies are present. Used to avoid pointless cookie writes on
 * every page load for a visitor who has not consented — and, more usefully, to
 * detect GA cookies that have outlived the consent that created them.
 */
export function hasGaCookies(header: string | null | undefined): boolean {
  for (const name of parseCookieHeader(header).keys()) {
    if (name === '_ga' || name.startsWith('_ga_')) return true
  }
  return false
}

export type GaDebugMode = 'exclude' | 'include'

/**
 * Read the `?ga_debug=` switch. `exclude` marks this browser's traffic internal;
 * `include` clears the mark, so the setting can be undone without opening
 * DevTools on every device it was ever set from.
 */
export function parseGaDebugParam(search: string | null | undefined): GaDebugMode | null {
  if (!search) return null
  const value = new URLSearchParams(search).get('ga_debug')
  return value === 'exclude' || value === 'include' ? value : null
}
