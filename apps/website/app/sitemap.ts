import type { MetadataRoute } from 'next'
import { getContentGraph, initContentGraph, listPublished } from '@/lib/content'
import { LOCALES } from '@/lib/i18n/config'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import { absoluteUrl } from '@/lib/i18n/metadata'
import { homeUrl, urlForBook, urlForChapter, urlForStandalone } from '@/lib/content/urls'

// Enumerated from the content graph at build time and emitted as a static file.
export const dynamic = 'force-static'

// One sitemap containing every locale's URLs. Each entry is annotated with the
// hreflang alternates for the locales that actually have the item (today: just
// its own locale), matching the canonical/hreflang head tags. Adding a locale
// expands both the entry set and each entry's alternates with no code change.
// Landing pages are intentionally excluded (unlisted ad entry points).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await initContentGraph()
  const graph = getContentGraph()

  const entries: MetadataRoute.Sitemap = []

  // Self-alternate helper — today one locale, so a single-language alternate set.
  const withAlternates = (loc: string, pathname: string) => ({
    url: absoluteUrl(pathname),
    alternates: { languages: { [loc]: absoluteUrl(pathname) } },
  })

  for (const locale of LOCALES) {
    entries.push(withAlternates(locale, homeUrl(locale)))

    for (const book of graph.books.values()) {
      if (book.locale !== locale) continue
      entries.push(withAlternates(locale, urlForBook(book)))
      for (const part of book.parts) {
        for (const chapter of part.chapters) {
          if (chapter.published) entries.push(withAlternates(locale, urlForChapter(chapter)))
        }
      }
    }

    const articles = listPublished(graph.articles).filter((a) => a.locale === locale)
    if (articles.length > 0) entries.push(withAlternates(locale, buildLocalizedUrl(locale, 'articles-index')))
    for (const a of articles) entries.push(withAlternates(locale, urlForStandalone(a)))

    const newsletters = listPublished(graph.newsletters).filter((n) => n.locale === locale)
    if (newsletters.length > 0) entries.push(withAlternates(locale, buildLocalizedUrl(locale, 'newsletter-index')))
    for (const n of newsletters) entries.push(withAlternates(locale, urlForStandalone(n)))

    for (const p of listPublished(graph.pages).filter((p) => p.locale === locale)) {
      entries.push(withAlternates(locale, urlForStandalone(p)))
    }
  }

  return entries
}
