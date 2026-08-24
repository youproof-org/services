import type { RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import { renderKatex } from '@/lib/utils/math'
import InlineText from '../InlineText'
import styles from './formula-block.module.scss'

interface FormulaBlockProps {
  leadIn?: string
  content: string
  leadOut?: string
  refs?: RefMap
  terms?: TermMap
  termParent?: AnchorParent
}

export default function FormulaBlock({ leadIn, content, leadOut, refs, terms, termParent }: FormulaBlockProps) {
  const html = renderKatex(content, true)
  return (
    <div data-block-type="formula" className={styles.formula}>
      {leadIn && (
        <p className={styles['lead-in']}>
          <InlineText text={leadIn} refs={refs} terms={terms} termParent={termParent} />
        </p>
      )}
      <div
        className={styles.display}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {leadOut && (
        <p className={styles['lead-out']}>
          <InlineText text={leadOut} refs={refs} terms={terms} termParent={termParent} />
        </p>
      )}
    </div>
  )
}
