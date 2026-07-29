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

// Wordmark font (brand lockup only — body/UI stays Mulish): Google Sans, which
// isn't in this next version's next/font/google metadata. It is self-hosted rather
// than embedded from fonts.googleapis.com — that embed sent every visitor's IP to
// Google on every page view. scripts/gen-wordmark-font.mjs subsets the bundled OFL
// face to the siteName glyphs at build time; app/globals.scss declares the
// @font-face and the --font-wordmark var that consumes it.

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
        {/* The wordmark face is same-origin, but it's only discovered after the
            stylesheet parses; preload so the lockup doesn't flash in Mulish. */}
        <link
          rel="preload"
          href="/assets/generated/google-sans-wordmark.otf"
          as="font"
          type="font/otf"
          crossOrigin="anonymous"
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
