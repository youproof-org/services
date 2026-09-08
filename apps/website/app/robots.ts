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
    // Everything is crawlable, with no rule for Next's per-page `*.txt` RSC payloads.
    // Those are a second copy of every page's prose (59 MiB in the export, 4.4 MiB
    // gzipped) and they were disallowed for exactly that reason, but nothing publishes
    // their URLs: no `<a>`, no `<link rel="prefetch">`, no sitemap entry, and not even a
    // literal in the framework JS, which appends `.txt` to a pathname at navigation
    // time. Reaching one means driving the client router or guessing the path. So the
    // rule insured against an unlikely crawl, and it cost a real bug — `/*.txt` matched
    // `/robots.txt` too, so this file disallowed itself, and an Ahrefs audit reported it
    // inaccessible and crawled nothing while that was true.
    //
    // If payload indexing ever does turn up in a report, the tool for it is
    // `X-Robots-Tag: noindex` on `*.txt` from the response-header ruleset in
    // infra/cloudflare/terraform/zone/response-headers.tf: it stops indexing without
    // blocking access, and it cannot lock out the file that carries the rule.
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
