import styles from './site-footer.module.scss'

const FOOTER_LINKS = [
  { label: 'Impresszum', href: '#' },
  { label: 'Adatkezelés', href: '#' },
  { label: 'ÁSzF', href: '#' },
]

export default function SiteFooter() {
  const version = process.env.NEXT_PUBLIC_VERSION ?? '1.0.0'

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <nav className={styles.menu}>
          <ul>
            {FOOTER_LINKS.map((link) => (
              <li key={link.label}>
                <a href={link.href} className={styles.link}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className={styles.copyright}>© 2026 YOUPROOF - Minden jog fenntartva</p>
        <p className={styles.version}>v{version}</p>
      </div>
    </footer>
  )
}
