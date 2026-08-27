import Link from 'next/link'
import { getContentGraph } from '@/lib/content'
import { kbPageExists } from '@/lib/content/graph'
import { glossaryRows } from '@/lib/content/glossary-rows'
import {
  urlForDefinitionsIndex,
  urlForTheoremsIndex,
  urlForGlossary,
} from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import type { ContentGraph, KbNode } from '@/lib/content/types'
import styles from './kb-root-page.module.scss'

interface KbRootPageProps {
  locale: string
}

// One of the three section cards: the section name, its count in words, an optional
// second count line, and its one-line description (sub-plan §3).
interface SectionCard {
  href: string
  nameKey: LabelKey
  count: string
  countNote?: string
  descriptionKey: LabelKey
}

/**
 * How many nodes of one type this environment actually gives a page to, in this
 * locale. The count has to come from `kbPageExists` — the same predicate the entity
 * routes and the glossary projection are gated on — so that the root page cannot
 * advertise a number the page it links to contradicts (§3). Measured: 84
 * definitions and 191 theorems locally, 63 and 136 on a deployed build, the
 * difference being the nodes embedded in unpublished chapters.
 */
function publishedCount(
  graph: ContentGraph,
  nodes: ReadonlyMap<string, KbNode>,
  locale: string,
): number {
  let count = 0
  for (const node of nodes.values()) {
    if (node.locale === locale && kbPageExists(graph, node)) count += 1
  }
  return count
}

/**
 * Knowledge-base root page body: the orienting paragraph and the three section
 * cards, with no listing of individual nodes — that is the index pages' job (§3).
 *
 * Fogalmak has two true counts, and the card gives both. The glance number is the
 * ROW count (341), because that is what the glossary page itself lists and the one
 * the reader can check; the term count (217) follows it as the thing those rows are
 * names of. "341 fogalom" would be false — 341 counts names, canonical forms plus
 * synonyms — and "217" alone would be the number the index visibly contradicts.
 *
 * The glossary is not filtered by locale here because a `GlossaryEntry` has no
 * locale of its own; it is derived from `graph.glossary`, exactly as the glossary
 * page's own count is, which is the agreement that matters.
 */
export default function KbRootPage({ locale }: KbRootPageProps) {
  const graph = getContentGraph()
  const glossaryTerms = graph.glossary.length
  const glossaryNames = glossaryRows(graph.glossary).length

  const cards: SectionCard[] = [
    {
      href: urlForDefinitionsIndex(locale),
      nameKey: 'definitionsIndex',
      count: formatLocaleLabel(locale, 'kbDefinitionsCount', {
        count: publishedCount(graph, graph.definitions, locale),
      }),
      descriptionKey: 'kbDefinitionsDescription',
    },
    {
      href: urlForTheoremsIndex(locale),
      nameKey: 'theoremsIndex',
      count: formatLocaleLabel(locale, 'kbTheoremsCount', {
        count: publishedCount(graph, graph.theorems, locale),
      }),
      descriptionKey: 'kbTheoremsDescription',
    },
    {
      href: urlForGlossary(locale),
      nameKey: 'glossary',
      count: formatLocaleLabel(locale, 'kbGlossaryCount', { count: glossaryNames }),
      countNote: formatLocaleLabel(locale, 'kbGlossaryCountNote', { count: glossaryTerms }),
      descriptionKey: 'kbGlossaryDescription',
    },
  ]

  return (
    <>
      <h1 className={styles.title}>{getLocaleLabel(locale, 'knowledgeBase')}</h1>
      <p className={styles.intro}>{getLocaleLabel(locale, 'kbIntro')}</p>
      <ul className={styles.cards}>
        {cards.map((card) => (
          <li key={card.href}>
            <Link href={card.href} className={styles.card}>
              <h2 className={styles.name}>{getLocaleLabel(locale, card.nameKey)}</h2>
              <p className={styles.count}>{card.count}</p>
              {card.countNote && <p className={styles.countNote}>{card.countNote}</p>}
              <p className={styles.description}>{getLocaleLabel(locale, card.descriptionKey)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
