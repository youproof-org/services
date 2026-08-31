import type { ContentBlock, RefMap, TermMap, AnchorParent } from '@/lib/content/types'
import InlineText from '../InlineText'
import ContentBlocks from '../ContentBlocks'
import styles from './subsection-block.module.scss'

interface SubsectionBlockProps {
  title: string
  blocks: ContentBlock[]
  embedIndices?: Record<string, string>
  figureIndices?: Map<object, string>
  refs?: RefMap
  context: 'web' | 'latex'
  terms?: TermMap
  termParent?: AnchorParent
}

export default function SubsectionBlock({ title, blocks, embedIndices, figureIndices, refs, context, terms, termParent }: SubsectionBlockProps) {
  return (
    <div className={styles.subsection}>
      <h4 className={styles.heading}>
        <InlineText text={title} />
      </h4>
      <ContentBlocks blocks={blocks} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} context={context} terms={terms} termParent={termParent} />
    </div>
  )
}
