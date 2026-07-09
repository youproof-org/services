import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import BookIndex from '@/components/book/BookIndex'
import { getContentGraph, initContentGraph } from '@/lib/content'
import { getBookRomanIndex } from '@/lib/utils/index-helpers'
import styles from './page.module.scss'

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  return Array.from(graph.books.values()).map(book => ({ book: book.name }))
}

interface BookPageProps {
  params: Promise<{ book: string }>
}

export default async function BookPage({ params }: BookPageProps) {
  const { book: bookName } = await params
  // See chapter route: ensure the graph is built in export prerender workers.
  await initContentGraph()
  const graph = getContentGraph()
  const book = graph.books.get(`/books/${bookName}`)
  if (!book) notFound()

  const episode = getBookRomanIndex(book, graph)

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: 'Főoldal', href: '/' },
          { label: book.title, href: `/books/${bookName}` },
        ]}
      />
      {book.thumbnail ? (
        <div className={styles.thumbnail}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={book.thumbnail.src}
            alt={book.thumbnail.alt}
            style={{ objectFit: 'cover' }}
            loading="lazy"
            width="100%"
            height="100%"
          />
        </div>
      ) : (
        <div className="hero-placeholder" aria-hidden="true" />
      )}
      <main className="page-content">
        <BookIndex book={book} episode={episode} />
      </main>
    </>
  )
}
