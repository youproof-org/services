/**
 * The one Hungarian collation.
 *
 * Every list on the site that a reader scans alphabetically - the glossary, the
 * definitions and theorems index pages, the incoming-reference lists - orders its
 * rows through this comparator. Two lookup tables holding the same titles must not
 * disagree about their order, and the way that happens is a second call site
 * passing slightly different options to `localeCompare`. So there is exactly one
 * set of options, here.
 *
 * Why these options:
 *
 *   - `hu` because the ordering is the Hungarian alphabet's, not the code points'.
 *     `á` sorts between `a` and `b` rather than after `z`, and the digraphs are the
 *     collation's business: `cukor` < `csiga` (c before cs), `s` < `sz`.
 *   - `sensitivity: 'variant'` - the default for sorting, and the only one that is
 *     total. It compares letters first, then accents, then case, so `a` and `á` are
 *     ordered rather than tied. `'base'` would report them EQUAL, which leaves the
 *     order of two distinct names down to whatever the sort happens to do.
 *   - `numeric: true` so a name ending in a number sorts as a reader reads it:
 *     `elem 2` before `elem 10`, not after it.
 *
 * A single cached `Intl.Collator` rather than `String.prototype.localeCompare`,
 * because the latter builds a collator per comparison and these lists are sorted
 * during the build with thousands of comparisons each.
 */
const HU_COLLATOR = new Intl.Collator('hu', { sensitivity: 'variant', numeric: true })

/** Compare two Hungarian strings for display order. Use everywhere; never inline. */
export function compareHu(a: string, b: string): number {
  return HU_COLLATOR.compare(a, b)
}
