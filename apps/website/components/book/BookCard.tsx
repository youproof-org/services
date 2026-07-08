import Link from 'next/link'
import styles from './book-card.module.scss'

interface BookCardProps {
  title: string
  href: string
  thumbnail?: { src: string; alt: string }
  // Meta line, e.g. "27 fejezet".
  meta?: string
}

export default function BookCard({ title, href, thumbnail, meta }: BookCardProps) {
  return (
    <Link href={href} className={styles.link}>
      <div className={styles.card}>
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
        </div>
      </div>
    </Link>
  )
}
