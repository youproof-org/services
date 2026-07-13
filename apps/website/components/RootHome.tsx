import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faAngleDown } from '@fortawesome/free-solid-svg-icons'
import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import BrandLockup from '@/components/layout/BrandLockup'
import SectionHeading from '@/components/layout/SectionHeading'
import BookCard from '@/components/book/BookCard'
import ContentRow from '@/components/content/ContentRow'
import { getContentGraph, listAll, listPublished } from '@/lib/content'
import { urlForBook, urlForStandalone } from '@/lib/content/urls'
import styles from '@/app/root-page.module.scss'

// ISO datetime → "YYYY. MM. DD." (deterministic; no locale dependency).
function huDate(iso?: string): string {
  if (!iso) return ''
  const parts = iso.slice(0, 10).split('-')
  return parts.length === 3 ? `${parts[0]}. ${parts[1]}. ${parts[2]}.` : ''
}

// A labelled scroll-down affordance (label above a bouncing chevron) that jumps
// to the next full-height section.
function ScrollCue({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className={styles.scrollDown} aria-label={label}>
      <span className={styles.scrollLabel}>{label}</span>
      <FontAwesomeIcon icon={faAngleDown} />
    </a>
  )
}

// Locale homepage (rendered at /{locale}). Links are built from each node's own
// locale + slug via the shared URL helpers.
export default function RootHome({ locale }: { locale: string }) {
  const graph = getContentGraph()

  const books = Array.from(graph.books.values()).filter((b) => b.published && b.locale === locale)
  // Articles include unmigrated items (no published-at): they still list here
  // and link to a not-migrated stub, like unmigrated chapters in a book's TOC.
  const articles = listAll(graph.articles).filter((a) => a.locale === locale)
  const newsletters = listPublished(graph.newsletters).filter((n) => n.locale === locale)

  return (
    <div className={styles.shell}>
      <SiteHeader mode="root" locale={locale} />

      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          {/* "Map"-like hero background art (see .heroBg in root-page.module.scss). */}
          <div className={styles.heroBg} aria-hidden="true" />
          <BrandLockup variant="stacked" showTagline className={styles.heroLockup} />
          <p className={styles.heroTagline}>
            There is no royal road, just better maps…
          </p>
          <ScrollCue href="#books" label="Tovább" />
        </section>

        {/* Könyvek — full-height, centered, no title */}
        {books.length > 0 && (
          <section id="books" className={styles.booksSection}>
            <div className={styles.bookGrid}>
              {books.map((book) => {
                const chapterCount = book.parts.reduce((n, p) => n + p.chapters.length, 0)
                return (
                  <BookCard
                    key={book.name}
                    title={book.title}
                    href={urlForBook(book)}
                    thumbnail={book.thumbnail}
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
            <SectionHeading label="Legutóbbi cikkek" id="articles" />
            <div className={styles.rows}>
              {articles.map((a) => (
                <ContentRow
                  key={a.name}
                  href={urlForStandalone(a)}
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
            <SectionHeading label="Hírek" id="news" />
            <ul className={styles.newsList}>
              {newsletters.map((n) => (
                <li key={n.name} className={styles.newsItem}>
                  <Link href={urlForStandalone(n)} className={styles.newsLink}>
                    <span className={styles.newsDate}>{huDate(n.publishedAt)}</span>
                    <span className={styles.newsTitle}>{n.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <SiteFooter locale={locale} />
    </div>
  )
}
