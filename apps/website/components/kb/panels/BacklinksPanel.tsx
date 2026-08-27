import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import type { KbNode } from '@/lib/content/types'
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
 * used?" wants the chapter as much as the theorem. Which kind a row is stays on the
 * row as `data-backlink-source`; it is the one thing about a source the markup does
 * not otherwise carry, since the href already gives its identity.
 *
 * **One row per source, with a count.** A section citing this entity five times is
 * one row saying five: five rows would bury every other source, and one row without
 * a count would throw away how heavily that section leans on this entity. Ordering
 * is by count descending, ties broken by title (`buildBacklinkIndex`) — provisional
 * per §7.2, and the only ordering available without inventing a relevance notion.
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
  // A missing key and an empty list are the same answer: `buildBacklinkIndex` only
  // records an entity once a source survives the page-existence filter.
  const sources = graph.backlinks.get(keyForKbNode(node))?.all ?? []

  if (sources.length === 0) {
    return <p className={styles.empty}>{getLocaleLabel(node.locale, 'kbPanelIncomingEmpty')}</p>
  }

  return (
    <ul className={styles.sources}>
      {sources.map((source) => (
        <li key={source.fqn} className={styles.source}>
          {/*
            The row IS the link (§7.2): the whole of it is the target, not just the
            title, so the count is part of what the reader presses. An ordinary
            link — panel content is what the reader is meant to be acting on, so it
            navigates (§6.4).
          */}
          <Link href={source.href} className={styles.link} data-backlink-source={source.kind}>
            <span className={styles.title}>
              <InlineText text={source.title} />
            </span>
            {/*
              The count as a number as well as as a sentence: the wording is
              localized, so the digits are the only part of it a checker reading the
              built HTML can rely on.
            */}
            <span className={styles.count} data-backlink-count={source.count}>
              {formatLocaleLabel(node.locale, 'kbPanelIncomingCount', { count: source.count })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
