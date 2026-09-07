import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/i18n/metadata'

// Reads SITE_ENV at build time and bakes the result into the static export.
export const dynamic = 'force-static'

// Generated into the static export as `out/robots.txt`.
//
// Only production (`SITE_ENV === 'production'`) is crawlable. Anything else —
// staging, previews, or an unset/misspelled SITE_ENV — disallows everything, so
// only an explicit SITE_ENV === 'production' can ever be exposed to indexing.
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.SITE_ENV === 'production'

  if (!isProduction) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    // The `*.txt` files are Next's RSC payloads: a second, complete copy of every
    // page's content, fetched only by a client-side navigation and linked from
    // nothing. Keeping them out of a crawl costs a reader nothing and removes
    // ~21 MiB of duplicate content. The pattern nominally covers `robots.txt`
    // itself, which is harmless — a crawler fetches it before it has any rules to
    // apply — and the sitemaps are `.xml`.
    rules: { userAgent: '*', allow: ['/'], disallow: ['/*.txt'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
