import type { RefMap, TermMap } from '@/lib/content/types'
import InlineText from '../InlineText'
import styles from './quote-block.module.scss'

interface QuoteBlockProps {
  leadIn?: string
  quote: string
  author?: string
  refs?: RefMap
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function QuoteBlock({ leadIn, quote, author, refs, terms, termParent }: QuoteBlockProps) {
  return (
    <figure className={styles.quote}>
      {leadIn && (
        <p className={styles['lead-in']}>
          <InlineText text={leadIn} refs={refs} terms={terms} termParent={termParent} />
        </p>
      )}
      <div className={styles['quote-body']}>
        <blockquote className={styles.blockquote}>
          <InlineText text={quote} refs={refs} terms={terms} termParent={termParent} />
        </blockquote>
        {author && <figcaption className={styles.author}>{author}</figcaption>}
      </div>
    </figure>
  )
}
