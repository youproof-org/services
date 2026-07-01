import { notFound } from 'next/navigation'
import SiteHeader from '@/components/layout/SiteHeader'
import BookToc from '@/components/book/BookToc'
import { getContentGraph, initContentGraph } from '@/lib/content'

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
  const graph = getContentGraph()
  const book = graph.books.get(`/books/${bookName}`)
  if (!book) notFound()

  return (
    <>
      <SiteHeader
        breadcrumbs={[
          { label: 'Főoldal', href: '/' },
          { label: book.title, href: `/books/${bookName}` },
        ]}
      />
      <main className="page-content">
        <BookToc
          bookName={book.name}
          bookTitle={book.title}
          parts={book.parts.map(part => ({
            name: part.name,
            title: part.title,
            chapters: part.chapters.map(ch => ({ name: ch.name, title: ch.title })),
          }))}
        />
      </main>
    </>
  )
}
