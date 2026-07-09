'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons'
import styles from './site-nav.module.scss'

export const NAV_LINKS = [
  { label: 'Cikkek', href: '/articles' },
  { label: 'Hírek', href: '/newsletter' },
]

// Primary nav. Collapses behind a hamburger < 640px. Client component for the
// toggle.
export default function SiteNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.nav}>
      <ul className={`${styles.links} ${open ? styles.open : ''}`}>
        {NAV_LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className={styles.link} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <button
        className={`${styles.iconBtn} ${styles.hamburger}`}
        aria-label={open ? 'Menü bezárása' : 'Menü'}
        aria-expanded={open}
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <FontAwesomeIcon icon={open ? faXmark : faBars} width={18} />
      </button>
    </div>
  )
}
