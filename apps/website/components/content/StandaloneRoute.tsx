import SiteHeader, { type HeaderMode } from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import StandalonePage from './StandalonePage'
import NotMigratedStub from './NotMigratedStub'
import UnavailableStub from './UnavailableStub'
import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import type { StandaloneNode } from '@/lib/content/types'
import styles from './standalone-route.module.scss'

// Unpublished standalone items render a stub only on the deployed environments
// (mirrors the chapter route). Locally (SITE_ENV unset) they render normally so
// authors can preview drafts.
const isDeployedEnv =
  process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'

interface StandaloneRouteProps {
  node: StandaloneNode
  breadcrumbs?: BreadcrumbItem[]
  mode?: HeaderMode
}

// Shared shell for the article/newsletter/page/landing detail routes: header
// (mode-specific) + content-or-stub + footer.
export default function StandaloneRoute({ node, breadcrumbs, mode = 'inner' }: StandaloneRouteProps) {
  const showStub = !node.published && isDeployedEnv

  // Always render a hero: the thumbnail when present (real content only), else a
  // fixed-height placeholder. Both give the `.page-content` `-200px` overlap
  // something to pull over so the content never slides under the sticky header.
  const hero =
    !showStub && node.thumbnail ? (
      <div className={styles.thumbnail}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={node.thumbnail.src}
          alt={node.thumbnail.alt}
          style={{ objectFit: 'cover' }}
          loading="lazy"
          width="100%"
          height="100%"
        />
      </div>
    ) : (
      <div className="hero-placeholder" aria-hidden="true" />
    )

  return (
    <div className="book-shell">
      <SiteHeader mode={mode} breadcrumbs={breadcrumbs} />
      {hero}
      <main className="page-content">
        {showStub ? (
          node.legacyPath ? (
            <NotMigratedStub legacyPath={node.legacyPath} />
          ) : (
            <UnavailableStub />
          )
        ) : (
          <StandalonePage node={node} />
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
