import { readFileSync } from 'fs'
import path from 'path'
import type { MetadataRoute } from 'next'
import { getContentGraph, initContentGraph, listPublished } from '@/lib/content'
import { LOCALES } from '@/lib/i18n/config'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import { absoluteUrl } from '@/lib/i18n/metadata'
import { homeUrl, urlForBook, urlForChapter, urlForStandalone } from '@/lib/content/urls'

// Enumerated from the content graph at build time and emitted as a static file.
export const dynamic = 'force-static'

// Per-item `lastmod` = the source file's last git-commit date, produced by the
// prebuild `gen-content-lastmod.mjs` step. Keyed by `type:name`. Missing/empty
// (e.g. content dir isn't a git checkout) → no lastmod emitted. This is the
// "content last modified" hint — distinct from `published-at` (original publish).
const LASTMOD: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), '.generated', 'content-lastmod.json'), 'utf8'))
  } catch {
    return {}
  }
})()
const lastmodDate = (key: string): Date | undefined =>
  LASTMOD[key] ? new Date(LASTMOD[key]) : undefined
// Latest lastmod across a set of keys — for index pages that have no file of
// their own (use the most recently modified listed item).
const latestOf = (keys: string[]): Date | undefined => {
  const ds = keys.map((k) => LASTMOD[k]).filter(Boolean).sort()
  return ds.length ? new Date(ds[ds.length - 1]) : undefined
}

// One sitemap containing every locale's URLs. Each entry is annotated with the
// hreflang alternates for the locales that actually have the item (today: just
// its own locale), matching the canonical/hreflang head tags. Adding a locale
// expands both the entry set and each entry's alternates with no code change.
// Landing pages are intentionally excluded (unlisted ad entry points).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await initContentGraph()
  const graph = getContentGraph()

  const entries: MetadataRoute.Sitemap = []

  // Self-alternate helper (today one locale → a single-language alternate set),
  // plus an optional `lastModified`.
  const entry = (loc: string, pathname: string, lastModified?: Date) => ({
    url: absoluteUrl(pathname),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages: { [loc]: absoluteUrl(pathname) } },
  })

  for (const locale of LOCALES) {
    entries.push(entry(locale, homeUrl(locale))) // home: no single source file → no lastmod

    for (const book of graph.books.values()) {
      if (book.locale !== locale) continue
      entries.push(entry(locale, urlForBook(book), lastmodDate(`book:${book.name}`)))
      for (const part of book.parts) {
        for (const chapter of part.chapters) {
          if (chapter.published) entries.push(entry(locale, urlForChapter(chapter), lastmodDate(`chapter:${chapter.name}`)))
        }
      }
    }

    const articles = listPublished(graph.articles).filter((a) => a.locale === locale)
    if (articles.length > 0)
      entries.push(entry(locale, buildLocalizedUrl(locale, 'articles-index'), latestOf(articles.map((a) => `article:${a.name}`))))
    for (const a of articles) entries.push(entry(locale, urlForStandalone(a), lastmodDate(`article:${a.name}`)))

    const newsletters = listPublished(graph.newsletters).filter((n) => n.locale === locale)
    if (newsletters.length > 0)
      entries.push(entry(locale, buildLocalizedUrl(locale, 'newsletter-index'), latestOf(newsletters.map((n) => `newsletter:${n.name}`))))
    for (const n of newsletters) entries.push(entry(locale, urlForStandalone(n), lastmodDate(`newsletter:${n.name}`)))

    for (const p of listPublished(graph.pages).filter((p) => p.locale === locale)) {
      entries.push(entry(locale, urlForStandalone(p), lastmodDate(`page:${p.name}`)))
    }
  }

  return entries
}
