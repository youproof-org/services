import Link from 'next/link'
import { getContentGraph, initContentGraph, listAll } from '@/lib/content'
import { urlForStandalone } from '@/lib/content/urls'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import styles from './site-footer.module.scss'

interface SiteFooterProps {
  locale?: string
}

// Footer legal/custom links are the `page` items (§2.1 / §7), fetched from the
// content graph so new pages appear automatically. Scoped to the current
// `locale` and routed through buildLocalizedUrl (via urlForStandalone) so the
// hrefs are locale-prefixed (`/hu/impresszum`, not `/impresszum`). Includes
// unmigrated pages (no published-at) — they link to a not-migrated stub, like
// unmigrated articles/chapters — so the legal links are always present.
export default async function SiteFooter({ locale = DEFAULT_LOCALE }: SiteFooterProps) {
  await initContentGraph()
  const graph = getContentGraph()

  const pages = listAll(graph.pages)
    .filter((p) => p.locale === locale)
    .map((p) => ({ label: p.title, href: urlForStandalone(p) }))

  const version = process.env.YOUPROOF_VERSION ?? 'UNDEFINED'

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        {pages.length > 0 && (
          <nav className={styles.menu}>
            <ul>
              {pages.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <p className={styles.copyright}>© 2026 youproof.org — Minden jog fenntartva</p>
        <p className={styles.version}>v{version}</p>
      </div>
    </footer>
  )
}
