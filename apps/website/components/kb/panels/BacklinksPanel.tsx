import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import type { LabelKey } from '@/lib/i18n/config'
import type { KbBacklinkSource, KbNode } from '@/lib/content/types'
import styles from './backlinks-panel.module.scss'

/**
 * The Bejövő hivatkozások panel: everything that cites this entity, one row per
 * source (sub-plan §7.2).
 *
 * **All incoming means all.** A reference aimed at a claim or a term inside this
 * entity is a reference to this entity, and belongs here: claims and terms have no
 * page of their own, so this page is the only place they can be shown.
 * `graph.backlinks.get(fqn).all` is already exactly that list — built once at
 * graph-build time by `buildBacklinkIndex`, which is also where the page-existence
 * filter lives, so no row here can point at a page this build does not generate.
 *
 * **A source is not only another entity.** Chapters and sections of the book cite
 * entities too and share the list with them, because a reader asking "where is this
 * used?" wants the chapter as much as the theorem. What kind of thing a source is is
 * therefore part of the answer, and is written on the row in words: 57 times across
 * the local export's backlink lists, two rows of one list share a title and are
 * different kinds, and without the label those two rows are identical except for
 * where they lead. Eight of them are in `gyuru-test`'s list — "Oszthatóság" among
 * them, a section citing it 14 times and a definition of that name citing it twice.
 * `data-backlink-source` carries the same kind for markup that needs to target it.
 *
 * **One row per source, with a count.** A section citing this entity five times is
 * one row saying five: five rows would bury every other source, and one row without
 * a count would throw away how heavily that section leans on this entity.
 *
 * **And the rows are a tree, not a list.** A source is a place in the book, and
 * places nest: a chapter, its sections, the entities embedded in them. So the rows
 * are grouped and indented that way, and each one's count is accumulated from
 * everything under it — a section speaks for the entities embedded in it as well as
 * for its own narrative. `buildBacklinkIndex` does the grouping; this renders it.
 * Ordering is by count descending, ties broken by title, at every level.
 *
 * **The empty state is an answer, not a failure.** The menu item is on every entity
 * page (§6.5), and 168 of the 389 pages a deployed build ships have nothing citing
 * them. "Nincs rá hivatkozás" is what the reader came for in those cases, so it is
 * rendered as a plain answer rather than as a missing list.
 *
 * **One list, however long.** `gyuru-test` is cited by 222 sources locally and 207
 * on a deployed build, against a median of 1. There is no second design for the long
 * case: the panel's own scroller takes it, under a header that stays put (§6.4).
 *
 * **Following a row is not just a link.** §7.2 asks for the page it leads to to mark
 * the places that cite what the reader was reading, so every row carries
 * `data-highlight-fqn` — the fully qualified name of what its count is about. The row
 * does nothing with it; `components/kb/HighlightOnArrival.tsx` is what turns it into a
 * query parameter at click time and into marks on arrival (D7).
 *
 * A server component, like `ContextPanel` and for the same two reasons: the graph is
 * a cyclic object graph that cannot cross the client boundary, and §2.1 requires
 * these rows in the served HTML — they are the inbound edges of the knowledge graph
 * this ticket exists to expose.
 */

interface BacklinksPanelProps {
  node: KbNode
}

export default function BacklinksPanel({ node }: BacklinksPanelProps) {
  const graph = getContentGraph()
  const entityFqn = keyForKbNode(node)
  // A missing key and an empty list are the same answer: `buildBacklinkIndex` only
  // records an entity once a source survives the page-existence filter.
  const sources = graph.backlinks.get(entityFqn)?.all ?? []
  return <BacklinkList locale={node.locale} sources={sources} target={entityFqn} />
}

/**
 * What each kind of source is called, one label per member of
 * `KbBacklinkSource['kind']`.
 *
 * A `Record` over the union rather than a lookup with a fallback, so a seventh kind
 * of source is a compile error here instead of a row whose label is silently blank.
 * The words are the project's own: the four entity types read as
 * `ENTITY_LABEL_HU` (lib/content/display-template.ts) writes them, which is also
 * what `kbNodeLabel` puts beside an entity in the narrative, and a chapter and a
 * section read as the singular of their localized container segments.
 */
const KIND_LABELS: Record<KbBacklinkSource['kind'], LabelKey> = {
  definition: 'kbBacklinkKindDefinition',
  theorem: 'kbBacklinkKindTheorem',
  proof: 'kbBacklinkKindProof',
  remark: 'kbBacklinkKindRemark',
  chapter: 'kbBacklinkKindChapter',
  section: 'kbBacklinkKindSection',
}

