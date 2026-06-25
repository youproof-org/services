import Link from 'next/link'
import styles from './book-card.module.scss'

interface BookCardProps {
  name: string
  title: string
  href: string
}

export default function BookCard({ name, title, href }: BookCardProps) {
  return (
    <Link href={href} className={styles.link}>
      <div className={styles.card}>
        <p className={styles.label}>Könyv</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{name}</p>
      </div>
    </Link>
  )
}
