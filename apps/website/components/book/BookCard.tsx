import Link from 'next/link'
import styles from './book-card.module.scss'

interface BookCardProps {
  title: string
  href: string
  thumbnail?: { src: string; alt: string }
  // Meta line, e.g. "27 fejezet".
  meta?: string
}

// A book box (not a link itself): thumbnail + title/meta + an "Elolvasom" CTA
// that is the only link, pointing to the book's index page.
export default function BookCard({ title, href, thumbnail, meta }: BookCardProps) {
  return (
    <div className={styles.card}>
      {/* Print-availability strip across the top of the card. Shown on every
          book for now; a per-book print-edition flag is deferred (item 6). */}
      <p className={styles.printBadge}>Hamarosan nyomtatott formában is!</p>
      <div className={styles.thumb} aria-hidden={!thumbnail}>
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail.src} alt={thumbnail.alt} loading="lazy" />
        )}
      </div>
      <div className={styles.body}>
        <p className={styles.label}>Könyv</p>
        <h3 className={styles.title}>{title}</h3>
        {meta && <p className={styles.meta}>{meta}</p>}
        <Link href={href} className={styles.readButton}>
          Elolvasom
        </Link>
      </div>
    </div>
  )
}
