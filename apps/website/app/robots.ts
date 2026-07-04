import type { MetadataRoute } from 'next'

// Reads SITE_ENV at build time and bakes the result into the static export.
export const dynamic = 'force-static'

const SITE_URL = 'https://youproof.org'

// Generated into the static export as `out/robots.txt`.
//
// Staging (`SITE_ENV === 'staging'`) → disallow everything (keeps
// staging.youproof.org out of search indexes). Anything else — including an
// unset SITE_ENV — defaults to the indexable production behavior, so a missing
// or misspelled value can NEVER accidentally block production from indexing.
export default function robots(): MetadataRoute.Robots {
  const isStaging = process.env.SITE_ENV === 'staging'

  if (isStaging) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
