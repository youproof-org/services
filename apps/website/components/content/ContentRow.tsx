import Link from 'next/link'
import styles from './content-row.module.scss'

interface ContentRowProps {
  href: string
  title: string
  // Short card copy (from the item's dedicated `excerpt` field). Optional.
  excerpt?: string
  thumbnail?: { src: string; alt: string }
  // Small meta line above the title (e.g. a date or "3. fejezet").
  meta?: string
}

// Full-width listing box: a floated thumbnail with the title + excerpt flowing
// around it (the excerpt wraps beneath the image rather than being clamped).
export default function ContentRow({ href, title, excerpt, thumbnail, meta }: ContentRowProps) {
  return (
    <Link href={href} className={styles.row}>
      {thumbnail && (
        <div className={styles.thumb}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnail.src} alt={thumbnail.alt} loading="lazy" />
        </div>
      )}
      {meta && <p className={styles.meta}>{meta}</p>}
      <h3 className={styles.title}>{title}</h3>
      {excerpt && <p className={styles.excerpt}>{excerpt}</p>}
    </Link>
  )
}
