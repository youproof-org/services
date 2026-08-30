import { kbPageExists } from './graph'
import { glossaryRows } from './glossary-rows'
import {
  urlForDefinitionsIndex,
  urlForTheoremsIndex,
  urlForGlossary,
} from './urls'
import { formatLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import type { ContentGraph, KbNode } from './types'

/**
 * The three ways into the knowledge base — Definíciók, Tételek, Fogalmak — derived
 * once, for every place that offers them: the knowledge-base root page and the
 * locale homepage's entry block. Two renderings of one card set, so the set itself
 * lives here and neither of them can quietly disagree with the other about what
 * the knowledge base contains.
 *
 * A card is a name and a number and nothing else (sub-plan §3): the name is a label
 * key rather than a string, so the caller resolves it in its own locale, and the
 * number is already formatted because the sentence around it belongs to the
 * dictionary.
 */
export interface KbSectionCard {
  href: string
  nameKey: LabelKey
  count: string
}

/**
 * How many nodes of one type this environment actually gives a page to, in this
 * locale. The count has to come from `kbPageExists` — the same predicate the entity
 * routes and the glossary projection are gated on — so that a card cannot advertise
 * a number the page it links to contradicts (§3). Measured: 84 definitions and 191
 * theorems locally, 63 and 136 on a deployed build, the difference being the nodes
 * embedded in unpublished chapters.
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
 * Fogalmak's number is the ROW count — canonical forms plus synonyms, 341 of them —
 * because that is what the glossary page itself lists and the one the reader can
 * check against it. The 217 terms those rows name are counted on the glossary page.
 *
 * The glossary is not filtered by locale, because a `GlossaryEntry` has no locale of
 * its own; it is derived from `graph.glossary`, exactly as the glossary page's own
 * count is, which is the agreement that matters.
 */
export function kbSectionCards(graph: ContentGraph, locale: string): KbSectionCard[] {
  return [
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
      count: formatLocaleLabel(locale, 'kbGlossaryCount', {
        count: glossaryRows(graph.glossary).length,
      }),
    },
  ]
}
