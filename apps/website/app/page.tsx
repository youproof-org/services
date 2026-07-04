import SiteFooter from '@/components/layout/SiteFooter'
import BookCard from '@/components/book/BookCard'
import { getContentGraph, initContentGraph } from '@/lib/content'
import styles from './root-page.module.scss'

export default async function RootPage() {
  // Ensure the graph is built in export prerender workers (idempotent).
  await initContentGraph()
  const graph = getContentGraph()
  const books = Array.from(graph.books.values())

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/youproof-logo.png"
            alt="YouProof logo"
            style={{ objectFit: 'contain' }}
            loading="lazy"
            width={80}
            height={80}
          />
          <span className={styles['brand-name']}>
            <span style={{ fontWeight: 300 }}>YOU</span>
            <span style={{ fontWeight: 700 }}>PROOF</span>
          </span>
        </div>

        <div className={styles.books}>
          {books.map((book) => (
            <BookCard
              key={book.name}
              name={book.name}
              title={book.title}
              href={`/books/${book.name}`}
            />
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
