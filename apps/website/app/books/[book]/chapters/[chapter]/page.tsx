import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import ChapterPage from '@/components/content/ChapterPage'
import NotMigratedStub from '@/components/content/NotMigratedStub'
import UnavailableStub from '@/components/content/UnavailableStub'
import { getContentGraph, initContentGraph } from '@/lib/content'
import { getChapterIndex } from '@/lib/utils/index-helpers'
import type { ChapterNode } from '@/lib/content/types'
import styles from './page.module.scss'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  const params: { book: string; chapter: string }[] = []
  // Enumerate EVERY chapter, published or not, so every referenced chapter
  // path resolves to a real static page (unpublished ones render a stub).
  for (const book of graph.books.values()) {
    for (const part of book.parts) {
      for (const chapter of part.chapters) {
        params.push({ book: book.name, chapter: chapter.name })
      }
    }
  }
  return params
}

interface ChapterPageRouteProps {
  params: Promise<{ book: string; chapter: string }>
}

export default async function ChapterPageRoute({ params }: ChapterPageRouteProps) {
  const { book: bookName, chapter: chapterName } = await params
  // Static-export prerender workers don't share the instrumentation-initialised
  // graph singleton, so ensure it's built here (idempotent — no-op if ready).
  await initContentGraph()
  const graph = getContentGraph()

  const book = graph.books.get(`/books/${bookName}`)
  if (!book) notFound()

  let chapter: ChapterNode | undefined
  for (const part of book.parts) {
    chapter = part.chapters.find(c => c.name === chapterName)
    if (chapter) break
  }
  if (!chapter) notFound()

  const chapterIndex = getChapterIndex(chapter)

  const breadcrumbs = [
    { label: 'Főoldal', href: '/' },
    { label: book.title, href: `/books/${bookName}` },
    {
      label: `${chapterIndex}. ${chapter.title}`,
      href: `/books/${bookName}/chapters/${chapterName}`,
    },
  ]

  // Unpublished chapters still get a static page (so internal links resolve),
  // but show a stub instead of the real content.
  if (!chapter.published) {
    return (
      <>
        <SiteHeader breadcrumbs={breadcrumbs} />
        <main className="page-content">
          {chapter.legacyPath
            ? <NotMigratedStub legacyPath={chapter.legacyPath} />
            : <UnavailableStub />}
        </main>
      </>
    )
  }

  return (
    <>
      <SiteHeader breadcrumbs={breadcrumbs} />
      {chapter.thumbnail && (
        <div className={styles.thumbnail}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={chapter.thumbnail.src}
            alt={chapter.thumbnail.alt}
            style={{ objectFit: 'cover' }}
            loading="lazy"
            width='100%'
            height='100%'
          />
        </div>
      )}
      <main className="page-content">
        <ChapterPage bookName={bookName} chapterName={chapterName} />
      </main>
    </>
  )
}
