import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getContentGraph, initContentGraph } from '@/lib/content'
import type { BookNode, ChapterNode, StandaloneNode } from '@/lib/content/types'
import {
  LOCALES,
  isLocale,
  getContainerSegment,
  getLocaleLabel,
  resolveContainerKey,
  isRoutableAtRoot,
} from '@/lib/i18n/config'
import { buildPageMeta, type OgType, type PageMetaNode } from '@/lib/i18n/metadata'
import type { UrlKey } from '@/lib/i18n/url'
import { homeUrl, urlForBook, urlForChapter } from '@/lib/content/urls'
import { getBookRomanIndex, getChapterIndex } from '@/lib/utils/index-helpers'
import RootHome from '@/components/RootHome'
import SiteHeader from '@/components/layout/SiteHeader'
import SiteFooter from '@/components/layout/SiteFooter'
import UnavailableStub from '@/components/content/UnavailableStub'
import NotMigratedStub from '@/components/content/NotMigratedStub'
import BookIndex from '@/components/book/BookIndex'
import ChapterPage from '@/components/content/ChapterPage'
import StandaloneRoute from '@/components/content/StandaloneRoute'
import StandaloneIndex from '@/components/content/StandaloneIndex'
import styles from './page.module.scss'

// Static export: only enumerated paths are generated; anything else 404s.
export const dynamicParams = false

// Unpublished content renders a stub only on deployed envs (SITE_ENV set by the
// deploy workflow). Locally it renders normally so authors can preview drafts.
const isDeployedEnv =
  process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'

// ---------------------------------------------------------------------------
// Slug-based resolution against the graph (always within a single locale)
// ---------------------------------------------------------------------------

function findBook(locale: string, slug: string): BookNode | undefined {
  for (const b of getContentGraph().books.values()) {
    if (b.locale === locale && b.slug === slug) return b
  }
}

function findChapter(book: BookNode, locale: string, slug: string): ChapterNode | undefined {
  for (const part of book.parts) {
    for (const ch of part.chapters) {
      if (ch.locale === locale && ch.slug === slug) return ch
    }
  }
}

function findStandalone(
  map: Map<string, StandaloneNode>,
  locale: string,
  slug: string,
): StandaloneNode | undefined {
  for (const n of map.values()) {
    if (n.locale === locale && n.slug === slug) return n
  }
}

// Discriminated result of resolving a locale + path against the content graph.
type Resolved =
  | { kind: 'home' }
  | { kind: 'books-index' }
  | { kind: 'book'; book: BookNode }
  | { kind: 'chapter'; book: BookNode; chapter: ChapterNode }
  | { kind: 'articles-index' }
  | { kind: 'newsletter-index' }
  | { kind: 'landing-index' }
  | { kind: 'article' | 'newsletter' | 'landing' | 'page'; node: StandaloneNode }

function resolvePath(locale: string, path: string[]): Resolved | null {
  if (path.length === 0) return { kind: 'home' }

  const key0 = resolveContainerKey(locale, path[0])
  const graph = getContentGraph()

  // No container segment → custom page at /{locale}/{slug}.
  if (key0 === null) {
    if (path.length !== 1) return null
    const node = findStandalone(graph.pages, locale, path[0])
    return node ? { kind: 'page', node } : null
  }

  if (key0 === 'book') {
    if (path.length === 1) return { kind: 'books-index' }
    const book = findBook(locale, path[1])
    if (!book) return null
    if (path.length === 2) return { kind: 'book', book }
    if (path.length === 4 && path[2] === getContainerSegment(locale, 'chapter')) {
      const chapter = findChapter(book, locale, path[3])
      return chapter ? { kind: 'chapter', book, chapter } : null
    }
    return null
  }

  // Every container key is classified in ROUTABLE_AT_ROOT, which is an exhaustive
  // Record over ContainerKey — so a newly added key cannot silently fall through to
  // the standalone branch below and resolve to a bogus index page. See that
  // constant for why each is false.
  if (!isRoutableAtRoot(key0)) return null

  // article | newsletter | landing
  if (path.length === 1) {
    return {
      kind:
        key0 === 'article' ? 'articles-index'
        : key0 === 'newsletter' ? 'newsletter-index'
        : 'landing-index',
    }
  }
  if (path.length === 2) {
    const map =
      key0 === 'article' ? graph.articles
      : key0 === 'newsletter' ? graph.newsletters
      : graph.landings
    const node = findStandalone(map, locale, path[1])
    return node ? { kind: key0, node } : null
  }
  return null
}

