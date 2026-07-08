import Link from 'next/link'
import styles from './section-heading.module.scss'

interface SectionHeadingProps {
  label: string
  // Optional anchor id (e.g. "konyvek") so nav links can scroll here.
  id?: string
  // Optional "Összes" link target. Unused on the homepage at launch (item
  // counts are low) — kept for when a section needs an all-items link.
  href?: string
}

export default function SectionHeading({ label, id, href }: SectionHeadingProps) {
  return (
    <div className={styles.heading} id={id}>
      <h2 className={styles.label}>{label}</h2>
      {href && (
        <Link href={href} className={styles.all}>
          Összes
        </Link>
      )}
    </div>
  )
}
