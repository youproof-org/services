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

  // Stub: no hero; the message is vertically centered in the space between
  // header and footer (`.stub-main`).
  if (showStub) {
    return (
      <div className="book-shell">
        <SiteHeader mode={mode} breadcrumbs={breadcrumbs} />
        <main className="stub-main">
          {node.legacyPath ? (
            <NotMigratedStub legacyPath={node.legacyPath} />
          ) : (
            <UnavailableStub />
          )}
        </main>
        <SiteFooter />
      </div>
    )
  }

  // Real content: a hero (thumbnail when present, else a fixed-height
  // placeholder so the `.page-content` `-200px` overlap has something to pull
  // over instead of sliding under the sticky header).
  return (
    <div className="book-shell">
      <SiteHeader mode={mode} breadcrumbs={breadcrumbs} />
      {node.thumbnail ? (
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
      )}
      <main className="page-content">
        <StandalonePage node={node} />
      </main>
      <SiteFooter />
    </div>
  )
}
