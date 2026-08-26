import type { ContentBlock, RefMap } from '@/lib/content/types'
import { sectionAnchorId } from '@/lib/content/urls'
import InlineText from './InlineText'
import ContentBlocks from './ContentBlocks'
import styles from './section-view.module.scss'

interface SectionViewProps {
  // Slug + locale rather than a prebuilt id: the anchor's container segment is
  // localized, so building it needs the locale, and taking both together keeps the
  // two from drifting apart at a call site.
  slug: string
  locale: string
  title: string
  body: ContentBlock[]
  label: string              // "n.k" e.g. "11.3"
  embedIndices: Record<string, string>
  figureIndices?: Map<object, string>
  refs?: RefMap
}

export default function SectionView({ slug, locale, title, body, label, embedIndices, figureIndices, refs }: SectionViewProps) {
  return (
    <section id={sectionAnchorId({ slug, locale })} className={styles.section}>
      <h3 className={styles.heading}>
        <span className={styles['section-label']}>{label}</span>
        <InlineText text={title} />
      </h3>
      <ContentBlocks blocks={body} embedIndices={embedIndices} figureIndices={figureIndices} refs={refs} context="web" />
    </section>
  )
}
