import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import { buildLocalizedUrl } from '@/lib/i18n/url'

// Static root redirect `/` → `/{DEFAULT_LOCALE}`. In deployed environments a
// Cloudflare zone redirect rule handles `/` at the edge (and is the seam for a
// future geo/preference-aware worker); this statically-exported page is the
// fallback for local dev and any non-Cloudflare serving of `out/`. No
// Accept-Language / geo-IP logic — a single hardcoded default-locale redirect.
export const dynamic = 'force-static'

export default function RootRedirect() {
  const target = buildLocalizedUrl(DEFAULT_LOCALE, 'home')
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${target}`} />
      <link rel="canonical" href={target} />
      <script dangerouslySetInnerHTML={{ __html: `location.replace(${JSON.stringify(target)})` }} />
      <p style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        Redirecting to <a href={target}>{target}</a>…
      </p>
    </>
  )
}
