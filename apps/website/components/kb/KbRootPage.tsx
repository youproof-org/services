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

// One of the three section cards: the section name and its count in words (sub-plan
// §3). Nothing else — see the component's note on why the descriptions went.
interface SectionCard {
  href: string
  nameKey: LabelKey
  count: string
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
 * **A card is a name and a number.** §3 also gave each card a one-line description
 * and Fogalmak a second count under its first, and the ruling is that neither earns
 * its space: the three descriptions restate what "Definíciók", "Tételek" and
 * "Fogalmak" already say to a reader who has just read `kbIntro` above them, and
 * three sentences of it push the numbers — the part of the card that is actually
 * news — down the page. The count stays, quieter than it was, because a card that
 * leads with a number reads as a statistic rather than as a way in.
 *
 * Fogalmak's number is the ROW count — canonical forms plus synonyms, 341 of them —
 * because that is what the glossary page itself lists and the one the reader can
 * check against it. The 217 terms those rows name are counted on the glossary page.
 *
 * The glossary is not filtered by locale here because a `GlossaryEntry` has no
 * locale of its own; it is derived from `graph.glossary`, exactly as the glossary
 * page's own count is, which is the agreement that matters.
 */
export default function KbRootPage({ locale }: KbRootPageProps) {
  const graph = getContentGraph()
  const glossaryNames = glossaryRows(graph.glossary).length

  const cards: SectionCard[] = [
    {
      href: urlForDefinitionsIndex(locale),
      nameKey: 'definitionsIndex',
      count: formatLocaleLabel(locale, 'kbDefinitionsCount', {
        count: publishedCount(graph, graph.definitions, locale),
      }),
    },
    {
      href: urlForTheoremsIndex(locale),
      nameKey: 'theoremsIndex',
      count: formatLocaleLabel(locale, 'kbTheoremsCount', {
        count: publishedCount(graph, graph.theorems, locale),
      }),
    },
    {
      href: urlForGlossary(locale),
      nameKey: 'glossary',
      count: formatLocaleLabel(locale, 'kbGlossaryCount', { count: glossaryNames }),
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
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
