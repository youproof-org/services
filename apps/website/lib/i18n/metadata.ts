import type { Metadata } from 'next'
import { DEFAULT_LOCALE, getLocaleConfig } from './config'
import { buildLocalizedUrl, type UrlKey } from './url'
import type { MetaInfo } from '@/lib/content/types'

// Absolute-URL base for canonical/hreflang/sitemap. Kept here so the whole app
// derives absolute URLs from one place. Derived from SITE_HOST so each
// environment self-references its own host — production emits
// https://youproof.org, staging emits https://staging.youproof.org — instead of
// every env canonicalizing to production. The deploy workflow's website job sets
// SITE_HOST per environment; falls back to the production host when unset (local
// builds), which is harmless since non-production is noindex (see robots.ts).
const SITE_HOST = process.env.SITE_HOST?.trim() || 'youproof.org'
export const SITE_URL = `https://${SITE_HOST}`

export function absoluteUrl(pathname: string): string {
  return `${SITE_URL}${pathname}`
}

// ---------------------------------------------------------------------------
// Site-wide metadata constants (one source of truth for the root layout and the
// per-page buildPageMeta helper — see the i18n doc / YP-129 plan).
// ---------------------------------------------------------------------------
// og:site_name, the <title> brand suffix, and the meta-description fallback are
// per-locale (in locales.json, read via getLocaleConfig) — a future `en` locale
// has its own tagline/description. The document <title> is `{page} | {brand}`,
// composed here in buildPageMeta (NOT a root-layout title template): the root
// layout sits above the [locale] segment and can't read the locale, so a
// template there would apply the default locale's brand to every locale.

// Generic fallback OG image (generated in Phase 4). Absolute path; metadataBase
// (set in the root layout) resolves it. 1200×630 per Facebook's recommendation.
export const OG_IMAGE_DEFAULT = '/assets/generated/og-thumbnail.jpg'
export const OG_IMAGE_WIDTH = 1200
export const OG_IMAGE_HEIGHT = 630

// OpenGraph og:type per page (standard OG object types). Chapters are treated as
// articles (confirmed in the plan); indexes/pages/landing/home are `website`;
// the book index is `book`.
export type OgType = 'website' | 'article' | 'book'

// The content-bearing subset buildPageMeta reads (structurally satisfied by
// BookNode/ChapterNode/StandaloneNode). `null` for content-less pages.
export interface PageMetaNode {
  title: string
  excerpt?: string
  publishedAt?: string
  meta?: MetaInfo
  thumbnail?: { src: string }     // presence → per-item og-thumbnail.jpg sibling exists
}

/** Convert a stored 'YYYY-MM-DD HH:MM:SS' (UTC) timestamp to ISO 8601 for OG. */
function toIsoTime(publishedAt: string): string {
  return `${publishedAt.replace(' ', 'T')}Z`
}

/**
 * Build the full per-page Metadata: <title>, meta description, canonical +
 * hreflang alternates, and the complete OpenGraph block (Facebook). Applies the
 * YP-129 fallback chain — meta overrides display text; og-specific overrides win
 * for OG only (brand/description defaults are per-locale, from locales.json):
 *   pageTitle    = meta.title            ?? node.title       ?? fallbackTitle
 *   <title>      = `${pageTitle} | ${locale.brand}`  (locale.brand if no pageTitle)
 *   description  = meta.description      ?? node.excerpt     ?? locale.defaultDescription
 *   og:title     = meta.openGraph.title  ?? pageTitle        ?? locale.brand   (no suffix)
 *   og:desc      = meta.openGraph.description ?? resolved description
 * og:url is the page's canonical absolute URL. og:image is the item's generated
 * share image (Phase 4) or the generic fallback. Next merges metadata shallowly,
 * so the whole openGraph object is returned here (not layered on the layout).
 */
export function buildPageMeta(args: {
  locale: string
  key: UrlKey
  slugPath: string[]
  ogType: OgType
  node?: PageMetaNode | null
  fallbackTitle?: string
}): Metadata {
  const { locale, key, slugPath, ogType, node, fallbackTitle } = args
  const cfg = getLocaleConfig(locale)

  // Per-item OG image: the `og-thumbnail.jpg` sibling of the item's thumbnail
  // (both generated into the same name-based dir by gen-og-images.mjs). Nodes
  // without a thumbnail fall back to the generic OG image.
  const ogImagePath = node?.thumbnail?.src
    ? node.thumbnail.src.replace(/[^/]+$/, 'og-thumbnail.jpg')
    : undefined

  // Page-specific title, then the document <title> = `{pageTitle} | {brand}`
  // (brand is per-locale). og:title stays clean (no brand suffix — the brand is
  // in og:site_name). Composed here, not via a root-layout template, so each
  // locale gets its own brand.
  const pageTitle = node?.meta?.title ?? node?.title ?? fallbackTitle
  const title = pageTitle ? `${pageTitle} | ${cfg.brand}` : cfg.brand
  const description = node?.meta?.description ?? node?.excerpt ?? cfg.defaultDescription
  const ogTitle = node?.meta?.openGraph?.title ?? pageTitle ?? cfg.brand
  const ogDescription = node?.meta?.openGraph?.description ?? description
  const url = absoluteUrl(buildLocalizedUrl(locale, key, ...slugPath))
  const image = {
    url: ogImagePath ?? OG_IMAGE_DEFAULT,
    width: OG_IMAGE_WIDTH,
    height: OG_IMAGE_HEIGHT,
  }

  const openGraph: NonNullable<Metadata['openGraph']> =
    ogType === 'article'
      ? {
          type: 'article',
          siteName: cfg.siteName,
          locale: cfg.ogLocale,
          url,
          title: ogTitle,
          description: ogDescription,
          images: [image],
          ...(node?.publishedAt ? { publishedTime: toIsoTime(node.publishedAt) } : {}),
        }
      : ogType === 'book'
        ? {
            type: 'book',
            siteName: cfg.siteName,
            locale: cfg.ogLocale,
            url,
            title: ogTitle,
            description: ogDescription,
            images: [image],
          }
        : {
            type: 'website',
            siteName: cfg.siteName,
            locale: cfg.ogLocale,
            url,
            title: ogTitle,
            description: ogDescription,
            images: [image],
          }

  return {
    // Absolute so no inherited layout title template can re-wrap it (the brand
    // suffix is already applied here, per-locale).
    title: { absolute: title },
    description,
    alternates: buildAlternates(locale, key, slugPath),
    openGraph,
  }
}

/**
 * Build the canonical + hreflang alternate set for a content item, per the
 * i18n design doc §7. `availableLocales` is the set of locales that actually
 * have a published version of this item — today just its own locale, so the
 * set is `[locale]`. Driven by real availability (not the static locale list)
 * so it stays correct when a second locale exists.
 *
 * NOTE: when multi-locale content lands, each locale's URL must use that
 * locale's own slug for the item (via the cross-locale grouping described in
 * §4). Today only one locale has any item, so the item's own slug is the only
 * one needed.
 */
export function buildAlternates(
  locale: string,
  key: UrlKey,
  slugPath: string[],
  availableLocales: string[] = [locale],
): { canonical: string; languages: Record<string, string> } {
  const abs = (loc: string) => absoluteUrl(buildLocalizedUrl(loc, key, ...slugPath))
  const languages: Record<string, string> = {}
  for (const loc of availableLocales) languages[loc] = abs(loc)
  const xDefaultLocale = availableLocales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locale
  languages['x-default'] = abs(xDefaultLocale)
  return { canonical: abs(locale), languages }
}
