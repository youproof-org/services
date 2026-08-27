import Link from 'next/link'
import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { glossaryRows, type GlossaryRow } from '@/lib/content/glossary-rows'
import { formatLocaleLabel, getLocaleLabel } from '@/lib/i18n/config'
import ListFilter from './ListFilter'
import styles from './glossary-page.module.scss'

interface GlossaryPageProps {
  locale: string
}

/**
 * The text the filter matches a row on: everything the row shows. A synonym row
 * therefore also matches the canonical form it names, and every row matches the
 * title of the node it comes from — which is what "the filter matches row text"
 * means once a row has more than one part.
 */
function filterTextFor(row: GlossaryRow): string {
  const parts = row.isCanonical ? [row.name] : [row.name, row.canonical]
  parts.push(row.ownerTitle)
  return parts.join(' ')
}

/**
 * Glossary body: every name in the knowledge base in one Hungarian-alphabetical
 * run, each linking to the anchor on the node that introduces the term (§4).
 *
 * The list is server-rendered in full, always. It is the crawler's view and the
 * no-JavaScript view, and the filter above it narrows what is already here rather
 * than producing any of it (§2.1, §4).
 *
 * Three things a row carries, and why:
 *
 *   - **The name is the link.** Only the name, not the whole row, so the anchor text
 *     a crawler reads is the term and nothing else.
 *   - **A synonym row names its canonical form**, because it lands the reader on a
 *     term titled with a different word and without saying so the destination looks
 *     wrong (§4).
 *   - **Every row names its source node.** Names are not unique — "összeadás" is
 *     three rows pointing at three different definitions — so without the source the
 *     reader has no way to tell them apart, and it is what the root page's Fogalmak
 *     card promises the page shows.
 *
 * Both counts come from the same two labels that card uses, so the two pages cannot
 * end up advertising different numbers.
 *
 * **No alphabetical section markers.** §4 makes them conditional on surviving the
 * filter, and they do not: the filter hides rows and knows nothing else about them,
 * so a heading whose entire run is filtered out would sit over nothing unless the
 * shared component grew a notion of groups. The two names that begin with inline
 * LaTeX have no initial to file under that would not be invented. A running head
 * costs more than it gives here.
 */
export default function GlossaryPage({ locale }: GlossaryPageProps) {
  const graph = getContentGraph()
  const rows = glossaryRows(graph.glossary)

  return (
    <>
      <h1 className={styles.title}>{getLocaleLabel(locale, 'glossary')}</h1>
      <p className={styles.count}>
        {formatLocaleLabel(locale, 'kbGlossaryCount', { count: rows.length })}
      </p>
      <p className={styles.countNote}>
        {formatLocaleLabel(locale, 'kbGlossaryCountNote', { count: graph.glossary.length })}
      </p>

      <ListFilter
        placeholder={getLocaleLabel(locale, 'kbFilterPlaceholder')}
        emptyLabel={getLocaleLabel(locale, 'kbFilterEmpty')}
        clearLabel={getLocaleLabel(locale, 'kbFilterClear')}
      >
        <ul className={styles.rows}>
          {rows.map((row, index) => (
            // Keyed on the position: the row's (owner, term, name) triple is not
            // guaranteed unique — see GlossaryRow.
            <li
              key={`${index}-${row.termKey}-${row.name}`}
              className={styles['glossary-row']}
              data-filter-text={filterTextFor(row)}
            >
              <Link href={row.href} className={styles.name}>
                <InlineText text={row.name} />
              </Link>
              <span className={styles.meta}>
                {!row.isCanonical && (
                  <span className={styles.synonymOf}>
                    <InlineText
                      text={formatLocaleLabel(locale, 'kbGlossarySynonymOf', {
                        name: row.canonical,
                      })}
                    />
                  </span>
                )}
                <span className={styles.source}>
                  <InlineText text={row.ownerTitle} />
                </span>
              </span>
            </li>
          ))}
        </ul>
      </ListFilter>
    </>
  )
}
