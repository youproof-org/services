import localesData from './locales.json'

/**
 * Single source of truth for the locale model and the per-locale container
 * dictionary. The raw data lives in `locales.json` so it can also be read by
 * the legacy-redirect manifest generator (a standalone script that cannot import
 * this TypeScript module). Everything locale-specific — the set of locales, the
 * default, and the localized URL segments like `konyvek`/`fejezetek` — comes
 * from here; nothing about a particular language is hardcoded elsewhere.
 */

// Canonical, language-independent container keys. The localized URL segment for
// each is looked up per locale from the dictionary below.
export type ContainerKey = 'book' | 'chapter' | 'article' | 'newsletter' | 'landing'

export interface LocaleConfig {
  displayName: string
  htmlLang: string
  containers: Record<ContainerKey, string>
}

const DATA = localesData as {
  locales: Record<string, LocaleConfig>
}

/** Active locale codes, e.g. `['hu']`. */
export const LOCALES: string[] = Object.keys(DATA.locales)

/**
 * The default locale used for the root redirect, `<html lang>`, and x-default.
 * Sourced from the `DEFAULT_LOCALE` build-time env var (the same GitHub
 * Environment variable that drives the Cloudflare apex redirect in the zone
 * Terraform root), so the default lives in exactly one place across app + infra.
 * Falls back to the first configured locale when the env var is unset (local
 * dev). Must be one of the configured locales.
 */
export const DEFAULT_LOCALE: string = (() => {
  const fromEnv = process.env.DEFAULT_LOCALE?.trim()
  if (fromEnv) {
    if (!Object.prototype.hasOwnProperty.call(DATA.locales, fromEnv)) {
      throw new Error(
        `DEFAULT_LOCALE='${fromEnv}' is not a configured locale (${LOCALES.join(', ')}).`,
      )
    }
    return fromEnv
  }
  return LOCALES[0]
})()

export function isLocale(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(DATA.locales, value)
}

export function getLocaleConfig(locale: string): LocaleConfig {
  const cfg = DATA.locales[locale]
  if (!cfg) throw new Error(`Unknown locale '${locale}'. Known: ${LOCALES.join(', ')}`)
  return cfg
}

/** Localized URL segment for a canonical container key in a locale. */
export function getContainerSegment(locale: string, key: ContainerKey): string {
  const segment = getLocaleConfig(locale).containers[key]
  if (!segment) throw new Error(`Locale '${locale}' has no container segment for '${key}'`)
  return segment
}

/**
 * Inverse of {@link getContainerSegment}: map a localized URL segment back to
 * its canonical container key for that locale, or `null` if it is not a
 * container segment (e.g. a custom page slug).
 */
export function resolveContainerKey(locale: string, segment: string): ContainerKey | null {
  const containers = getLocaleConfig(locale).containers
  for (const key of Object.keys(containers) as ContainerKey[]) {
    if (containers[key] === segment) return key
  }
  return null
}