// ---------------------------------------------------------------------------
// Static params — every path, per locale, driven by the dictionary
// ---------------------------------------------------------------------------

export async function generateStaticParams() {
  await initContentGraph()
  const graph = getContentGraph()
  const params: { locale: string; path: string[] }[] = []

  for (const locale of LOCALES) {
    const bookC = getContainerSegment(locale, 'book')
    const chapterC = getContainerSegment(locale, 'chapter')
    const articleC = getContainerSegment(locale, 'article')
    const newsletterC = getContainerSegment(locale, 'newsletter')
    const landingC = getContainerSegment(locale, 'landing')

    params.push({ locale, path: [] }) // home
    params.push({ locale, path: [bookC] }) // books index (dead-end stub)

    for (const book of graph.books.values()) {
      if (book.locale !== locale) continue
      params.push({ locale, path: [bookC, book.slug] })
      for (const part of book.parts) {
        for (const chapter of part.chapters) {
          params.push({ locale, path: [bookC, book.slug, chapterC, chapter.slug] })
        }
      }
    }

    params.push({ locale, path: [articleC] })
    for (const a of graph.articles.values()) {
      if (a.locale === locale) params.push({ locale, path: [articleC, a.slug] })
    }

    params.push({ locale, path: [newsletterC] })
    for (const n of graph.newsletters.values()) {
      if (n.locale === locale) params.push({ locale, path: [newsletterC, n.slug] })
    }

    params.push({ locale, path: [landingC] }) // landing index (dead-end stub)
    for (const l of graph.landings.values()) {
      if (l.locale === locale) params.push({ locale, path: [landingC, l.slug] })
    }

    for (const p of graph.pages.values()) {
      if (p.locale !== locale) continue
      // The page-slug-vs-container-segment guard lives in validateIdentifiers, so
      // it fires for every consumer of the graph rather than only for route
      // generation - and so it covers the anchor-only container segments too.
      params.push({ locale, path: [p.slug] })
    }
  }

  return params
}

// ---------------------------------------------------------------------------
// Per-page metadata: self-canonical + reciprocal hreflang (+ x-default)
// ---------------------------------------------------------------------------

interface RouteProps {
  params: Promise<{ locale: string; path?: string[] }>
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { locale, path = [] } = await params
  if (!isLocale(locale)) return {}
  await initContentGraph()
  const resolved = resolvePath(locale, path)
  if (!resolved) return {}

  // Dead-end stub pages are not indexable.
  if (resolved.kind === 'books-index' || resolved.kind === 'landing-index') {
    return { robots: { index: false, follow: false } }
  }

  let key: UrlKey
  let slugPath: string[] = []
  let node: PageMetaNode | null = null
  let ogType: OgType = 'website'
  let fallbackTitle: string | undefined
  switch (resolved.kind) {
    case 'home':
      key = 'home'; fallbackTitle = getLocaleLabel(locale, 'home'); ogType = 'website'; break
    case 'book':
      key = 'book'; slugPath = [resolved.book.slug]; node = resolved.book; ogType = 'book'; break
    case 'chapter':
      key = 'chapter'; slugPath = [resolved.book.slug, resolved.chapter.slug]
      node = resolved.chapter; ogType = 'article'; break
    case 'articles-index':
      key = 'articles-index'; fallbackTitle = getLocaleLabel(locale, 'articlesIndex'); ogType = 'website'; break
    case 'newsletter-index':
      key = 'newsletter-index'; fallbackTitle = getLocaleLabel(locale, 'newsletterIndex'); ogType = 'website'; break
    default: // article | newsletter | landing | page
      key = resolved.node.kind
      slugPath = [resolved.node.slug]
      node = resolved.node
      // Articles & newsletters are article-typed; pages & landings are websites.
      ogType = resolved.node.kind === 'article' || resolved.node.kind === 'newsletter'
        ? 'article'
        : 'website'
  }

