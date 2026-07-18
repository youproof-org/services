import type { StandaloneNode } from '@/lib/content/types'
import ContentBlocks from './ContentBlocks'
import SectionView from './SectionView'
import { huDate } from '@/lib/utils/format-date'
import styles from './chapter-page.module.scss'

interface StandalonePageProps {
  node: StandaloneNode
}

// Renderer for standalone content (article/newsletter/page/landing). Shares the
// chapter's styling (chapter-page.module.scss) for a consistent reading
// experience — minus the book-specific chrome (no BookReference, no chapter
// number, no prev/next nav). The chapter-number label is replaced by the date.
// Inline cross-references and entity embeds are out of scope, so blocks render
// with refs undefined and empty embed indices.
export default function StandalonePage({ node }: StandalonePageProps) {
  return (
    <article className={styles.chapter}>
      <header className={styles['chapter-header']}>
        {node.publishedAt && (
          <p className={styles['chapter-label']}>{huDate(node.publishedAt)}</p>
        )}
        <h1 className={styles['chapter-title']}>{node.title}</h1>
      </header>

      {node.abstract.length > 0 && (
        <section className={styles.abstract}>
          <ContentBlocks blocks={node.abstract} embedIndices={{}} context="web" />
        </section>
      )}

      {node.prologue.length > 0 && (
        <section className={styles.prologue}>
          <ContentBlocks blocks={node.prologue} embedIndices={{}} context="web" dropCapFirst />
        </section>
      )}

      {node.sections.map((section, i) => (
        <SectionView
          key={section.name}
          slug={section.slug}
          title={section.title}
          body={section.body}
          label={`${i + 1}.`}
          embedIndices={{}}
        />
      ))}

      {node.epilogue.length > 0 && (
        <section className={styles.epilogue}>
          <ContentBlocks blocks={node.epilogue} embedIndices={{}} context="web" />
        </section>
      )}
    </article>
  )
}
