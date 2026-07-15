import Link from 'next/link'
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb'
import BrandLockup from './BrandLockup'
import SiteNav from './SiteNav'
import HeaderHeightProbe from './HeaderHeightProbe'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import styles from './site-header.module.scss'

export type HeaderMode = 'root' | 'inner' | 'minimal'

interface SiteHeaderProps {
  // 'root'    — homepage: lockup + nav + search, no breadcrumb row.
  // 'inner'   — content pages: lockup + nav + search + breadcrumb row.
  // 'minimal' — landing pages: brand lockup only (no nav/search/breadcrumb).
  mode?: HeaderMode
  breadcrumbs?: BreadcrumbItem[]
  locale?: string
}

export default function SiteHeader({ mode = 'inner', breadcrumbs, locale = DEFAULT_LOCALE }: SiteHeaderProps) {
  const navLinks = [
    { label: 'Cikkek', href: buildLocalizedUrl(locale, 'articles-index') },
    { label: 'Hírek', href: buildLocalizedUrl(locale, 'newsletter-index') },
  ]
  return (
    <header className={styles.header}>
      <HeaderHeightProbe />
      <div className={styles.topRow}>
        <Link href={buildLocalizedUrl(locale, 'home')} className={styles.brand} aria-label="youproof.org">
          <BrandLockup
            variant="horizontal"
            showTagline
            locale={locale}
            className={styles.lockup}
          />
        </Link>
        {mode !== 'minimal' && <SiteNav links={navLinks} />}
      </div>
      {mode === 'inner' && breadcrumbs && breadcrumbs.length > 0 && (
        <div className={styles.breadcrumbRow}>
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}
    </header>
  )
}
