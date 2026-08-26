import { Fragment } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleLeft, faAngleRight } from '@fortawesome/free-solid-svg-icons'
import type { ChapterNode } from '@/lib/content/types'
import { getContentGraph } from '@/lib/content'
import { getChapterIndex, buildChapterEmbedIndices, buildChapterFigureIndices, getBookRomanIndex } from '@/lib/utils/index-helpers'
import ContentBlocks from './ContentBlocks'
import SectionView from './SectionView'
import BookReference from './BookReference'
import NewsletterForm from '@/components/newsletter/NewsletterForm'
import { midContentIndex } from '@/lib/newsletter/placement'
import { urlForChapter } from '@/lib/content/urls'
import styles from './chapter-page.module.scss'

interface ChapterPageProps {
  bookName: string
  chapterName: string
}

export default function ChapterPage({ bookName, chapterName }: ChapterPageProps) {
  const graph = getContentGraph()
  const book = graph.books.get(`/books/${bookName}`)
  if (!book) return null

  let chapter: ChapterNode | undefined
  for (const part of book.parts) {
    chapter = part.chapters.find(c => c.name === chapterName)
    if (chapter) break
  }
  if (!chapter) return null

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
