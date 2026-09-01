import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getContentGraph, initContentGraph } from '@/lib/content'
import type {
  BookNode,
  ChapterNode,
  StandaloneNode,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  KbNode,
  ContentGraph,
} from '@/lib/content/types'
import {
  LOCALES,
  isLocale,
  getContainerSegment,
  getLocaleLabel,
  resolveContainerKey,
  isRoutableAtRoot,
  type ContainerKey,
} from '@/lib/i18n/config'
import { buildPageMeta, type OgType, type PageMetaNode } from '@/lib/i18n/metadata'
import type { UrlKey } from '@/lib/i18n/url'
import { urlForBook, urlForChapter, urlForKbNode, kbUrlRef, kbNodeAtIndex } from '@/lib/content/urls'
import { kbExcerpt } from '@/lib/content/kb-excerpt'
import { kbNodes, kbNodeTitle, kbPageExists } from '@/lib/content/graph'
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
import KbPageShell from '@/components/kb/KbPageShell'
import KbRootPage from '@/components/kb/KbRootPage'
import KbTypeIndexPage from '@/components/kb/KbTypeIndexPage'
import GlossaryPage from '@/components/kb/GlossaryPage'
import KbEntityPage from '@/components/kb/KbEntityPage'
import { kbEntityBreadcrumbs, kbListBreadcrumbs } from '@/lib/content/kb-breadcrumbs'
import { homeCrumb, articlesIndexCrumb, newsletterIndexCrumb } from '@/lib/content/breadcrumbs'
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
  // Knowledge base — the four list pages, and one variant per entity type. The
  // four entity variants differ only in the node they carry, which is what every
  // consumer branches on; they are separate so a caller cannot be handed a
  // `KbNode` where the route matched something else.
  | { kind: 'kb-root' }
  | { kind: 'definitions-index' }
  | { kind: 'theorems-index' }
  | { kind: 'glossary' }
  | { kind: 'definition'; node: DefinitionNode }
  | { kind: 'theorem'; node: TheoremNode }
  | { kind: 'proof'; node: ProofNode }
  | { kind: 'remark'; node: RemarkNode }

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

  // Knowledge base. Only the outer segment is routable at the root, so the
  // per-type segments are reachable only nested under it: `/hu/tudasbazis/definiciok`
  // is the definitions index while `/hu/definiciok` 404s above.
  if (key0 === 'knowledge-base') {
    if (path.length === 1) return { kind: 'kb-root' }
    const key1 = resolveContainerKey(locale, path[1])
    if (path.length === 2) {
      switch (key1) {
        case 'definition': return { kind: 'definitions-index' }
        case 'theorem': return { kind: 'theorems-index' }
        case 'term': return { kind: 'glossary' }
        default: return null
      }
    }
    // Deeper paths are the entity pages: `{definition}/{d}`, `{theorem}/{t}`, and
    // the owned types nested under their owner.
    return resolveKbEntity(graph, locale, key1, path.slice(2))
  }

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

/**
 * The knowledge-base entity routes, below `/{locale}/{kb}`.
 *
 * `typeKey` is the container the path enters the type through, and `rest` is
 * everything below it: `[d]` is a definition, `[d, {remark}, r]` a remark on it,
 * `[t, {proof}, p, {remark}, r]` a remark on a proof. The six shapes are the six
 * in lib/i18n/url.ts, read the other way round — this is the only place that
 * takes them apart, and `generateStaticParams` enumerates them by asking
 * `urlForKbNode` rather than by assembling them again.
 *
 * A node is looked up within its owner, not globally: a definition and a theorem
 * are found by slug, and a proof and a remark by their position in the owner's list,
 * which is what their last segment is. Either way the owner is what makes the lookup
 * unambiguous.
 */
