import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faHouse } from '@fortawesome/free-solid-svg-icons'
import styles from './breadcrumb.module.scss'

export interface BreadcrumbItem {
  label: string
  href: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
      <ol>
        {items.map((item, i) => (
          <li key={item.href} className={styles.item}>
            {i > 0 && <span className={styles.separator}>/</span>}
            {i < items.length - 1 ? (
              <Link href={item.href} className={styles.link}>
                {item.href === '/' ? <FontAwesomeIcon icon={faHouse} width={14} /> : item.label}
              </Link>
            ) : (
              <span className={styles.current}>{item.href === '/' ? <FontAwesomeIcon icon={faHouse} width={14} /> : item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
