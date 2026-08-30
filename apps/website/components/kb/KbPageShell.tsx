import type { ReactNode } from 'react'
import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import styles from './kb-page-shell.module.scss'

interface KbPageShellProps {
  locale: string
  breadcrumbs: BreadcrumbItem[]
  children: ReactNode
}

// The shell every knowledge-base page sits in: the inner-page header with its
// breadcrumb row, the page body as <main>, the pre-footer newsletter form, and the
// site footer (sub-plan §2). Same shape as StandaloneRoute/StandaloneIndex, minus
// the thumbnail hero — a knowledge-base page has no hero, so `main` carries its own
// width and padding instead of the `.page-content` overlap those routes use.
//
// The newsletter form is SiteFooter's `withNewsletter` (default true), which is
// where it lives for every other content page; it renders above the footer, at the
// bottom of the main area.
export default function KbPageShell({ locale, breadcrumbs, children }: KbPageShellProps) {
  return (
    <div className="book-shell">
      <SiteHeader mode="inner" breadcrumbs={breadcrumbs} locale={locale} />
      <main className={styles.main}>{children}</main>
      <SiteFooter locale={locale} />
    </div>
  )
}
