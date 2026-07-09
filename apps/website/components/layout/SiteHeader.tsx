import Link from 'next/link'
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb'
import BrandLockup from './BrandLockup'
import SiteNav from './SiteNav'
import HeaderHeightProbe from './HeaderHeightProbe'
import styles from './site-header.module.scss'

export type HeaderMode = 'root' | 'inner' | 'minimal'

interface SiteHeaderProps {
  // 'root'    — homepage: lockup + nav + search, no breadcrumb row.
  // 'inner'   — content pages: lockup + nav + search + breadcrumb row.
  // 'minimal' — landing pages: brand lockup only (no nav/search/breadcrumb).
  mode?: HeaderMode
  breadcrumbs?: BreadcrumbItem[]
}

export default function SiteHeader({ mode = 'inner', breadcrumbs }: SiteHeaderProps) {
  return (
    <header className={styles.header}>
      <HeaderHeightProbe />
      <div className={styles.topRow}>
        <Link href="/" className={styles.brand} aria-label="youproof.org">
          <BrandLockup
            variant="horizontal"
            showTagline
            className={styles.lockup}
          />
        </Link>
        {mode !== 'minimal' && <SiteNav />}
      </div>
      {mode === 'inner' && breadcrumbs && breadcrumbs.length > 0 && (
        <div className={styles.breadcrumbRow}>
          <Breadcrumb items={breadcrumbs} />
        </div>
      )}
    </header>
  )
}
