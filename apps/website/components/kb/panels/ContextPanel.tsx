import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { sectionAnchorId, urlForBook, urlForChapter } from '@/lib/content/urls'
import type { KbNode } from '@/lib/content/types'
import styles from '../panel.module.scss'

/**
 * The Kontextus panel: where in the narrative this entity is introduced — book,
 * then chapter, then section (sub-plan §6.4, §6.5).
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
  title: string
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
    { href: urlForBook(chapter.part.book), title: chapter.part.book.title },
    { href: chapterUrl, title: chapter.title },
  ]
  // Absent only for a prologue/epilogue embed, which no content has today (§6.5).
  // Two levels then, rather than a level with nothing behind it.
  if (section) {
    levels.push({ href: `${chapterUrl}#${sectionAnchorId(section)}`, title: section.title })
  }

  return (
    <ol className={styles.context}>
      {levels.map((level) => (
        <li key={level.href} className={styles.contextLevel}>
          <Link href={level.href} className={styles.contextLink}>
            <InlineText text={level.title} />
          </Link>
        </li>
      ))}
    </ol>
  )
}
