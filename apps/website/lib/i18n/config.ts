import localesData from './locales.json'

/**
 * Single source of truth for the locale model and the per-locale container
 * dictionary. The raw data lives in `locales.json` so it can also be read by
 * the legacy-redirect manifest generator (a standalone script that cannot import
 * this TypeScript module). Everything locale-specific — the set of locales, the
 * default, and the localized URL segments like `konyvek`/`fejezetek` — comes
 * from here; nothing about a particular language is hardcoded elsewhere.
 */

// Canonical, language-independent container keys — one per addressable container in
// the content model. The localized segment for each is looked up per locale from the
// dictionary below. Most are URL segments; `claim`, `part` and `section` are anchor
// segments only (see below), so "container" here means "thing that contains
// addressable children", not "thing that appears in a path".
export type ContainerKey =
  | 'book' | 'chapter' | 'article' | 'newsletter' | 'landing'
  // Knowledge base. `knowledge-base` is the outer segment every KB page sits
  // under; the rest are the per-type segments nested inside it. Namespaces
  // deliberately have no segment — a node's URL must not move when namespaces are
  // reorganized — so a definition/theorem path is flat and a proof/remark path
  // nests under its owner instead.
  | 'knowledge-base' | 'definition' | 'theorem' | 'proof' | 'remark' | 'term'
  // Anchor-only: these three name a container that is addressed by a FRAGMENT
  // rather than by a path, so they never appear in a URL. They live in the same
  // dictionary as the rest because they are the same words — an anchor segment and
  // a URL segment for one concept must not be able to drift apart — and because
  // being here also reserves them against a colliding custom-page slug.
  | 'claim' | 'part' | 'section'


// Localized UI/title labels for pages that have no backing content object
// (homepage + the article/newsletter index pages). Data-driven so a new locale
// needs no code change — only a `labels` block in locales.json.
export type LabelKey =
  | 'home' | 'articlesIndex' | 'newsletterIndex'
  | 'knowledgeBase' | 'definitionsIndex' | 'theoremsIndex' | 'glossary'
  // Knowledge-base root page: the orienting paragraph, and per section its
  // one-line description and the wording around its count. The count labels
  // carry a `{count}` placeholder — see `formatLocaleLabel`.
  | 'kbIntro'
  | 'kbDefinitionsDescription' | 'kbTheoremsDescription' | 'kbGlossaryDescription'
  | 'kbDefinitionsCount' | 'kbTheoremsCount'
  | 'kbGlossaryCount' | 'kbGlossaryCountNote'
  // Glossary page: the wording a synonym row uses to name the canonical form it
  // belongs to. `{name}` is that form, so the label carries the sentence and the
  // code only supplies the term.
  | 'kbGlossarySynonymOf'
  // The shared list filter above a knowledge-base list — the glossary's names and
  // the index pages' titles use the same three.
  | 'kbFilterPlaceholder' | 'kbFilterEmpty' | 'kbFilterClear'

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

/**
 * A localized label with its `{name}` placeholders filled in — for the labels that
 * carry a number rather than a fixed string, so the number stays in the code and
 * the sentence around it stays in the dictionary.
 *
 * Throws on a placeholder the caller did not supply, because the failure mode is
 * otherwise invisible: a literal `{count}` rendered to the reader.
 */
export function formatLocaleLabel(
  locale: string,
  key: LabelKey,
  values: Record<string, string | number>,
): string {
  return getLocaleLabel(locale, key).replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`Label '${key}' in locale '${locale}' has no value for '{${name}}'`)
    }
    return String(values[name])
  })
}

/** Localized URL segment for a canonical container key in a locale. */
export function getContainerSegment(locale: string, key: ContainerKey): string {
  const segment = getLocaleConfig(locale).containers[key]
  if (!segment) throw new Error(`Locale '${locale}' has no container segment for '${key}'`)
  return segment
}



/**
 * Which container keys may appear as the FIRST path segment after the locale.
 *
 * Exhaustive by construction: it is a `Record<ContainerKey, boolean>`, so adding a
 * ContainerKey without classifying it here is a COMPILE error. That matters because
 * the failure mode is silent — `resolvePath` falls through to the standalone branch
 * for any key it does not explicitly reject, and a single-segment path there
 * resolves to an index page. An unclassified `claim` would make `/hu/allitasok`
 * render a bogus index instead of 404ing.
 *
 * `false` means "this container is addressed some other way": nested inside another
 * path (`chapter`), or by a fragment rather than a path at all (`claim`, `part`,
 * `section`).
 */
const ROUTABLE_AT_ROOT = {
  book: true,
  article: true,
  newsletter: true,
  landing: true,
  // Nested under its book.
  chapter: false,
  // Knowledge base: every KB page sits under the outer `knowledge-base` segment,
  // so it is the only one of these keys that may start a path. The per-type
  // segments are reserved (no custom page can take them) but are addressed only
  // nested inside it — which is what makes `/hu/definiciok` 404 rather than
  // resolving to the definitions index.
  'knowledge-base': true,
  definition: false,
  theorem: false,
  proof: false,
  remark: false,
  term: false,
  // Anchor-only containers: addressed by a fragment, never by a path.
  claim: false,
  part: false,
  section: false,
} as const satisfies Record<ContainerKey, boolean>

/** The container keys that may start a path, derived from the table above. */
export type RootRoutableKey = {
  [K in ContainerKey]: (typeof ROUTABLE_AT_ROOT)[K] extends true ? K : never
}[ContainerKey]

/**
 * True when a localized segment may start a path. Narrows, so `resolvePath` can
 * switch on the result without a second hand-written list of keys to reject.
 */
export function isRoutableAtRoot(key: ContainerKey): key is RootRoutableKey {
  return ROUTABLE_AT_ROOT[key]
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
