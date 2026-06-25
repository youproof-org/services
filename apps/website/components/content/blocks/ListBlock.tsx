import type { RefMap, TermMap } from '@/lib/content/types'
import InlineText from '../InlineText'
import styles from './list-block.module.scss'

interface ListBlockProps {
  type: 'unordered-list' | 'ordered-list'
  leadIn?: string
  items: string[]
  refs?: RefMap
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function ListBlock({ type, leadIn, items, refs, terms, termParent }: ListBlockProps) {
  const Tag = type === 'ordered-list' ? 'ol' : 'ul'
  const listClass = type === 'ordered-list' ? styles.ordered : styles.unordered

  return (
    <div className={styles.list}>
      {leadIn && (
        <p className={styles['lead-in']}>
          <InlineText text={leadIn} refs={refs} terms={terms} termParent={termParent} />
        </p>
      )}
      <Tag className={listClass}>
        {items.map((item, i) => (
          <li key={i} className={styles.item}>
            <InlineText text={item} refs={refs} terms={terms} termParent={termParent} />
          </li>
        ))}
      </Tag>
    </div>
  )
}
