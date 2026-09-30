/**
 * The size gate over exported HTML pages, as a pure function of each page's size.
 *
 * Split out of check-page-size.mjs so the unit tests can run it on made-up sizes
 * with no static export present — see test/page-size.test.mjs.
 */

/**
 * Just under the 2 MiB (2,097,152 bytes) of a page's HTML that Ahrefs measures, with
 * room for content to grow before a page needs a new break.
 */
export const PAGE_SIZE_LIMIT = 1_990_000

/**
 * Pages allowed over the limit until their chapter is split into pages. A listed
 * page is only warned about. It fails the build once it is under the limit, or
 * missing from the export, so the list can only shrink.
 */
export const KNOWN_OVERSIZE = []

/**
 * Oversize pages of unpublished chapters. A local build renders every chapter in
 * full, and a deployed one renders these as stubs (`stubKindFor` in
 * lib/content/stub.ts, switched on the same `SITE_ENV` values as
 * `isDeployedSiteEnv`). So they are listed only for a local build. On a deployed
 * build they are ordinary pages: publishing one before its chapter is split fails
 * the build.
 */
export const KNOWN_OVERSIZE_UNPUBLISHED = []

export const isDeployedSiteEnv = (siteEnv) => siteEnv === 'staging' || siteEnv === 'production'

export const knownOversizeFor = (siteEnv) =>
  isDeployedSiteEnv(siteEnv) ? KNOWN_OVERSIZE : [...KNOWN_OVERSIZE, ...KNOWN_OVERSIZE_UNPUBLISHED]

const bytes = (size) => size.toLocaleString('en-US')

/** `sizes` maps each page's path relative to `out/` to its size in bytes. */
export function evaluatePageSizes(sizes, { limit = PAGE_SIZE_LIMIT, knownOversize = KNOWN_OVERSIZE } = {}) {
  const errors = []
  const warnings = []
  const known = new Set(knownOversize)

  for (const page of known) {
    const size = sizes.get(page)
    if (size === undefined) {
      errors.push(`${page} is on the known-oversize list but not in the export. Remove it from the list.`)
    } else if (size <= limit) {
      errors.push(`${page} is ${bytes(size)} bytes, under the ${bytes(limit)} limit now. Remove it from the known-oversize list.`)
    }
  }

  const oversize = [...sizes].filter(([, size]) => size > limit).sort(([, a], [, b]) => b - a)
  for (const [page, size] of oversize) {
    const line = `${page} is ${bytes(size)} bytes, over the ${bytes(limit)} limit by ${bytes(size - limit)}.`
    if (known.has(page)) warnings.push(`${line} Allowed while it is on the known-oversize list.`)
    else errors.push(`${line} Only the pages on the known-oversize list may be.`)
  }

  return { errors, warnings }
}
