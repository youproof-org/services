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
    //
    // `/llms.txt` is the one `.txt` meant to be read (scripts/gen-llms-txt.mjs
    // generates it into the export), so the disallow and this allow are a pair and
    // neither makes sense alone. RFC 9309 resolves the conflict by longest matching
    // path, ties going to `Allow`: `/llms.txt` is nine characters against `/*.txt`'s
    // six, so the allow wins.
    //
    // A crawler that does not implement the standard fails OPEN here, not closed.
    // `/*.txt` needs `*` support to match anything, and Next emits the `Allow` lines
    // before the `Disallow` one, so a first-match parser (Python's stdlib
    // robotparser, for one) permits everything. `/llms.txt` therefore stays reachable
    // either way; what such a crawler loses is the payload rule, which is advisory
    // duplicate-content hygiene rather than access control.
    rules: { userAgent: '*', allow: ['/', '/llms.txt'], disallow: ['/*.txt'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
