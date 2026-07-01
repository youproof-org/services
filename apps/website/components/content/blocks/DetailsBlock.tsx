import type { ContentBlock, RefMap, TermMap } from '@/lib/content/types'
import InlineText from '../InlineText'
import ContentBlocks from '../ContentBlocks'
import styles from './details-block.module.scss'

interface DetailsBlockProps {
  title?: string
  blocks: ContentBlock[]
  embedIndices?: Record<string, string>
  figureIndices?: Map<object, string>
  refs?: RefMap
  context: 'web' | 'latex'
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
}

export default function DetailsBlock({ title, blocks, embedIndices, figureIndices, refs, context, terms, termParent }: DetailsBlockProps) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        <span>
          {title
            ? <InlineText text={title} refs={refs} terms={terms} termParent={termParent} />
            : 'Részletek'}
        </span>
      </summary>
      <div className={styles.content}>
        <ContentBlocks blocks={blocks} figureIndices={figureIndices} refs={refs} context={context} terms={terms} termParent={termParent} />
      </div>
    </details>
  )
}
