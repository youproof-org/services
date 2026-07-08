import Link from 'next/link'
import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import BrandLockup from '@/components/layout/BrandLockup'
import SectionHeading from '@/components/layout/SectionHeading'
import BookCard from '@/components/book/BookCard'
import ContentRow from '@/components/content/ContentRow'
import { getContentGraph, initContentGraph, listPublished } from '@/lib/content'
import styles from './root-page.module.scss'

// ISO datetime → "YYYY. MM. DD." (deterministic; no locale dependency).
function huDate(iso?: string): string {
  if (!iso) return ''
  const parts = iso.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[0]}. ${parts[1]}. ${parts[2]}.` : ''
}

export default async function RootPage() {
  await initContentGraph()
  const graph = getContentGraph()

  const books = Array.from(graph.books.values()).filter((b) => b.published)
  const articles = listPublished(graph.articles)
  const newsletters = listPublished(graph.newsletters)

  return (
    <div className={styles.shell}>
      <SiteHeader mode="root" />

      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          {/* TODO(YP-hero-art): subtle "map" background art — placeholder for now. */}
          <div className={styles.heroBg} aria-hidden="true" />
          <BrandLockup variant="stacked" showTagline className={styles.heroLockup} />
          <p className={styles.heroTagline}>
            There is no royal road, just better maps…
          </p>
        </section>

        {/* Könyvek */}
        {books.length > 0 && (
          <section className={styles.section}>
            <SectionHeading label="Könyvek" id="konyvek" />
            <div className={styles.bookGrid}>
              {books.map((book) => {
                const chapterCount = book.parts.reduce((n, p) => n + p.chapters.length, 0)
                return (
                  <BookCard
                    key={book.name}
                    title={book.title}
                    href={`/books/${book.name}`}
                    thumbnail={book.logo}
                    meta={`${chapterCount} fejezet`}
                  />
                )
              })}
            </div>
          </section>
        )}

        {/* Legutóbbi cikkek */}
        {articles.length > 0 && (
          <section className={styles.section}>
            <SectionHeading label="Legutóbbi cikkek" id="cikkek" />
            <div className={styles.rows}>
              {articles.map((a) => (
                <ContentRow
                  key={a.name}
                  href={`/articles/${a.name}`}
                  title={a.title}
                  excerpt={a.excerpt}
                  thumbnail={a.thumbnail}
                  meta={huDate(a.publishedAt)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Hírek */}
        {newsletters.length > 0 && (
          <section className={styles.section}>
            <SectionHeading label="Hírek" id="hirek" />
            <ul className={styles.newsList}>
              {newsletters.map((n) => (
                <li key={n.name} className={styles.newsItem}>
                  <Link href={`/newsletter/${n.name}`} className={styles.newsLink}>
                    <span className={styles.newsDate}>{huDate(n.publishedAt)}</span>
                    <span className={styles.newsTitle}>{n.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
