import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { sectionAnchorId, urlForChapter } from '@/lib/content/urls'
import { getChapterIndexLabel, getSectionIndexLabel } from '@/lib/utils/index-helpers'
import type { KbNode } from '@/lib/content/types'
import styles from '../panel.module.scss'

/**
 * The Kontextus panel: where in the narrative this entity is introduced — the
 * chapter, and the section inside it (sub-plan §6.4, §6.5).
 *
 * **The same rows the Bejövő hivatkozások panel shows.** A place in the book is a
 * place in the book whichever question led the reader to it, so a level here reads
 * as a backlink row does: the numbered name of the place, and the section nested
 * under the chapter that contains it — "16." over an indented "16.1.". The numbers
 * come from `lib/utils/index-helpers.ts`, the one place that decides which section
 * is 16.1., so this panel and a backlink row cannot disagree about it.
 *
 * The book is not a level. Nesting is what says where the entity sits, and the two
 * containers that carry a number are what the reader recognizes; the book above them
 * is the same book for all 537 entities and is a click away up the chapter's page.
 *
 * **No empty state, by construction.** Every one of the entities is embedded
 * exactly once, and a node that is embedded nowhere gets no page at all
 * (`kbPageExists`), so the item is on every entity page and the panel always has
 * something to show. A missing embedding here is not a case to render — it is the
 * page existing when it should not, so it throws rather than degrading quietly.
 *
 * A server component, and it has to be: the graph is a cyclic object graph that
 * cannot cross the client boundary, so the levels are resolved here and the panel
 * shell receives finished markup. That is also what puts them in the served HTML,
 * which §2.1 requires of exactly this content — the embedding is one of the edges
 * of the knowledge graph this ticket exists to expose.
 *
 * The links are ordinary links and navigate away (§6.4). The section's is the
 * chapter's URL plus the section's anchor, the same href a backlink row to a
 * section uses (`backlinkRowFor` in lib/content/graph.ts).
 */

interface ContextPanelProps {
  node: KbNode
}

interface ContextLevel {
  href: string
  label: string
}

export default function ContextPanel({ node }: ContextPanelProps) {
  const graph = getContentGraph()
  const embedding = graph.embedding.get(keyForKbNode(node))
  if (!embedding) {
    throw new Error(
      `${node.type} '${node.name}' is embedded nowhere, so it has no context to show ` +
        '— a node without an embedding should have no page either (kbPageExists).',
    )
  }

  const { chapter, section } = embedding
  const chapterUrl = urlForChapter(chapter)
  const levels: ContextLevel[] = [
    { href: chapterUrl, label: `${getChapterIndexLabel(chapter)} ${chapter.title}` },
  ]
  // Absent only for a prologue/epilogue embed, which no content has today (§6.5).
  // The chapter alone then, rather than a level with nothing behind it.
  if (section) {
    levels.push({
      href: `${chapterUrl}#${sectionAnchorId(section)}`,
      label: `${getSectionIndexLabel(section)} ${section.title}`,
    })
  }

  return <ContextLevels levels={levels} depth={0} />
}

/**
 * One level and, inside its own `<li>`, the level below it.
 *
 * Nested lists rather than one flat list with an indent per position, for the
 * reason `BacklinkLevel` nests: the containment is then in the served HTML a
 * crawler reads (§2.1), and the indent is one rule about nesting instead of a
 * position the stylesheet has to enumerate.
 */
function ContextLevels({ levels, depth }: { levels: readonly ContextLevel[]; depth: number }) {
  const [level, ...rest] = levels
  if (!level) return null
  return (
    <ul className={depth === 0 ? styles.context : styles.contextNested}>
      <li className={styles.contextLevel}>
        <Link href={level.href} className={styles.contextLink} data-context-depth={depth}>
          <InlineText text={level.label} />
        </Link>
        {rest.length > 0 && <ContextLevels levels={rest} depth={depth + 1} />}
      </li>
    </ul>
  )
}
