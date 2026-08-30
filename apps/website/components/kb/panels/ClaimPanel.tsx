import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { fqnJoin } from '@/lib/content/fqn'
import { getLocaleLabel } from '@/lib/i18n/config'
import type { ClaimBlock as ClaimBlockData, ContentBlock, KbNode } from '@/lib/content/types'
import { BacklinkList } from './BacklinksPanel'
import styles from '../panel.module.scss'

/**
 * One selected claim, level 2 of Állítások (sub-plan §6.3, §7.2).
 *
 * Everything that cites *that claim* rather than the entity asserting it, under the
 * number the body prints in front of it — which is the panel's own heading
 * (`KbEntityPage`) — and rendered by the same `BacklinkList`, so the three reference
 * lists §7.2 asks for are one list narrowed rather than three designs.
 *
 * **The claim is not restated here.** The reveal lights it in the body above the
 * panel (§6.3), and the panel covers the bottom half of the screen precisely so that
 * the lit claim stays in view — a second copy of the same sentence inside the panel
 * says nothing the reader cannot already see, and pushes the references it exists to
 * show further down. This is also what keeps the page's term ids unique: a claim's
 * text can hold a term, and a term renders as `<span class="term" id="…">`, so the
 * restatement needed an anchor namespace of its own to avoid a duplicate id.
 *
 * A server component, like every other panel content: the graph cannot cross the
 * client boundary, and §2.1 requires these rows in the served HTML.
 */

/**
 * The claims of a node that `ContentBlocks` gives an anchor and a number.
 *
 * Top level only, and filtered by render context, because that is exactly the set:
 * a claim nested in a subsection is handed no `parentEntity` and renders with no id,
 * and a `latex`-only block renders not at all. A claim outside this list can never
 * be selected — the selection IS the element's id (§6.3) — and has no number to be
 * named by either.
 *
 * One list, two callers, on purpose: `KbEntityPage` builds a panel per claim from it
 * and numbers them, and `ReferencePanel` numbers a claim on ANOTHER node from it, so
 * "3. állítás" in a reference panel is the claim that node's body prints a 3 in
 * front of. Two copies of the filter could disagree about which claim that is.
 */
export function webClaims(node: KbNode): ClaimBlockData[] {
  return node.body.filter(
    (block): block is Extract<ContentBlock, { type: 'claim' }> =>
      block.type === 'claim' && (!block.context || block.context === 'web'),
  )
}

interface ClaimPanelProps {
  node: KbNode
  claim: ClaimBlockData
}

export default function ClaimPanel({ node, claim }: ClaimPanelProps) {
  const graph = getContentGraph()
  const entityFqn = keyForKbNode(node)
  // The string `buildBacklinkIndex` counted under: the asserting entity plus the
  // claim step, built through the grammar's own joiner.
  const target = fqnJoin(entityFqn, 'claim', claim.name)
  const sources = graph.backlinks.get(entityFqn)?.byTarget.get(target) ?? []

  return (
    <>
      <h3 className={styles.selectionSubhead}>
        {getLocaleLabel(node.locale, 'kbPanelIncoming')}
      </h3>
      <BacklinkList locale={node.locale} sources={sources} target={target} />
    </>
  )
}
