import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { kbNodeLabel, kbOwnership } from '@/lib/content/graph'
import { urlForKbNode } from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import type { ContentGraph, KbNode } from '@/lib/content/types'
import styles from './ownership-links.module.scss'

interface OwnershipLinksProps {
  node: KbNode
  /**
   * Which half of the chain this renders, and therefore where it sits (§6.1 as
   * amended):
   *
   *   - **`header`** — the one link UP, above the page's label. Only a proof and a
   *     remark have one, so on a definition or a theorem this renders nothing.
   *   - **`body`** — the links DOWN, below the q.e.d.: the proofs and the remarks
   *     attached to this entity.
   *
   * One component and one stylesheet for both, rather than a second copy of the row
   * treatment: a link up and a link down are the same object pointing the other way,
   * and the placement decides only which of them is here and how the list is spaced.
   */
  placement?: 'header' | 'body'
}

/** Which way along the chain a link moves the reader. */
type Direction = 'up' | 'down'

/**
 * The arrow that marks the direction, and the words that say the same thing.
 *
 * The arrow is a glyph in the markup rather than CSS generated content — unlike the
 * index page's em dash (`kb-type-index-page.module.scss`), which is punctuation
 * between two rendered values. This one carries meaning, so it needs an accessible
 * equivalent, and generated content can be neither hidden from a screen reader nor
 * reliably read by one. So: the glyph is `aria-hidden`, and the label beside it is
 * in the accessibility tree only.
 */
const ARROW: Record<Direction, string> = { up: '↑', down: '↓' }
const DIRECTION_LABEL: Record<Direction, LabelKey> = {
  up: 'kbOwnershipUp',
  down: 'kbOwnershipDown',
}

/** One link of the chain: where it goes, how it reads, and which way it points. */
interface OwnershipLink {
  href: string
  direction: Direction
  label: string
  title?: string
}

/**
 * The links of one node's chain: the parent first, then the proofs, then the
 * remarks — the reading order of the second table in §6.5.
 *
 * A child is numbered only when it has a sibling of its own type, because a proof
 * and a remark carry no index (`kbNodeLabel`) and no authored title: all 190 proofs
 * label as "Bizonyítás" and all 72 remarks as "Megjegyzés" (measured). One per
 * owner today, so no ordinal is emitted anywhere in the content — but a theorem
 * with a second proof gets one link per proof (D4), and two links reading
 * "Bizonyítás" would be that list with the choice put back into it.
 */
function ownershipLinks(
  graph: ContentGraph,
  node: KbNode,
  direction: Direction,
): OwnershipLink[] {
  const { parent, proofs, remarks } = kbOwnership(graph, node)
  const links: OwnershipLink[] = []

  const add = (child: KbNode, direction: Direction, ordinal?: number) => {
    const href = urlForKbNode(child)
    // Only an owner-less remark has no URL, and it is neither a parent nor a child
    // of anything — the check is the type's, and a dropped link beats a broken one.
    if (!href) return
    const label = kbNodeLabel(graph, child)
    links.push({
      href,
      direction,
      label: ordinal
        ? formatLocaleLabel(child.locale, 'kbOwnershipSibling', { index: ordinal, label })
        : label,
      title: child.title,
    })
  }

  if (direction === 'up') {
    if (parent) add(parent, 'up')
  } else {
    for (const siblings of [proofs, remarks]) {
      siblings.forEach((child, i) => add(child, 'down', siblings.length > 1 ? i + 1 : undefined))
    }
  }

  return links
}

/**
 * One half of an entity's ownership chain (§6.1): the link up to what owns it, above
 * the page's label, or the links down to what it owns, below the body.
 *
 * **The two halves are in two places, and each is where the reader needs it.** The
 * chain used to be one list under the q.e.d., parent link included; the parent is now
 * read before the body rather than after it, because on a proof or a remark page the
 * label is the whole of the page's name — "BIZONYÍTÁS" says nothing about which
 * theorem is being proved, and a reader who has to reach the end of the proof to find
 * out has read it without knowing what it was about. So the up-link leads the header
 * and only the down-links stay below.
 *
 * Plain links, not menu items (D4). Two consequences the menu version could not
 * have: several proofs need no "go to the first one" fallback, because a list simply
 * has more entries; and the chain is in the served HTML, where a crawler reads it as
 * the ownership graph it is.
 *
 * An empty half renders nothing rather than an empty box — which is every definition
 * and theorem header (they have no owner), every remark's body half (a remark owns
 * nothing, §6.5), and the 48 definitions and one theorem with no children at all.
 * The parent link duplicates the last-but-one breadcrumb by design: the breadcrumb is
 * where the page sits, this is the chain the page belongs to, and a crawler that
 * ignores the header still finds it.
 */
export default function OwnershipLinks({ node, placement = 'body' }: OwnershipLinksProps) {
  const graph = getContentGraph()
  const links = ownershipLinks(graph, node, placement === 'header' ? 'up' : 'down')
  if (links.length === 0) return null

  return (
    <ul className={placement === 'header' ? styles.parent : styles.links}>
      {links.map((link) => (
        // Keyed on the URL: one page per node, so it is unique where the label,
        // shared by every proof and every remark, is not.
        <li key={link.href} className={styles.item}>
          <Link href={link.href} className={styles.link}>
            <span className={styles.arrow} aria-hidden="true">{ARROW[link.direction]}</span>
            <span className={styles.direction}>
              {getLocaleLabel(node.locale, DIRECTION_LABEL[link.direction])}
            </span>
            {link.label}
            {link.title && (
              <span className={styles.title}><InlineText text={link.title} /></span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
