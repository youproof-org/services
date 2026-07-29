import type { Metadata } from 'next'
import { Mulish } from 'next/font/google'
import { config } from '@fortawesome/fontawesome-svg-core'
import '@fortawesome/fontawesome-svg-core/styles.css'
import 'katex/dist/katex.min.css'
import './globals.scss'

// FontAwesome injects its sizing CSS at runtime (client-side) by default, so
// icons paint at their native (huge) size for a frame before hydration — the
// hero scroll-cue "flash of oversized arrow" (YP-122 item 5b). Import the core
// CSS statically instead and disable the runtime injection.
config.autoAddCss = false
import DevContentReloader from '@/components/DevContentReloader'
import NewsletterLanding from '@/components/newsletter/NewsletterLanding'
import { DEFAULT_LOCALE, getLocaleConfig } from '@/lib/i18n/config'
import {
  SITE_URL,
  OG_IMAGE_DEFAULT,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
} from '@/lib/i18n/metadata'

const mulish = Mulish({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mulish',
  display: 'swap',
})

// Wordmark / hero-tagline font (brand lockup only — body/UI stays Mulish).
// Google Sans isn't in this next version's next/font/google metadata, so it's
// loaded via the Google Fonts <link> embed in <head> below and consumed through
// the --font-wordmark CSS var (defined in globals.scss) — swappable in one place.

// Only production is indexable. Anything else — staging, previews, or a missing
// SITE_ENV — emits noindex, so only an explicit SITE_ENV === 'production' can
// ever expose the site to search engines.
const isProduction = process.env.SITE_ENV === 'production'

// Site-wide metadata. Per-page routes override title/description/openGraph via
// generateMetadata (buildPageMeta, per-locale); this is the baseline for pages
// that don't (root redirect, not-found). The root layout is above the [locale]
// segment and can't read the locale, so it uses the DEFAULT_LOCALE's brand —
// correct for the default-locale root/404. metadataBase makes relative OG/image
// URLs absolute.
const defaultCfg = getLocaleConfig(DEFAULT_LOCALE)

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: defaultCfg.brand,
  description: defaultCfg.defaultDescription,
  openGraph: {
    type: 'website',
    siteName: defaultCfg.siteName,
    locale: defaultCfg.ogLocale,
    url: SITE_URL,
    title: defaultCfg.brand,
    description: defaultCfg.defaultDescription,
    images: [{ url: OG_IMAGE_DEFAULT, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT }],
  },
  ...(isProduction ? {} : { robots: { index: false, follow: false } }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={DEFAULT_LOCALE} className={mulish.variable}>
      <head>
        {/* Google Sans (wordmark). Not available via next/font/google in this
            next version, so embedded directly; React hoists these into <head>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Google+Sans:ital,opsz,wght@0,17..18,400..700;1,17..18,400..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={mulish.className}>
        {children}
        <NewsletterLanding />
        {process.env.NODE_ENV === 'development' && <DevContentReloader />}
      </body>
    </html>
  )
}
