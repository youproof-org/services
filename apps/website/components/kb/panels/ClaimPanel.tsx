import InlineText from '@/components/content/InlineText'
import { getContentGraph } from '@/lib/content'
import { keyForKbNode } from '@/lib/content/keys'
import { fqnJoin } from '@/lib/content/fqn'
import { getLocaleLabel } from '@/lib/i18n/config'
import { renderKatex } from '@/lib/utils/math'
import { kbRefs } from '@/lib/content/urls'
import type {
  AnchorParent,
  ClaimBlock as ClaimBlockData,
  ContentBlock,
  KbNode,
} from '@/lib/content/types'
import { BacklinkList } from './BacklinksPanel'
import styles from '../panel.module.scss'

/**
 * One selected claim, level 2 of Állítások (sub-plan §6.3, §7.2).
 *
 * The claim itself and everything that cites *that claim* rather than the entity
 * asserting it. The same shape as `TermPanel` — identity first, then the narrowed
 * list — and the same `BacklinkList`, so the three reference lists §7.2 asks for
 * are one list narrowed rather than three designs.
 *
 * **The claim is restated rather than pointed at.** It is lit in the body above,
 * which is what says which one was picked (§6.3); the restatement is what keeps the
 * panel readable once the reader has scrolled the list, since the panel's own
 * scroller moves under a pinned header and the body behind it is frozen (§6.4).
 *
 * **Why the terms in it get a scope of their own.** A claim's text can contain a
 * term, and a term renders as `<span class="term" id="…">` — rendering it a second
 * time under the body's scope would put two elements with the same id on the page,
 * which would break `#fogalmak.{slug}` as an anchor and make "which element is the
 * selection" ambiguous. `PANEL_SCOPE`'s prefix keeps the panel's copies in their own
 * namespace. They are not selectable there and nothing links to them; the ids exist
 * only because that is how a term renders.
 *
 * A server component, like every other panel content: the graph cannot cross the
 * client boundary, and §2.1 requires these rows in the served HTML.
 */

/** The anchor prefix for a term rendered inside the panel rather than in the body. */
const PANEL_PREFIX = 'kb-panel'

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
  const scope: AnchorParent = { locale: node.locale, prefix: PANEL_PREFIX }

  return (
    <>
      <div className={styles.selectionClaim}>
        <InlineText
          text={claim.content}
          refs={kbRefs(node.references)}
          terms={node.terms}
          termParent={scope}
        />
        {claim.formula && (
          <div
            className={styles.selectionFormula}
            dangerouslySetInnerHTML={{ __html: renderKatex(claim.formula, true) }}
          />
        )}
      </div>

      <h3 className={styles.selectionSubhead}>
        {getLocaleLabel(node.locale, 'kbPanelIncoming')}
      </h3>
      <BacklinkList locale={node.locale} sources={sources} />
    </>
  )
}
