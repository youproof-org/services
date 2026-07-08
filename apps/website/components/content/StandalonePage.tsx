import type { StandaloneNode } from '@/lib/content/types'
import ContentBlocks from './ContentBlocks'
import SectionView from './SectionView'
import { huDate } from '@/lib/utils/format-date'
import styles from './standalone-page.module.scss'

interface StandalonePageProps {
  node: StandaloneNode
}

// Renderer for standalone content (article/newsletter/page/landing). Mirrors the
// chapter body structure but without book context. Inline cross-references and
// entity embeds are out of scope, so blocks render with refs undefined and empty
// embed indices.
export default function StandalonePage({ node }: StandalonePageProps) {
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        {node.publishedAt && <p className={styles.date}>{huDate(node.publishedAt)}</p>}
        <h1 className={styles.title}>{node.title}</h1>
      </header>

      {node.abstract.length > 0 && (
        <section className={styles.abstract}>
          <ContentBlocks blocks={node.abstract} embedIndices={{}} context="web" />
        </section>
      )}

      {node.prologue.length > 0 && (
        <ContentBlocks blocks={node.prologue} embedIndices={{}} context="web" dropCapFirst />
      )}

      {node.sections.map((section, i) => (
        <SectionView
          key={section.name}
          name={section.name}
          title={section.title}
          body={section.body}
          label={`${i + 1}.`}
          embedIndices={{}}
        />
      ))}

      {node.epilogue.length > 0 && (
        <ContentBlocks blocks={node.epilogue} embedIndices={{}} context="web" />
      )}
    </article>
  )
}
