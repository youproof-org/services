import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { faFacebookF } from '@fortawesome/free-brands-svg-icons'
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb'
import styles from './site-header.module.scss'

interface SiteHeaderProps {
  breadcrumbs: BreadcrumbItem[]
}

export default function SiteHeader({ breadcrumbs }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles['top-row']}>
          <Link href="/" className={styles.brand}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/youproof-logo.png"
              alt="YouProof logo"
              style={{ objectFit: 'contain' }}
              loading="lazy"
              width={36}
              height={36}
            />
            <span className={styles['brand-name']}>
              <span style={{ fontWeight: 300 }}>YOU</span>
              <span style={{ fontWeight: 700 }}>PROOF</span>
            </span>
          </Link>
          <nav className={styles.menu}>
            <button className={styles['menu-btn']} aria-label="Search">
              <FontAwesomeIcon icon={faMagnifyingGlass} width={18} />
            </button>
            <a
              href="https://www.facebook.com/youproof.hu"
              target="_blank"
              rel="noopener noreferrer"
              className={styles['menu-btn']}
              aria-label="Facebook"
            >
              <FontAwesomeIcon icon={faFacebookF} width={12} />
            </a>
          </nav>
        </div>
      </div>
      <div className={styles['breadcrumb-row']}>
        <Breadcrumb items={breadcrumbs} />
      </div>
    </header>
  )
}
