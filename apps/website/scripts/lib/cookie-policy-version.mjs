/**
 * Pure reduction from content page front matter to the consent build data.
 *
 * Split out of gen-cookie-policy-version.mjs so it can be unit-tested without a
 * content checkout or a filesystem — see test/cookie-policy-version.test.mjs.
 */

const FIELD = 'cookie-policy-version'

/**
 * @param {Array<{ relPath: string, doc: any }>} entries every page.yaml found,
 *   already parsed. Entries without the version field are ignored, which is how
 *   a page declares itself NOT consent-relevant.
 * @returns {{ cookiePolicyVersion: number, pages: Array<{locale: string, slug: string, title: string}> }}
 * @throws if a flagged page is malformed, or if flagged pages disagree on the
 *   version — shipping an ambiguous version is worse than not shipping.
 */
export function reduceCookiePolicyPages(entries) {
  const flagged = entries.filter((e) => e.doc?.[FIELD] !== undefined && e.doc?.[FIELD] !== null)

  // No flagged page: the content in this build predates the policy rewrite.
  // 0 is the "feature off" sentinel — ConsentGate renders nothing, which is what
  // keeps production inert until the content is promoted.
  if (flagged.length === 0) return { cookiePolicyVersion: 0, pages: [] }

  const pages = []
  const versions = new Map()

  for (const { relPath, doc } of flagged) {
    const version = doc[FIELD]
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new Error(
        `${relPath}: '${FIELD}' must be an integer >= 1, got ${JSON.stringify(version)}`,
      )
    }
    for (const key of ['locale', 'slug', 'title']) {
      if (typeof doc[key] !== 'string' || doc[key].trim() === '') {
        throw new Error(
          `${relPath}: carries '${FIELD}' so it is linked from the consent banner, ` +
            `but '${key}' is missing or empty`,
        )
      }
    }
    versions.set(relPath, version)
    pages.push({ locale: doc.locale, slug: doc.slug, title: doc.title })
  }

  const distinct = [...new Set(versions.values())]
  if (distinct.length > 1) {
    const detail = [...versions.entries()].map(([f, v]) => `${f}=${v}`).join(', ')
    throw new Error(
      `Consent-relevant pages disagree on '${FIELD}' (${detail}). ` +
        'They must move in lockstep: one logical version describes what a visitor consented to.',
    )
  }

  // Deterministic order — directory read order is not stable, and this list is
  // rendered as links and asserted against by the post-deploy checks.
  pages.sort((a, b) => a.locale.localeCompare(b.locale) || a.slug.localeCompare(b.slug))

  return { cookiePolicyVersion: distinct[0], pages }
}
