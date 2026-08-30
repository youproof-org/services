/**
 * Text matching for the knowledge base's client-side list filters.
 *
 * Its own module rather than a function inside `ListFilter`, because the component
 * is a client component with a stylesheet import and this is the part worth a test.
 *
 * The normalisation is lax in three deliberate ways, all so that what the reader
 * types finds what the reader sees:
 *
 *   - **Accent-insensitive.** "fuggveny" finds "függvény". Looking a term up should
 *     not require reaching for the right dead keys, and no list behind this filter
 *     is long enough for the extra matches to be a nuisance.
 *   - **Case-insensitive**, for the same reason.
 *   - **Math markup dropped.** Some names are authored with inline LaTeX -
 *     `$\varphi$-függvény` - and the reader sees a rendered glyph, not the source.
 *     Dropping `$`, the backslash and braces leaves the letters matchable, so both
 *     "varphi" and "függvény" find that row instead of neither.
 */
export function normaliseFilterText(value: string): string {
  return value
    .replace(/[$\\{}]/g, '')
    // NFD first: the diacritic strip works on decomposed text, where "ő" is an "o"
    // followed by a combining double acute.
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * True when `text` contains `query`, both normalised as above.
 *
 * An empty or whitespace-only query matches everything: the filter narrows a list
 * that is already rendered, so "nothing typed" means "the whole list" and can never
 * mean "no rows".
 */
export function filterTextMatches(text: string, query: string): boolean {
  const needle = normaliseFilterText(query)
  return needle === '' || normaliseFilterText(text).includes(needle)
}
