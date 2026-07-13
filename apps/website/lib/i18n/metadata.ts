import { DEFAULT_LOCALE } from './config'
import { buildLocalizedUrl, type UrlKey } from './url'

// Absolute-URL base for canonical/hreflang/sitemap. Kept here so the whole app
// derives absolute URLs from one place. Derived from SITE_HOST so each
// environment self-references its own host — production emits
// https://youproof.org, staging emits https://staging.youproof.org — instead of
// every env canonicalizing to production. The deploy workflow's website job sets
// SITE_HOST per environment; falls back to the production host when unset (local
// builds), which is harmless since non-production is noindex (see robots.ts).
const SITE_HOST = process.env.SITE_HOST?.trim() || 'youproof.org'
export const SITE_URL = `https://${SITE_HOST}`

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname}`
}

/**
 * Build the canonical + hreflang alternate set for a content item, per the
 * i18n design doc §7. `availableLocales` is the set of locales that actually
 * have a published version of this item — today just its own locale, so the
 * set is `[locale]`. Driven by real availability (not the static locale list)
 * so it stays correct when a second locale exists.
 *
 * NOTE: when multi-locale content lands, each locale's URL must use that
 * locale's own slug for the item (via the cross-locale grouping described in
 * §4). Today only one locale has any item, so the item's own slug is the only
 * one needed.
 */
export function buildAlternates(
  locale: string,
  key: UrlKey,
  slugPath: string[],
  availableLocales: string[] = [locale],
): { canonical: string; languages: Record<string, string> } {
  const abs = (loc: string) => absoluteUrl(buildLocalizedUrl(loc, key, ...slugPath))
  const languages: Record<string, string> = {}
  for (const loc of availableLocales) languages[loc] = abs(loc)
  const xDefaultLocale = availableLocales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locale
  languages['x-default'] = abs(xDefaultLocale)
  return { canonical: abs(locale), languages }
}
