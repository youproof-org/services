import type { RefMap, TermMap } from '@/lib/content/types'
import InlineText from '../InlineText'
import styles from './narrative-block.module.scss'

interface NarrativeBlockProps {
  content: string
  refs?: RefMap
  dropCap?: boolean
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function NarrativeBlock({ content, refs, dropCap, terms, termParent }: NarrativeBlockProps) {
  return (
    <p className={`${styles.paragraph}${dropCap ? ` ${styles['drop-cap']}` : ''}`}>
      <InlineText text={content.trim()} refs={refs} terms={terms} termParent={termParent} />
    </p>
  )
}
