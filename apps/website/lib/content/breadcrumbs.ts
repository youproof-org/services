import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import { getLocaleLabel } from '@/lib/i18n/config'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import { homeUrl } from './urls'

/**
 * The crumbs that are not a page's own: the site root and the two standalone index
 * pages. Every chain on the site starts with one of these, and the knowledge-base
 * chains in `kb-breadcrumbs.ts` build on them, so the label comes from the locale
 * dictionary and the href from the URL helpers in exactly one place.
 */

export const homeCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'home'),
  href: homeUrl(locale),
})

export const articlesIndexCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'articlesIndex'),
  href: buildLocalizedUrl(locale, 'articles-index'),
})

export const newsletterIndexCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'newsletterIndex'),
  href: buildLocalizedUrl(locale, 'newsletter-index'),
})
