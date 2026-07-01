import type { ContentBlock, RefMap } from '@/lib/content/types'
import InlineText from './InlineText'
import ContentBlocks from './ContentBlocks'
import styles from './section-view.module.scss'

interface SectionViewProps {
  name: string
  title: string
  body: ContentBlock[]
  label: string              // "n.k" e.g. "11.3"
  embedIndices: Record<string, string>
  figureIndices?: Map<object, string>
  refs?: RefMap
}

export default function SectionView({ name, title, body, label, embedIndices, figureIndices, refs }: SectionViewProps) {
  return (
    <section id={name} className={styles.section}>
      <h3 className={styles.heading}>
        <span className={styles['section-label']}>{label}</span>
        <InlineText text={title} />
      </h3>
      <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} context="web" />
    </section>
  )
}