function resolveKbEntity(
  graph: ContentGraph,
  locale: string,
  typeKey: ContainerKey | null,
  rest: string[],
): Resolved | null {
  if (typeKey === 'definition') {
    const definition = findKbBySlug(graph.definitions.values(), locale, rest[0])
    if (!definition) return null
    if (rest.length === 1) return kbEntity(graph, definition)
    if (rest.length === 3 && resolveContainerKey(locale, rest[1]) === 'remark') {
      return kbEntity(graph, findByIndex(definition.remarks, locale, rest[2]))
    }
    return null
  }

  if (typeKey === 'theorem') {
    const theorem = findKbBySlug(graph.theorems.values(), locale, rest[0])
    if (!theorem) return null
    if (rest.length === 1) return kbEntity(graph, theorem)
    const ownedKey = rest.length >= 3 ? resolveContainerKey(locale, rest[1]) : null
    if (rest.length === 3 && ownedKey === 'remark') {
      return kbEntity(graph, findByIndex(theorem.remarks, locale, rest[2]))
    }
    if (ownedKey === 'proof') {
      const proof = findByIndex(theorem.proofs, locale, rest[2])
      if (!proof) return null
      if (rest.length === 3) return kbEntity(graph, proof)
      if (rest.length === 5 && resolveContainerKey(locale, rest[3]) === 'remark') {
        return kbEntity(graph, findByIndex(proof.remarks, locale, rest[4]))
      }
    }
    return null
  }

  return null
}

function findKbBySlug<T extends DefinitionNode | TheoremNode>(
  nodes: Iterable<T>,
  locale: string,
  slug: string | undefined,
): T | undefined {
  if (!slug) return undefined
  for (const node of nodes) {
    if (node.locale === locale && node.slug === slug) return node
  }
}

/**
 * The same lookup for the owned types, whose segment is a position rather than a
 * slug. `kbNodeAtIndex` holds the accepted spelling of an index, next to the builder
 * that emits it; the locale check is the one `findKbBySlug` makes, kept because an
 * owner's list is no more guaranteed to be single-locale than a map's values are.
 */
function findByIndex<T extends KbNode>(
  nodes: T[],
  locale: string,
  segment: string | undefined,
): T | undefined {
  const node = kbNodeAtIndex(nodes, segment)
  return node && node.locale === locale ? node : undefined
}

/**
 * A resolved entity, or null when this environment generates no page for it —
 * `kbPageExists` is the same gate `generateStaticParams`, the list pages and
 * `kbHref` resolution use, so an unpublished chapter's entities 404 on staging
 * instead of resolving to a page nothing links to.
 */
