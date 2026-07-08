import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import BookIndex from '@/components/book/BookIndex'
import { getContentGraph, initContentGraph } from '@/lib/content'
import { getBookRomanIndex } from '@/lib/utils/index-helpers'

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
      <main>
        <BookIndex book={book} episode={episode} />
      </main>
    </>
  )
}
