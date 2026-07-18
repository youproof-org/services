import { readFileSync } from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { getContentGraph, initContentGraph, listAll } from '@/lib/content'
import { urlForStandalone } from '@/lib/content/urls'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import styles from './site-footer.module.scss'

// Displayed version. Prefer an explicit build-time override (YOUPROOF_VERSION,
// e.g. .env.local for local dev); otherwise use the committed package.json
// version so a build without the override — notably CI — never ships
// "vUNDEFINED". Read via fs at build (this is a server component, like the
// content loader) rather than a bundled JSON import. A postbuild guard
// (scripts/check-build-version.mjs) fails the build if this ever regresses.
function resolveVersion(): string {
  if (process.env.YOUPROOF_VERSION) return process.env.YOUPROOF_VERSION
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version
  } catch {
    return 'UNDEFINED'
  }
}

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

  const version = resolveVersion()

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
