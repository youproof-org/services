import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import ChapterPage from '@/components/content/ChapterPage'
import { getContentGraph, initContentGraph } from '@/lib/content'
import { getChapterIndex } from '@/lib/utils/index-helpers'
import type { ChapterNode } from '@/lib/content/types'
import styles from './page.module.scss'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  const params: { book: string; chapter: string }[] = []
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

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: 'Főoldal', href: '/' },
          { label: book.title, href: `/books/${bookName}` },
          {
            label: `${chapterIndex}. ${chapter.title}`,
            href: `/books/${bookName}/chapters/${chapterName}`,
          },
        ]}
      />
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
