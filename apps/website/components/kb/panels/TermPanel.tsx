import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { fqnJoin } from '@/lib/content/fqn'
import { getLocaleLabel } from '@/lib/i18n/config'
import type { KbNode, TermDefinition } from '@/lib/content/types'
import { BacklinkList } from './BacklinksPanel'
import styles from '../panel.module.scss'

/**
 * One selected term, level 2 of Fogalmak (sub-plan §6.3, §7.2).
 *
 * **What the reader is told about it.** Its canonical form, its synonyms, and
 * everything that cites *that term* rather than the entity holding it. The term is
 * already lit in the body above the panel — the reveal is what says which one was
 * picked (§6.3) — so this is the part that is not on the page: the name the term
 * has in the glossary, the other names it goes by, and who leans on it.
 *
 * **The list is `all` narrowed, not a second list.** `backlinks.byTarget` is keyed
 * by the full target name, so a reference aimed at this term is one lookup away and
 * the rows are the same rows the unfiltered Bejövő hivatkozások panel shows — the
 * same component renders them (`BacklinkList`), which is how §7.2's "all three
 * should look like one list rather than three designs" is kept true by
 * construction rather than by matching two stylesheets.
 *
 * **Identity first, then the list.** §7.2 gives the two halves and the phase gives
 * their order for both level-2 panels; putting the same half first in each is what
 * makes a term panel and a claim panel read as one design with a different subject.
 *
 * A server component, like every other panel content and for the same two reasons:
 * the graph cannot cross the client boundary, and §2.1 requires these rows in the
 * served HTML.
 */

interface TermPanelProps {
  node: KbNode
  /** The key this term has in `node.terms` — its language-independent name. */
  termKey: string
  term: TermDefinition
}

export default function TermPanel({ node, termKey, term }: TermPanelProps) {
  const graph = getContentGraph()
  const entityFqn = keyForKbNode(node)
  // The same string `buildBacklinkIndex` counted under: the owning entity's name
  // plus the term step. Built with `fqnJoin` rather than by concatenation, so the
  // container segment comes from the one place that owns the grammar.
  const target = fqnJoin(entityFqn, 'term', termKey)
  const sources = graph.backlinks.get(entityFqn)?.byTarget.get(target) ?? []
  const synonyms = term.synonyms ?? []

  return (
    <>
      {synonyms.length > 0 && (
        <p className={styles.selectionMeta}>
          <span className={styles.selectionMetaLabel}>
            {getLocaleLabel(node.locale, 'kbPanelTermSynonyms')}
          </span>{' '}
          {/*
            One line, comma-separated, because a synonym is a name and not an entry:
            the glossary already gives each of them its own row at its own letter
            (kbGlossaryCountNote), and this is the term saying which names those are.
          */}
          <InlineText text={synonyms.join(', ')} />
        </p>
      )}

      <h3 className={styles.selectionSubhead}>
        {getLocaleLabel(node.locale, 'kbPanelIncoming')}
      </h3>
      <BacklinkList locale={node.locale} sources={sources} />
    </>
  )
}
