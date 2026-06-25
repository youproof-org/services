import type { RefMap, TermMap } from '@/lib/content/types'
import { claimId } from '@/lib/utils/claim-id'
import { renderKatex } from '@/lib/utils/math'
import InlineText from '../InlineText'
import styles from './claim-block.module.scss'

interface ClaimBlockProps {
  index: number
  name: string
  content: string
  formula?: string
  refs?: RefMap
  parent?: { type: string; namespace: string; name: string }
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function ClaimBlock({ index, name, content, formula, refs, parent, terms, termParent }: ClaimBlockProps) {
  const id = parent ? claimId(name, parent) : undefined
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