function kbEntity(graph: ContentGraph, node: KbNode | undefined): Resolved | null {
  if (!node || !kbPageExists(graph, node)) return null
  switch (node.type) {
    case 'definition': return { kind: 'definition', node }
    case 'theorem':    return { kind: 'theorem', node }
    case 'proof':      return { kind: 'proof', node }
    case 'remark':     return { kind: 'remark', node }
  }
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
    const kbC = getContainerSegment(locale, 'knowledge-base')

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

    // Knowledge base: the root, the three index pages, and one page per entity
    // that has one in this environment.
    params.push({ locale, path: [kbC] })
    params.push({ locale, path: [kbC, getContainerSegment(locale, 'definition')] })
    params.push({ locale, path: [kbC, getContainerSegment(locale, 'theorem')] })
    params.push({ locale, path: [kbC, getContainerSegment(locale, 'term')] })

    // The entity params come from each node's own canonical URL, minus its locale
    // prefix, rather than from a second assembly of the six entity URL shapes: the
    // path this route generates is then the same string every list page, breadcrumb
    // and reference links to, by construction. `kbPageExists` is the gate, so on a
    // deployed build an unpublished chapter's entities are not generated at all.
    for (const node of kbNodes(graph)) {
      if (node.locale !== locale || !kbPageExists(graph, node)) continue
      const url = urlForKbNode(node)
      if (!url) continue
      params.push({ locale, path: url.split('/').slice(2) })
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
  const graph = getContentGraph()
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
    // The four knowledge-base list pages: all `website`, and all four take the
    // locale's default description — a per-page description is worth writing where
    // there are hundreds of near-identical entity pages, not for four.
    case 'kb-root':
      key = 'kb-root'; fallbackTitle = getLocaleLabel(locale, 'knowledgeBase'); ogType = 'website'; break
    case 'definitions-index':
      key = 'definitions-index'; fallbackTitle = getLocaleLabel(locale, 'definitionsIndex'); ogType = 'website'; break
    case 'theorems-index':
      key = 'theorems-index'; fallbackTitle = getLocaleLabel(locale, 'theoremsIndex'); ogType = 'website'; break
    case 'glossary':
      key = 'glossary'; fallbackTitle = getLocaleLabel(locale, 'glossary'); ogType = 'website'; break
    // An entity page: an article, with a description taken from the node's own
    // opening prose. There are 537 of these pages locally and 389 on a deployed
    // build; all of them sharing the locale's defaultDescription would read to a
    // crawler as several hundred pages about nothing in particular.
    case 'definition':
    case 'theorem':
    case 'proof':
    case 'remark': {
      const ref = kbUrlRef(resolved.node)
      // Only an owner-less remark has no URL, and no route resolves to one.
      if (!ref) return {}
      key = ref.key
      slugPath = ref.slugPath
      ogType = 'article'
      // `kbNodeTitle`, not `node.title`: a proof and a remark have no authored
      // title, and a <title> has to name the page on its own — that is the derived
      // "Bizonyítás: {theorem}". The on-page header is the one place that reads
      // `node.title` directly (see KbEntityPage).
      node = { title: kbNodeTitle(graph, resolved.node), excerpt: kbExcerpt(resolved.node) }
      break
    }
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
          <SiteHeader breadcrumbs={[homeCrumb(locale)]} locale={locale} />
          <main className="stub-main">
            <UnavailableStub />
          </main>
          <SiteFooter locale={locale} withNewsletter={false} />
        </div>
      )

    case 'articles-index':
      return (
        <StandaloneIndex
          title={getLocaleLabel(locale, 'articlesIndex')}
          locale={locale}
          items={Array.from(graph.articles.values()).filter((a) => a.locale === locale)}
          breadcrumbs={[homeCrumb(locale), articlesIndexCrumb(locale)]}
        />
      )

    case 'newsletter-index':
      return (
        <StandaloneIndex
          title={getLocaleLabel(locale, 'newsletterIndex')}
          locale={locale}
          items={Array.from(graph.newsletters.values()).filter((n) => n.locale === locale && n.published)}
          breadcrumbs={[homeCrumb(locale), newsletterIndexCrumb(locale)]}
        />
      )

    // Knowledge base. Each page is a body inside the one shell (§2), and every
    // chain comes from kbListBreadcrumbs so the list and entity pages cannot
    // disagree about where a page sits.
    case 'kb-root':
      return (
        <KbPageShell locale={locale} breadcrumbs={kbListBreadcrumbs(locale, 'kb-root')}>
          <KbRootPage locale={locale} />
        </KbPageShell>
      )

    case 'definitions-index':
      return (
        <KbPageShell locale={locale} breadcrumbs={kbListBreadcrumbs(locale, 'definitions-index')}>
          <KbTypeIndexPage locale={locale} type="definition" />
        </KbPageShell>
      )

    case 'theorems-index':
      return (
        <KbPageShell locale={locale} breadcrumbs={kbListBreadcrumbs(locale, 'theorems-index')}>
          <KbTypeIndexPage locale={locale} type="theorem" />
        </KbPageShell>
      )

    case 'glossary':
      return (
        <KbPageShell locale={locale} breadcrumbs={kbListBreadcrumbs(locale, 'glossary')}>
          <GlossaryPage locale={locale} />
        </KbPageShell>
      )

    // The four entity pages are one page: the type only decides the label the
    // header carries and the glyph that closes the body (§6.1). The chain comes
    // from the node's ownership, so a remark on a proof carries the theorem and
    // the proof above it.
    case 'definition':
    case 'theorem':
    case 'proof':
    case 'remark':
      return (
        <KbPageShell locale={locale} breadcrumbs={kbEntityBreadcrumbs(graph, resolved.node)}>
          <KbEntityPage node={resolved.node} />
        </KbPageShell>
      )

    case 'book': {
      const { book } = resolved
      const episode = getBookRomanIndex(book, graph)
      return (
        <div className="book-shell">
          <SiteHeader
            locale={locale}
            breadcrumbs={[homeCrumb(locale), { label: book.title, href: urlForBook(book) }]}
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
        homeCrumb(locale),
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
          ? [articlesIndexCrumb(locale)]
          : resolved.kind === 'newsletter'
          ? [newsletterIndexCrumb(locale)]
          : []
      const breadcrumbs = [
        homeCrumb(locale),
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
