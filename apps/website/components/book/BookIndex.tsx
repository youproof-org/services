import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { partAnchorId } from '@/lib/content/urls'
import { faQuestion } from '@fortawesome/free-solid-svg-icons'
import type { BookNode } from '@/lib/content/types'
import ContentBlocks from '@/components/content/ContentBlocks'
import ContentRow from '@/components/content/ContentRow'
import BookReference from '@/components/content/BookReference'
import { getChapterIndex } from '@/lib/utils/index-helpers'
import { toRoman } from '@/lib/utils/roman'
import { urlForChapter } from '@/lib/content/urls'
import styles from './book-index.module.scss'

interface BookIndexProps {
  book: BookNode
  episode: string // roman numeral, e.g. "I"
}

// Series (book) index page, per §3.1: headline lockup, questions box, Kivonat,
// Tartalom grouped by part, Felhasznált irodalom. Inline cross-references are
// out of scope, so `abstract` renders via ContentBlocks with refs undefined.
export default function BookIndex({ book, episode }: BookIndexProps) {
  return (
    <div className={styles.index}>
      {/* 1. Headline — same lockup as the chapter-page book reference, but not
          a link (this is the book's own page). */}
      <BookReference book={book} bookRomanIndex={episode} linked={false} />


      {/* 2. Questions box — curiosity-sparking teasers */}
      {book.teaser && book.teaser.items.length > 0 && (
        <div className={styles.teaser}>
          <ul>
            {book.teaser.items.map((q, i) => (
              <li key={i}>
                <FontAwesomeIcon icon={faQuestion} className={styles.teaserIcon} />
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. Kivonat (abstract) */}
      {book.abstract.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Kivonat</h2>
          <div className={styles.prose}>
            <ContentBlocks blocks={book.abstract} context="web" dropCapFirst />
          </div>
        </section>
      )}

      {/* 4. Tartalom (table of contents), grouped by part */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Tartalom</h2>
        {book.parts.map((part, i) => (
          <div key={part.name} id={partAnchorId(part)} className={styles.part}>
            <h3 className={styles.partTitle}>
              <span className={styles.partNumber}>{toRoman(i + 1)}.</span> {part.title}
            </h3>
            <div className={styles.rows}>
              {part.chapters.map((ch) => (
                <ContentRow
                  key={ch.name}
                  href={urlForChapter(ch)}
                  title={ch.title}
                  excerpt={ch.excerpt}
                  thumbnail={ch.thumbnail}
                  meta={`${getChapterIndex(ch)}. fejezet`}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* 5. Felhasznált irodalom (bibliography) */}
      {book.bibliography && book.bibliography.items.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Felhasznált irodalom</h2>
          <ol className={styles.bibliography}>
            {book.bibliography.items.map((ref, i) => (
              <li key={i}>{ref}</li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
