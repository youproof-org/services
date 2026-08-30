import Link from 'next/link'
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb'
import BrandLockup from './BrandLockup'
import SiteNav from './SiteNav'
import HeaderHeightProbe from './HeaderHeightProbe'
import { DEFAULT_LOCALE, getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import { buildLocalizedUrl, type UrlKey } from '@/lib/i18n/url'
import styles from './site-header.module.scss'

export type HeaderMode = 'root' | 'inner' | 'minimal'

// The primary nav, in reading order: the knowledge base leads, as it does on the
// homepage. Every label comes from the locale dictionary and every href from
// `buildLocalizedUrl`, so nothing here spells a word or a path.
const NAV_ITEMS: { labelKey: LabelKey; urlKey: UrlKey }[] = [
  { labelKey: 'knowledgeBase', urlKey: 'kb-root' },
  { labelKey: 'articlesIndex', urlKey: 'articles-index' },
  { labelKey: 'newsletterIndex', urlKey: 'newsletter-index' },
]

interface SiteHeaderProps {
  // 'root'    — homepage: lockup + nav + search, no breadcrumb row.
  // 'inner'   — content pages: lockup + nav + search + breadcrumb row.
  // 'minimal' — landing pages: brand lockup only (no nav/search/breadcrumb).
  mode?: HeaderMode
  breadcrumbs?: BreadcrumbItem[]
  locale?: string
}

export default function SiteHeader({ mode = 'inner', breadcrumbs, locale = DEFAULT_LOCALE }: SiteHeaderProps) {
  const navLinks = NAV_ITEMS.map(({ labelKey, urlKey }) => ({
    label: getLocaleLabel(locale, labelKey),
    href: buildLocalizedUrl(locale, urlKey),
  }))
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