interface BacklinkListProps {
  locale: string
  /**
   * The top level of the tree, already ordered by `buildBacklinkIndex`: count
   * descending, ties by title, at this level and every one below it.
   */
  sources: readonly KbBacklinkSource[]
  /**
   * What these sources cite — the fully qualified name this list is a list OF, which
   * is `backlinks.byTarget`'s key for the two filtered cases and the entity's own
   * name for the unfiltered one.
   *
   * It is not used to look anything up here. It is what each row hands forward for
   * the page it leads to to highlight (§7.2, D7): the reader following a row is
   * leaving to see the places that cite THIS, and this is the only place that knows
   * what "this" is.
   */
  target: string
}

/**
 * The list itself, so that the three places §7.2 calls for it are one list
 * narrowed rather than three designs.
 *
 * The panel above is the unfiltered case — `backlinks.all` — and the filtered ones
 * are `backlinks.byTarget.get(targetFqn)` for a selected term or claim
 * (`TermPanel`, `ClaimPanel`). Every difference between them is which array is
 * handed in; the row, the count, the ordering and the empty state are the same in
 * all three because they are literally the same component.
 *
 * The empty state travels with the list for the same reason: "nothing references
 * this term" is the same kind of answer as "nothing references this entity", and a
 * caller that had to write its own would be free to make it read differently.
 */
export function BacklinkList({ locale, sources, target }: BacklinkListProps) {
  if (sources.length === 0) {
    return <p className={styles.empty}>{getLocaleLabel(locale, 'kbPanelIncomingEmpty')}</p>
  }

  return <BacklinkLevel locale={locale} sources={sources} target={target} depth={0} />
}

/**
 * One level of the tree and, under each of its rows, the level below it.
 *
 * Nested `<ul>`s rather than one flat list with an indent class, because that IS the
 * structure: a crawler reading the served HTML (§2.1) gets the containment for free,
 * and the indent becomes one rule about nesting instead of a depth the server has to
 * count and the stylesheet has to enumerate.
 *
 * `depth` is carried only as far as the markup: it is written on the row so a
 * checker reading the built HTML can tell a chapter's row from a section's without
 * walking the DOM up, which is what `e2e/kb-backlinks.test.ts` does with it.
 */
function BacklinkLevel({
  locale,
  sources,
  target,
  depth,
}: BacklinkListProps & { depth: number }) {
  return (
    <ul className={depth === 0 ? styles.sources : styles.nested}>
      {sources.map((source) => (
        <li key={source.fqn} className={styles.source}>
          {/*
            The row IS the link (§7.2): the whole of it is the target, not just the
            title, so the count is part of what the reader presses. An ordinary
            link — panel content is what the reader is meant to be acting on, so it
            navigates (§6.4).
          */}
          <Link
            href={source.href}
            className={styles.link}
            data-backlink-source={source.kind}
            data-backlink-depth={depth}
            /*
              What the source's page should mark once this row has been followed
              (§7.2, D7). Inert markup: the href stays clean, and the parameter that
              carries this is appended by the client at click time, so a crawler never
              sees the variant and a copied link never contains it —
              `components/kb/HighlightOnArrival.tsx` is both halves of that.

              A container row hands forward the same target as its children, and the
              page it leads to marks every reference inside it — which is exactly the
              count this row shows.
            */
            data-highlight-fqn={target}
          >
            {/*
              The count leads the row, and the title with the kind beneath it
              follows — the reader scans the numbers down one edge and reads a row
              as "14 references, from the section Oszthatóság".

              The count as a number as well as as a sentence: the wording is
              localized, so the digits are the only part of it a checker reading the
              built HTML can rely on.
            */}
            <span className={styles.count} data-backlink-count={source.count}>
              {formatLocaleLabel(locale, 'kbPanelIncomingCount', { count: source.count })}
            </span>
            <span className={styles.text}>
              <span className={styles.title}>
                <InlineText text={source.title} />
              </span>
              {/*
                What kind of thing the source is, in words rather than only in
                `data-backlink-source`: two sources of different kinds can carry the
                same title, and then the title alone does not tell the reader which
                row goes where.
              */}
              <span className={styles.kind}>
                {getLocaleLabel(locale, KIND_LABELS[source.kind])}
              </span>
            </span>
          </Link>
          {source.children.length > 0 && (
            <BacklinkLevel
              locale={locale}
              sources={source.children}
              target={target}
              depth={depth + 1}
            />
          )}
        </li>
      ))}
    </ul>
  )
}
