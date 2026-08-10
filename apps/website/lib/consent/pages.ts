/**
 * The consent banner's "read more" targets.
 *
 * These are not hardcoded here: a content page declares itself consent-relevant
 * by carrying `cookie-policy-version` in its front matter, and
 * scripts/gen-cookie-policy-version.mjs turns that set into
 * .generated/consent-policy.json. So the
 * same field that drives the re-prompt version also drives the link list, and
 * the two cannot drift apart.
 */

export interface PolicyPage {
  locale: string
  /** URL segment, fed to buildLocalizedUrl(locale, 'page', slug). */
  slug: string
  /**
   * Link label, taken from the page's `title:`. NOT derived from the slug —
   * Hungarian slugs are diacritic-stripped, so de-slugifying
   * `suti-cookie-kezelese` would render "Suti cookie kezelese" instead of
   * "Süti tájékoztató".
   */
  title: string
}

/**
 * Pages to link for `locale`, falling back to `defaultLocale` when this locale
 * has no policy pages of its own. A banner with no policy link is a compliance
 * defect, so the fallback matters the moment a second locale exists with
 * untranslated legal pages; check-analytics-build.mjs asserts the result is
 * non-empty whenever the feature is live.
 */
export function policyPagesForLocale(
  pages: readonly PolicyPage[],
  locale: string,
  defaultLocale: string,
): PolicyPage[] {
  const forLocale = pages.filter((p) => p.locale === locale)
  if (forLocale.length > 0) return forLocale
  return pages.filter((p) => p.locale === defaultLocale)
}
