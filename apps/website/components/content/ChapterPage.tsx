import { Fragment } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleLeft, faAngleRight } from '@fortawesome/free-solid-svg-icons'
import type { BookNode, ChapterNode, ChapterPageNode } from '@/lib/content/types'
import { getContentGraph } from '@/lib/content'
import {
  getChapterIndex,
  getSectionIndexLabel,
  buildChapterEmbedIndices,
  buildChapterFigureIndices,
  getBookRomanIndex,
} from '@/lib/utils/index-helpers'
import ContentBlocks from './ContentBlocks'
import SectionView from './SectionView'
import BookReference from './BookReference'
import InlineText from './InlineText'
import ChapterPager from './ChapterPager'
import { urlForChapter, urlForChapterPage } from '@/lib/content/urls'
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
 *
 * Renders one page of the chapter. The header and the chapter-to-chapter nav sit
 * on every page, outside the `data-chapter-page` wrapper; inside it are this
 * page's sections, the abstract, prerequisite warning and prologue on page 1, and
 * the epilogue on the last page. Section numbers, embed and figure indices are
 * chapter-global, so a section is numbered the same whichever page it sits on.
 *
 * `ChapterPager` wraps the page and its neighbour links, and on the client joins
 * the pages into one document. Before every section but the chapter's first sits
 * an empty, hidden newsletter slot, named by the chapter-global index of the
 * section it precedes; the pager decides which slots get a form.
 */
interface ChapterPageProps {
  book: BookNode
  chapter: ChapterNode
  page: ChapterPageNode
}

export default function ChapterPage({ book, chapter, page }: ChapterPageProps) {
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

  const pageCount = chapter.pages.length
  const isFirstPage = page.index === 1
  const isLastPage = page.index === pageCount
  const prevPage = isFirstPage ? null : chapter.pages[page.index - 2]
  const nextPage = isLastPage ? null : chapter.pages[page.index]
  const pageFirstSections = chapter.pages.map((p) => chapter.sections.indexOf(p.sections[0]))

  return (
    <article className={styles.chapter} data-chapter={chapter.name} data-page-count={pageCount}>
      {prevPage && <link rel="prev" href={urlForChapterPage(chapter, prevPage.index)} />}
      {nextPage && <link rel="next" href={urlForChapterPage(chapter, nextPage.index)} />}
      <BookReference book={book} bookRomanIndex={bookRomanIndex} />
      <header className={styles['chapter-header']}>
        <p className={styles['chapter-label']}>{chapterIndex}. fejezet</p>
        <h1 className={styles['chapter-title']}>{chapter.title}</h1>
      </header>

      <ChapterPager
        chapter={chapter.name}
        locale={chapter.locale}
        page={page.index}
        pageUrls={chapter.pages.map((p) => urlForChapterPage(chapter, p.index))}
        pageFirstSections={pageFirstSections}
        sectionCount={chapter.sections.length}
        prevLink={prevPage ? <PageLink direction="prev" page={prevPage} /> : undefined}
        nextLink={nextPage ? <PageLink direction="next" page={nextPage} /> : undefined}
      >
        <div data-chapter-page={page.index}>
          {isFirstPage && chapter.abstract.length > 0 && (
            <section className={styles.abstract}>
              <ContentBlocks blocks={chapter.abstract} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" />
            </section>
          )}

          {isFirstPage && chapter.prerequisiteWarning && chapter.prerequisiteWarning.length > 0 && (
            <section className={styles.prereq}>
              <ContentBlocks
                blocks={chapter.prerequisiteWarning}
                embedIndices={embedIndices} figureIndices={figureIndices}
                refs={chapterRefs}
                context="web"
              />
            </section>
          )}

          {isFirstPage && chapter.prologue.length > 0 && (
            <section className={styles.prologue}>
              <ContentBlocks blocks={chapter.prologue} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" dropCapFirst />
            </section>
          )}

          {page.sections.map((section) => {
            const i = chapter.sections.indexOf(section)
            return (
              <Fragment key={section.name}>
                {i > 0 && <div data-newsletter-slot={i} hidden />}
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
            )
          })}

          {isLastPage && chapter.epilogue.length > 0 && (
            <section className={styles.epilogue}>
              <ContentBlocks blocks={chapter.epilogue} embedIndices={embedIndices} figureIndices={figureIndices} refs={chapterRefs} context="web" />
            </section>
          )}
        </div>
      </ChapterPager>

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

/**
 * The link to a neighbouring page of the chapter, named by that page's first
 * section rather than "next page", so it says where it leads. `ChapterPager`
 * puts it in its `<nav>` placeholder.
 */
function PageLink({ direction, page }: { direction: 'prev' | 'next'; page: ChapterPageNode }) {
  const [firstSection] = page.sections
  return (
    <a href={urlForChapterPage(page.chapter, page.index)} rel={direction}>
      <InlineText text={`${getSectionIndexLabel(firstSection)} ${firstSection.title}`} />
    </a>
  )
}
