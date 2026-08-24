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
export type ContainerKey =
  | 'book' | 'chapter' | 'article' | 'newsletter' | 'landing'
  // Knowledge base. `knowledge-base` is the outer segment every KB page sits
  // under; the rest are the per-type segments nested inside it. Namespaces
  // deliberately have no segment — a node's URL must not move when namespaces are
  // reorganized — so a definition/theorem path is flat and a proof/remark path
  // nests under its owner instead.
  | 'knowledge-base' | 'definition' | 'theorem' | 'proof' | 'remark' | 'term'

/**
 * Fragment-identifier prefixes, per locale. These end up in a URL the reader sees
 * and can copy — `…/definiciok/gyuru-test#allitas-letezik-nullelem` — so they are
 * localized data exactly like the container segments; nothing about `allitas` may
 * be hardcoded in a code path.
 *
 * Deliberately SINGULAR, and therefore distinct from `containers`: an anchor names
 * one claim or one node (`definicio`), while a container segment names the
 * collection it addresses (`definiciok`).
 */
export type AnchorKey = 'definition' | 'theorem' | 'proof' | 'remark' | 'claim' | 'term'

// Localized UI/title labels for pages that have no backing content object
// (homepage + the article/newsletter index pages). Data-driven so a new locale
// needs no code change — only a `labels` block in locales.json.
export type LabelKey =
  | 'home' | 'articlesIndex' | 'newsletterIndex'
  | 'knowledgeBase' | 'definitionsIndex' | 'theoremsIndex' | 'glossary'

export interface LocaleConfig {
  displayName: string
  htmlLang: string
  ogLocale: string                // OpenGraph locale, e.g. 'hu_HU' (og:locale)
  siteName: string                // og:site_name + brand wordmark, e.g. 'youproof.org'
  tagline: string                 // brand-lockup tagline, e.g. 'Deep math. Human access.'
  motto: string                   // hero / OG-image motto, e.g. 'There is no royal road…'
  brand: string                   // <title> brand suffix, e.g. 'youproof.org - Deep Math. Human Access.'
  defaultDescription: string      // meta-description fallback for this locale
  labels: Record<LabelKey, string>
  containers: Record<ContainerKey, string>
  anchors: Record<AnchorKey, string>
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

/** Localized label for a content-less page (home / article / newsletter index). */
export function getLocaleLabel(locale: string, key: LabelKey): string {
  const label = getLocaleConfig(locale).labels[key]
  if (!label) throw new Error(`Locale '${locale}' has no label for '${key}'`)
  return label
}

/** Localized URL segment for a canonical container key in a locale. */
export function getContainerSegment(locale: string, key: ContainerKey): string {
  const segment = getLocaleConfig(locale).containers[key]
  if (!segment) throw new Error(`Locale '${locale}' has no container segment for '${key}'`)
  return segment
}

/** Localized fragment-identifier prefix for a node / claim / term kind. */
export function getAnchorPrefix(locale: string, key: AnchorKey): string {
  const prefix = getLocaleConfig(locale).anchors[key]
  if (!prefix) throw new Error(`Locale '${locale}' has no anchor prefix for '${key}'`)
  return prefix
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
