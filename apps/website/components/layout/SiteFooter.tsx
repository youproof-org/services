import Link from 'next/link'
import { getContentGraph, initContentGraph } from '@/lib/content'
import styles from './site-footer.module.scss'

// Footer legal/custom links are the published `page` items (§2.1 / §7). Fetched
// from the content graph so new published pages appear automatically. Ordered
// by publish date (oldest first) for a stable, deterministic order.
export default async function SiteFooter() {
  await initContentGraph()
  const graph = getContentGraph()

  const pages = Array.from(graph.pages.values())
    .filter((p) => p.published)
    .sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
    .map((p) => ({ label: p.title, href: `/${p.name}` }))

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
