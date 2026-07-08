import Link from 'next/link'
import styles from './content-row.module.scss'

interface ContentRowProps {
  href: string
  title: string
  // Short card copy (from the item's dedicated `excerpt` field). Optional —
  // the row degrades to thumbnail + title when absent.
  excerpt?: string
  thumbnail?: { src: string; alt: string }
  // Small meta line above the title (e.g. a date or "3. fejezet").
  meta?: string
}

// Full-width horizontal listing box: square thumbnail on the left, title +
// excerpt on the right. Shared by the homepage articles section, the
// /articles + /newsletter index pages, and the book-index chapter listing.
export default function ContentRow({ href, title, excerpt, thumbnail, meta }: ContentRowProps) {
  return (
    <Link href={href} className={styles.row}>
      <div className={styles.thumb} aria-hidden={!thumbnail}>
        {thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail.src} alt={thumbnail.alt} loading="lazy" />
        )}
      </div>
      <div className={styles.body}>
        {meta && <p className={styles.meta}>{meta}</p>}
        <h3 className={styles.title}>{title}</h3>
        {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
      </div>
    </Link>
  )
}
