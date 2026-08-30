import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { compareHu } from '@/lib/content/collate'
import { kbNodeLabel, kbNodeTitle, kbPageExists } from '@/lib/content/graph'
import { urlForKbNode } from '@/lib/content/urls'
import { formatLocaleLabel, getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import type { ContentGraph, DefinitionNode, TheoremNode } from '@/lib/content/types'
import ListFilter from './ListFilter'
import styles from './kb-type-index-page.module.scss'

// One design, two instances: the definitions index and the theorems index differ
// only in the node type they list.
export type KbIndexType = 'definition' | 'theorem'

interface KbTypeIndexPageProps {
  locale: string
  type: KbIndexType
}

/**
 * Everything that differs between the two instances, in one table — the node set,
 * the page's name, and the wording of its count. §5 asks that the two pages differ
 * only where the content genuinely does, and this is the whole of that difference:
 * below this table there is one page.
 *
 * The count label is the root page's own (`kb-root-page`), not a second one saying
 * the same thing differently: this page and the card linking to it must not
 * advertise different numbers or different words for them (§3).
 */
const INDEXES: Record<
  KbIndexType,
  {
    nodes: (graph: ContentGraph) => ReadonlyMap<string, DefinitionNode | TheoremNode>
    nameKey: LabelKey
    countKey: LabelKey
  }
> = {
  definition: {
    nodes: (graph) => graph.definitions,
    nameKey: 'definitionsIndex',
    countKey: 'kbDefinitionsCount',
  },
  theorem: {
    nodes: (graph) => graph.theorems,
    nameKey: 'theoremsIndex',
    countKey: 'kbTheoremsCount',
  },
}

/** One line of the index: the title that leads it, and the label that follows. */
interface IndexRow {
  href: string
  title: string
  label: string
}

/**
 * The rows of one index, in Hungarian title order.
 *
 * Gated on `kbPageExists` and on this locale, which is what the root page's card
 * counts — so the number here and the number there are the same number, and a row
 * is never a link to a page this environment did not generate.
 *
 * `kbNodeTitle`, not `node.title`: every definition and theorem carries an authored
 * title today (84/84 and 191/191, measured), so the fallback cannot fire — but an
 * untitled node authored tomorrow would otherwise sort under the empty string, at
 * the very top of the list, which is the one place a reader will not think to look.
 * The helper puts it under its label instead.
 */
function indexRows(
  graph: ContentGraph,
  nodes: ReadonlyMap<string, DefinitionNode | TheoremNode>,
  locale: string,
): IndexRow[] {
  const rows: IndexRow[] = []
  for (const node of nodes.values()) {
    if (node.locale !== locale || !kbPageExists(graph, node)) continue
    const href = urlForKbNode(node)
    // Only a remark can be without a URL, so this never drops a row here; the
    // check is the type's, and a row dropped silently would be the count
    // disagreeing with the root card's.
    if (!href) continue
    rows.push({ href, title: kbNodeTitle(graph, node), label: kbNodeLabel(graph, node) })
  }
  // No two titles collide today (84 and 191, all distinct — measured), but nothing
  // in the content model forbids it, and the label breaks the tie so the order of a
  // future pair is theirs rather than the map's insertion order.
  return rows.sort((a, b) => compareHu(a.title, b.title) || compareHu(a.label, b.label))
}

/**
 * Definitions/theorems index body: one line per node, the whole set, in Hungarian
 * title order, with the filter above it (§5).
 *
 * A lookup table, not a reading surface. So: the **title leads**, because it is what
 * the reader came knowing; the **label follows it in grey**, because "15.6. Tétel"
 * answers where the node sits in the book rather than which node it is. No preview
 * line — a mechanically-taken first sentence of a theorem is usually a fragment of
 * LaTeX (§5) — which is what makes a row one line and the page scannable.
 *
 * The label trails the title after a separator instead of being right-aligned into
 * its own column (§5 leaves the choice open). Titles here run 5 to 79 characters,
 * median 20 on the definitions and 37 on the theorems (measured), and a right-
 * aligned column at that spread leaves most rows with a gap between the title and
 * its label — which needs leader dots to stay readable and makes a lookup table
 * into a table of contents. Trailing keeps the pair together at every width, and a
 * title long enough to fill the line simply wraps its label onto the next one.
 *
 * Like the glossary, the list is server-rendered in full — the crawler's view and
 * the no-JavaScript view — and the filter narrows what is already here (§2.1).
 */
export default function KbTypeIndexPage({ locale, type }: KbTypeIndexPageProps) {
  const graph = getContentGraph()
  const index = INDEXES[type]
  const rows = indexRows(graph, index.nodes(graph), locale)

  return (
    <>
      <h1 className={styles.title}>{getLocaleLabel(locale, index.nameKey)}</h1>

      <ListFilter
        placeholder={getLocaleLabel(locale, 'kbFilterPlaceholder')}
        emptyLabel={getLocaleLabel(locale, 'kbFilterEmpty')}
        clearLabel={getLocaleLabel(locale, 'kbFilterClear')}
        count={
          // Served with the true count in it; the filter rewrites the number from
          // the same template while a query narrows the list.
          <p className={styles.count} data-filter-count={getLocaleLabel(locale, index.countKey)}>
            {formatLocaleLabel(locale, index.countKey, { count: rows.length })}
          </p>
        }
      >
        <ul className={styles.rows}>
          {rows.map((row) => (
            // Keyed on the URL: one page per node, so it is unique where the title
            // is not.
            <li key={row.href} className={styles['index-row']} data-filter-text={row.title}>
              <Link href={row.href} className={styles.name}>
                <InlineText text={row.title} />
              </Link>
              <span className={styles.label}>{row.label}</span>
            </li>
          ))}
        </ul>
      </ListFilter>
    </>
  )
}
