import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import SectionHeading from '@/components/layout/SectionHeading'
import ContentRow from './ContentRow'
import { huDate } from '@/lib/utils/format-date'
import type { StandaloneNode } from '@/lib/content/types'
import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import { urlForStandalone } from '@/lib/content/urls'
import styles from './standalone-index.module.scss'

interface StandaloneIndexProps {
  title: string
  items: StandaloneNode[]
  breadcrumbs: BreadcrumbItem[]
  locale: string
}

// Minimal listing page for the article/newsletter indexes: header + one listing
// section of ContentRow boxes + footer.
export default function StandaloneIndex({ title, items, breadcrumbs, locale }: StandaloneIndexProps) {
  return (
    <div className="book-shell">
      <SiteHeader mode="inner" breadcrumbs={breadcrumbs} locale={locale} />
      <main className={styles.main}>
        <SectionHeading label={title} />
        {items.length > 0 ? (
          <div className={styles.rows}>
            {items.map((n) => (
              <ContentRow
                key={n.name}
                href={urlForStandalone(n)}
                title={n.title}
                excerpt={n.excerpt}
                thumbnail={n.thumbnail}
                meta={huDate(n.publishedAt)}
              />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Egyelőre nincs tartalom.</p>
        )}
      </main>
      <SiteFooter locale={locale} />
    </div>
  )
}
