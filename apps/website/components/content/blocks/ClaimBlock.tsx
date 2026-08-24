import type { RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import { claimAnchorId } from '@/lib/content/urls'
import { renderKatex } from '@/lib/utils/math'
import InlineText from '../InlineText'
import styles from './claim-block.module.scss'

interface ClaimBlockProps {
  index: number
  name: string
  slug?: string
  content: string
  formula?: string
  refs?: RefMap
  parent?: AnchorParent
  terms?: TermMap
  termParent?: AnchorParent
}

export default function ClaimBlock({ index, name, slug, content, formula, refs, parent, terms, termParent }: ClaimBlockProps) {
  // The owning node supplies the locale for the anchor prefix, so a claim outside
  // one (which the content model does not produce) simply gets no anchor rather
  // than an unlocalized guess.
  const id = parent ? claimAnchorId(parent, { name, slug }) : undefined
  return (
    <div id={id} className={styles.claim}>
      <span className={styles.index}>{index}.</span>
      <div className={styles.content}>
        <InlineText text={content} refs={refs} terms={terms} termParent={termParent} />
        {formula && (
          <div
            className={styles.formula}
            dangerouslySetInnerHTML={{ __html: renderKatex(formula, true) }}
          />
        )}
      </div>
    </div>
  )
}
