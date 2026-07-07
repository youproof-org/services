import type { Metadata } from 'next'
import { Mulish } from 'next/font/google'
import 'katex/dist/katex.min.css'
import './globals.scss'
import DevContentReloader from '@/components/DevContentReloader'

const mulish = Mulish({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-mulish',
  display: 'swap',
})

// Only production is indexable. Anything else — staging, previews, or a missing
// SITE_ENV — emits noindex, so only an explicit SITE_ENV === 'production' can
// ever expose the site to search engines.
const isProduction = process.env.SITE_ENV === 'production'

export const metadata: Metadata = {
  title: 'YOUPROOF',
  description: 'Alice és Bob matematikai kalandjai',
  ...(isProduction ? {} : { robots: { index: false, follow: false } }),
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hu" className={mulish.variable}>
      <body className={mulish.className}>
        {children}
        {process.env.NODE_ENV === 'development' && <DevContentReloader />}
      </body>
    </html>
  )
}
