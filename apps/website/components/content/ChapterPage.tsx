import { Fragment } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleLeft, faAngleRight } from '@fortawesome/free-solid-svg-icons'
import type { BookNode, ChapterNode } from '@/lib/content/types'
import { getContentGraph } from '@/lib/content'
import { getChapterIndex, buildChapterEmbedIndices, buildChapterFigureIndices, getBookRomanIndex } from '@/lib/utils/index-helpers'
import ContentBlocks from './ContentBlocks'
import SectionView from './SectionView'
import BookReference from './BookReference'
import NewsletterForm from '@/components/newsletter/NewsletterForm'
import { midContentIndex } from '@/lib/newsletter/placement'
import { urlForChapter } from '@/lib/content/urls'
import styles from './chapter-page.module.scss'

/**
 * Takes the resolved nodes, not their names.
 *
 * It used to take `bookName`/`chapterName` and look the book up with a
 * hand-assembled map key. The caller had already resolved both nodes, so the lookup
 * was redundant — and when the graph's keys changed shape it silently returned
 * undefined, so every chapter rendered as an empty shell: no type error, no failing
 * test, because the key is just a string. Passing the nodes removes the failure mode
 * rather than correcting the key.
 */
interface ChapterPageProps {
  book: BookNode
  chapter: ChapterNode
}

export default function ChapterPage({ book, chapter }: ChapterPageProps) {
  const graph = getContentGraph()

  const chapterIndex = getChapterIndex(chapter)
  const embedIndices = buildChapterEmbedIndices(graph, chapter, chapterIndex)
  const figureIndices = buildChapterFigureIndices(graph, chapter, chapterIndex)
  const chapterRefs = chapter.references
  const bookRomanIndex = getBookRomanIndex(book, graph)

  const allChapters = book.parts.flatMap(p => p.chapters)
  const currentIdx = allChapters.indexOf(chapter)
  const prevChapter = currentIdx > 0 ? allChapters[currentIdx - 1] : null
  const nextChapter = currentIdx < allChapters.length - 1 ? allChapters[currentIdx + 1] : null

  return (
    <article className={styles.chapter}>
      <BookReference book={book} bookRomanIndex={bookRomanIndex} />
      <header className={styles['chapter-header']}>
        <p className={styles['chapter-label']}>{chapterIndex}. fejezet</p>
        <h1 className={styles['chapter-title']}>{chapter.title}</h1>
      </header>

      {chapter.abstract.length > 0 && (
        <section className={styles.abstract}>
          <ContentBlocks blocks={chapter.abstract} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" />
        </section>
      )}

      {chapter.prerequisiteWarning && chapter.prerequisiteWarning.length > 0 && (
        <section className={styles.prereq}>
          <ContentBlocks
            blocks={chapter.prerequisiteWarning}
            embedIndices={embedIndices} figureIndices={figureIndices}
            refs={chapterRefs}
            context="web"
          />
        </section>
      )}

      {chapter.prologue.length > 0 && (
        <section className={styles.prologue}>
          <ContentBlocks blocks={chapter.prologue} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" dropCapFirst />
        </section>
      )}

      {(() => {
        const midIndex = midContentIndex(chapter.sections.length)
        return chapter.sections.map((section, i) => (
          <Fragment key={section.name}>
            {i === midIndex && (
              <NewsletterForm locale={chapter.locale} placement="mid-content" />
            )}
            <SectionView
              slug={section.slug}
              locale={section.locale}
              title={section.title}
              body={section.body}
              label={`${chapterIndex}.${i + 1}`}
              embedIndices={embedIndices} figureIndices={figureIndices}
              refs={section.references}
            />
          </Fragment>
        ))
      })()}

      {chapter.epilogue.length > 0 && (
        <section className={styles.epilogue}>
          <ContentBlocks blocks={chapter.epilogue} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" />
        </section>
      )}

      <nav className={styles['chapter-nav']}>
        {prevChapter ? (
          <Link
            href={urlForChapter(prevChapter)}
            className={styles['chapter-nav-btn']}
          >
            <FontAwesomeIcon icon={faAngleLeft} width={8} /> Előző
          </Link>
        ) : (
          <span />
        )}
        {nextChapter && (
          <Link
            href={urlForChapter(nextChapter)}
            className={`${styles['chapter-nav-btn']} ${styles['chapter-nav-btn--next']}`}
          >
            Következő <FontAwesomeIcon icon={faAngleRight} width={8} />
          </Link>
        )}
      </nav>
    </article>
  )
}
