import { getContainerSegment } from './config'

/**
 * The single place a locale-prefixed public URL is constructed. Every internal
 * link, breadcrumb, sitemap entry, canonical/hreflang tag, and redirect target
 * must go through this — no component should string-concatenate `/{locale}/...`
 * by hand. Centralizing it makes cross-locale link bugs structurally hard to
 * introduce and keeps localized container segments (konyvek/fejezetek/…) out of
 * every call site.
 *
 * URL shapes (see docs/i18n-design.md §2):
 *   home        /{locale}
 *   book        /{locale}/{book}/{slug}
 *   chapter     /{locale}/{book}/{bookSlug}/{chapter}/{chapterSlug}
 *   article     /{locale}/{article}/{slug}
 *   newsletter  /{locale}/{newsletter}/{slug}
 *   landing     /{locale}/{landing}/{slug}
 *   page        /{locale}/{slug}                (no container segment)
 *   *-index     /{locale}/{container}           (listing pages)
 */
export type UrlKey =
  | 'home'
  | 'book'
  | 'chapter'
  | 'article'
  | 'newsletter'
  | 'landing'
  | 'page'
  | 'books-index'
  | 'articles-index'
  | 'newsletter-index'

export function buildLocalizedUrl(locale: string, key: UrlKey, ...slugPath: string[]): string {
  const base = `/${locale}`
  switch (key) {
    case 'home':
      return base
    case 'page':
      return `${base}/${req(slugPath, 1, key)[0]}`
    case 'book':
      return `${base}/${getContainerSegment(locale, 'book')}/${req(slugPath, 1, key)[0]}`
    case 'chapter': {
      const [bookSlug, chapterSlug] = req(slugPath, 2, key)
      return `${base}/${getContainerSegment(locale, 'book')}/${bookSlug}/${getContainerSegment(locale, 'chapter')}/${chapterSlug}`
    }
    case 'article':
      return `${base}/${getContainerSegment(locale, 'article')}/${req(slugPath, 1, key)[0]}`
    case 'newsletter':
      return `${base}/${getContainerSegment(locale, 'newsletter')}/${req(slugPath, 1, key)[0]}`
    case 'landing':
      return `${base}/${getContainerSegment(locale, 'landing')}/${req(slugPath, 1, key)[0]}`
    case 'books-index':
      return `${base}/${getContainerSegment(locale, 'book')}`
    case 'articles-index':
      return `${base}/${getContainerSegment(locale, 'article')}`
    case 'newsletter-index':
      return `${base}/${getContainerSegment(locale, 'newsletter')}`
  }
}

function req(slugPath: string[], n: number, key: UrlKey): string[] {
  if (slugPath.length !== n || slugPath.some((s) => !s)) {
    throw new Error(`buildLocalizedUrl('${key}') expects ${n} slug segment(s), got [${slugPath.join(', ')}]`)
  }
  return slugPath
}
