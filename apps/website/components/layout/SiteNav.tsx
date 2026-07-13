'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faXmark } from '@fortawesome/free-solid-svg-icons'
import styles from './site-nav.module.scss'

export interface NavLink {
  label: string
  href: string
}

// Primary nav. Collapses behind a hamburger < 640px. Client component for the
// toggle. Links are locale-resolved by SiteHeader and passed in.
export default function SiteNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.nav}>
      <ul className={`${styles.links} ${open ? styles.open : ''}`}>
        {links.map((link) => (
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
