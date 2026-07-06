import type { MetadataRoute } from 'next'
import { getContentGraph, initContentGraph } from '@/lib/content'

// Enumerated from the content graph at build time and emitted as a static file.
export const dynamic = 'force-static'

const SITE_URL = 'https://youproof.org'

// Generated into the static export as `out/sitemap.xml`. Lists the home page,
// every book, and every PUBLISHED chapter (unpublished chapters are stubs and
// must not be advertised for indexing). Referenced by the production
// robots.txt; harmless on staging, which is noindex/disallow-all anyway.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await initContentGraph()
  const graph = getContentGraph()

  const entries: MetadataRoute.Sitemap = [{ url: `${SITE_URL}/` }]

  for (const book of graph.books.values()) {
    entries.push({ url: `${SITE_URL}/books/${book.name}` })
    for (const part of book.parts) {
      for (const chapter of part.chapters) {
        if (chapter.published) {
          entries.push({
            url: `${SITE_URL}/books/${book.name}/chapters/${chapter.name}`,
          })
        }
      }
    }
  }

  return entries
}