  // og:image (per-item generated share image) is wired in Phase 4; until then
  // buildPageMeta falls back to the generic OG image.
  return buildPageMeta({ locale, key, slugPath, ogType, node, fallbackTitle })
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export default async function LocalizedRoute({ params }: RouteProps) {
  const { locale, path = [] } = await params
  if (!isLocale(locale)) notFound()
  await initContentGraph()
  const graph = getContentGraph()

  const resolved = resolvePath(locale, path)
  if (!resolved) notFound()

  switch (resolved.kind) {
    case 'home':
      return <RootHome locale={locale} />

    // Dead-end stubs (no all-books directory; landing pages are unlisted).
    case 'books-index':
    case 'landing-index':
      return (
        <div className="book-shell">
          <SiteHeader breadcrumbs={[{ label: 'Főoldal', href: homeUrl(locale) }]} locale={locale} />
          <main className="stub-main">
            <UnavailableStub />
          </main>
          <SiteFooter locale={locale} withNewsletter={false} />
        </div>
      )

    case 'articles-index':
      return (
        <StandaloneIndex
          title="Cikkek"
          locale={locale}
          items={Array.from(graph.articles.values()).filter((a) => a.locale === locale)}
          breadcrumbs={[
            { label: 'Főoldal', href: homeUrl(locale) },
            { label: 'Cikkek', href: `/${locale}/${getContainerSegment(locale, 'article')}` },
          ]}
        />
      )

    case 'newsletter-index':
      return (
        <StandaloneIndex
          title="Hírek"
          locale={locale}
          items={Array.from(graph.newsletters.values()).filter((n) => n.locale === locale && n.published)}
          breadcrumbs={[
            { label: 'Főoldal', href: homeUrl(locale) },
            { label: 'Hírek', href: `/${locale}/${getContainerSegment(locale, 'newsletter')}` },
          ]}
        />
      )

    case 'book': {
      const { book } = resolved
      const episode = getBookRomanIndex(book, graph)
      return (
        <div className="book-shell">
          <SiteHeader
            locale={locale}
            breadcrumbs={[
              { label: 'Főoldal', href: homeUrl(locale) },
              { label: book.title, href: urlForBook(book) },
            ]}
          />
          {book.thumbnail ? (
            <div className={styles.thumbnail}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={book.thumbnail.src} alt={book.thumbnail.alt} style={{ objectFit: 'cover' }} loading="lazy" width="100%" height="100%" />
            </div>
          ) : (
            <div className="hero-placeholder" aria-hidden="true" />
          )}
          <main className="page-content">
            <BookIndex book={book} episode={episode} />
          </main>
          <SiteFooter locale={locale} />
        </div>
      )
    }

    case 'chapter': {
      const { book, chapter } = resolved
      const chapterIndex = getChapterIndex(chapter)
      const breadcrumbs = [
        { label: 'Főoldal', href: homeUrl(locale) },
        { label: book.title, href: urlForBook(book) },
        { label: `${chapterIndex}. ${chapter.title}`, href: urlForChapter(chapter) },
      ]

      if (!chapter.published && isDeployedEnv) {
        return (
          <div className="book-shell">
            <SiteHeader breadcrumbs={breadcrumbs} locale={locale} />
            <main className="stub-main">
              {chapter.legacyPath ? <NotMigratedStub legacyPath={chapter.legacyPath} /> : <UnavailableStub />}
            </main>
            <SiteFooter locale={locale} withNewsletter={false} />
          </div>
        )
      }

      return (
        <div className="book-shell">
          <SiteHeader breadcrumbs={breadcrumbs} locale={locale} />
          {chapter.thumbnail ? (
            <div className={styles.thumbnail}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={chapter.thumbnail.src} alt={chapter.thumbnail.alt} style={{ objectFit: 'cover' }} loading="lazy" width="100%" height="100%" />
            </div>
          ) : (
            <div className="hero-placeholder" aria-hidden="true" />
          )}
          <main className="page-content">
            <ChapterPage book={book} chapter={chapter} />
          </main>
          <SiteFooter locale={locale} />
        </div>
      )
    }

    case 'landing':
      return <StandaloneRoute node={resolved.node} mode="minimal" />

    case 'article':
    case 'newsletter':
    case 'page': {
      const { node } = resolved
      const parentCrumb =
        resolved.kind === 'article'
          ? [{ label: 'Cikkek', href: `/${locale}/${getContainerSegment(locale, 'article')}` }]
          : resolved.kind === 'newsletter'
          ? [{ label: 'Hírek', href: `/${locale}/${getContainerSegment(locale, 'newsletter')}` }]
          : []
      const breadcrumbs = [
        { label: 'Főoldal', href: homeUrl(locale) },
        ...parentCrumb,
        { label: node.title, href: `/${locale}/${path.join('/')}` },
      ]
      // Legal/custom pages (kind === 'page') must not show the newsletter form.
      return (
        <StandaloneRoute
          node={node}
          breadcrumbs={breadcrumbs}
          withNewsletter={resolved.kind !== 'page'}
        />
      )
    }
  }
}
