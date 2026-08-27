import type { GlossaryEntry } from './types'
import { compareHu } from './collate'

/**
 * One row of the glossary page: one NAME, not one term.
 *
 * The glossary is an index of names. A reader who only knows a term under a synonym
 * must find it under its own initial, so a term with N synonyms contributes N + 1
 * rows - the canonical form and one per synonym - each ordered on its own name and
 * each linking to the same defining anchor.
 *
 * A row is identified by (ownerName, termKey, name), never by `name` alone. Names
 * are not unique: canonical forms are carried by more than one node, synonym
 * strings repeat, and some strings are both a synonym here and somebody else's
 * canonical form - so two rows may legitimately show the same text and point at
 * different nodes. That is also why `canonical` is on every row: a synonym row has
 * to be able to tell the reader which term they are about to land on.
 *
 * Even that triple is not guaranteed unique: a term may list its own canonical form
 * among its synonyms, which yields two rows differing only in `isCanonical` (nothing
 * in the schema prevents it). A caller that needs a render key should mix in the
 * row's position rather than assume the triple is a primary key.
 */
export interface GlossaryRow {
  /** The name this row is filed under - the canonical form, or one synonym. */
  name: string
  /** The canonical form of the term this name belongs to. */
  canonical: string
  /** True when `name` IS the canonical form; false when it is a synonym of it. */
  isCanonical: boolean
  /** The term's anchor on its defining node's page - identical for every row of one term. */
  href: string
  /** The node that defines the term - the first half of the row's identity. */
  ownerName: string
  /** The defining node's standalone title, for a row that has to name its source. */
  ownerTitle: string
  /** The term's language-independent key, e.g. "natural-number". */
  termKey: string
}

/**
 * Expand the glossary's one-row-per-term entries into one row per name, ordered by
 * name in the site's single Hungarian collation.
 *
 * Synonyms are NOT nested under their canonical row: they are sorted in among the
 * canonical forms as equal entry points.
 */
export function glossaryRows(entries: readonly GlossaryEntry[]): GlossaryRow[] {
  const rows: GlossaryRow[] = []
  for (const entry of entries) {
    const shared = {
      canonical: entry.canonical,
      href: entry.href,
      ownerName: entry.ownerName,
      ownerTitle: entry.ownerTitle,
      termKey: entry.termKey,
    }
    rows.push({ ...shared, name: entry.canonical, isCanonical: true })
    for (const synonym of entry.synonyms) {
      rows.push({ ...shared, name: synonym, isCanonical: false })
    }
  }
  // Ties on the name are ordered by the owner, so a build is reproducible: the same
  // string is a canonical form on one node and a synonym on another, and the two
  // rows are otherwise indistinguishable to the sort.
  return rows.sort(
    (a, b) =>
      compareHu(a.name, b.name) ||
      compareHu(a.ownerTitle, b.ownerTitle) ||
      compareHu(a.termKey, b.termKey),
  )
}
