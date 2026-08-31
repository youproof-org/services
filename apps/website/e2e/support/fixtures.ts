import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The expected values, derived from the content graph by `derive-fixtures.mjs` and
 * read here once. See that file for why they are not written down in the specs.
 */

/** Everything a spec asserts about one rendered backlink list. */
export interface BacklinkList {
  /** Every row of the tree, which is more than the number of sources: containers get rows too. */
  rows: number
  /** The top level of the tree — the chapters. */
  topRows: number
  /** Rows with an ownership line below their name: the proofs and the remarks. */
  ownershipRows: number
  /** Rows that hold a nested list under them, i.e. one `<ul>` inside an `<li>`. */
  nestedRows: number
  depths: number[]
  kinds: string[]
  /** Every reference counted once, since every source sits inside some chapter. */
  topCountSum: number
  topFirstCount: number
  firstHref: string | null
  lastHref: string | null
  /**
   * The literal leading index of the first row's name ("16."). Only the index: the
   * rest of the line goes through `InlineText`, so a title carrying math renders as
   * elements whose text is not the source string.
   */
  firstNumberPrefix: string
  /** Depth -> the source kinds that occur at it, which is what makes the tree a tree. */
  kindsByDepth: Record<string, string[]>
  /** Per source kind, the shape of each display line — see the spec that asserts it. */
  linesByKind: Record<string, { number: string[]; typeWord: string[]; ownership: string[] }>
}

export interface Fixtures {
  siteEnv: string
  /** Entity pages this build generates: 537 locally, 389 on a deployed build. */
  pageCount: number
  /** The longest backlink list in the build. */
  busiest: { url: string } & BacklinkList
  /** The short end of the same range, with a proof among its sources. */
  shortList: {
    url: string
    rows: number
    topRows: number
    firstCount: number
    firstNumberPrefix: string
    /** Its index among the rendered rows, and the lines that identify it. */
    proofRow: { index: number; typeWord: string; numberPrefix: string; ownership: string }
  }
  /** An entity nothing cites, which is most of the build. */
  uncited: { url: string }
  /** A proof that defines no term, so neither level-2 mode has anything to reveal. */
  termlessProof: { url: string }
  /** Inbound rows per entity URL; absent means none. Read it via `incomingRows`. */
  incomingRowsByUrl: Record<string, number>
  lists: { glossaryRows: number; definitionRows: number; theoremRows: number }
}

export const fixtures: Fixtures = JSON.parse(
  readFileSync(path.join(__dirname, '..', '.generated', 'fixtures.json'), 'utf8'),
) as Fixtures

/**
 * Rows the inbound list of one entity page serves in THIS build. For a spec that
 * names its entity for a reason of its own and needs a count that moves with the
 * build; 0 is the empty state rather than a missing fixture.
 */
export function incomingRows(url: string): number {
  return fixtures.incomingRowsByUrl[url] ?? 0
}
