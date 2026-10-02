/**
 * The size gate over exported HTML pages, as a pure function of each page's size.
 *
 * Split out of check-page-size.mjs so the unit tests can run it on made-up sizes
 * with no static export present — see test/page-size.test.mjs.
 */

/**
 * Just under the 2 MiB (2,097,152 bytes) of a page's HTML that Ahrefs measures, with
 * room for content to grow.
 */
export const PAGE_SIZE_LIMIT = 1_990_000

const bytes = (size) => size.toLocaleString('en-US')

/**
 * `sizes` maps each page's path relative to `out/` to its size in bytes. Returns one
 * error per page over the limit, largest first.
 */
export function evaluatePageSizes(sizes, { limit = PAGE_SIZE_LIMIT } = {}) {
  return [...sizes]
    .filter(([, size]) => size > limit)
    .sort(([, a], [, b]) => b - a)
    .map(([page, size]) => `${page} is ${bytes(size)} bytes, over the ${bytes(limit)} limit by ${bytes(size - limit)}.`)
}
