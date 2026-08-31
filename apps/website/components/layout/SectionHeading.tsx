import Link from 'next/link'
import styles from './section-heading.module.scss'

interface SectionHeadingProps {
  label: string
  // Optional target for the heading text itself, for a section whose title is the
  // way into a larger part of the site (the homepage's knowledge-base block).
  labelHref?: string
  // Optional anchor id (e.g. "articles") so scroll cues / links can target it.
  id?: string
  // Optional "Összes" link target. Unused on the homepage at launch (item
  // counts are low) — kept for when a section needs an all-items link.
  href?: string
}

export default function SectionHeading({ label, labelHref, id, href }: SectionHeadingProps) {
  return (
    <div className={styles.heading} id={id}>
      <h2 className={styles.label}>
        {labelHref ? (
          <Link href={labelHref} className={styles.labelLink}>
            {label}
          </Link>
        ) : (
          label
        )}
      </h2>
      {href && (
        <Link href={href} className={styles.all}>
          Összes
        </Link>
      )}
    </div>
  )
}
