import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import { getLocaleConfig, getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import {
  OG_IMAGE_DEFAULT,
  SITE_URL,
  absoluteUrl,
  pageTitleOf,
  toIsoTime,
} from '@/lib/i18n/metadata'
import { kbNodeTitle, kbOwnership } from './graph'
import { kbEntityBreadcrumbs, kbListBreadcrumbs, type KbListPage } from './kb-breadcrumbs'
import { kbExcerpt } from './kb-excerpt'
import { kbPublishedCount } from './kb-sections'
import { keyForKbNode } from './keys'
import { contentLastmod, kbLastmodKey } from './lastmod'
import type { BookNode, ChapterNode, ContentGraph, KbNode, TermDefinition } from './types'
import {
  kbRefs,
  ownPageScope,
  termAnchorId,
  urlForBook,
  urlForChapter,
  urlForDefinitionsIndex,
  urlForGlossary,
  urlForKbNode,
  urlForKbRoot,
  urlForTheoremsIndex,
} from './urls'

/**
 * The structured-data block a knowledge-base page carries: one `@graph` of things
 * and the edges between them, rendered into a single `application/ld+json` script
 * (`components/kb/StructuredData.tsx`).
 *
 * ## What it is for
 *
 * A crawler reading the markup has to infer from Hungarian prose and CSS classes
 * that "A kis Fermat-tétel" is a theorem, that the page under `/bizonyitasok/1`
 * proves it, and that a link labelled "relatív prím" points at the place that term
 * is defined. An HTML-to-text extraction — what most AI pipelines do first — keeps
 * the prose and the link text and loses every one of those facts. This states them
 * in a form that needs no inference and no Hungarian.
 *
 * That is also the test each property here had to pass: **would a text extraction of
 * the page lose it?** A fact the extracted text already carries is bytes without
 * understanding, which is why the visible index lists, the ownership labels and the
 * body text are not restated here.
 *
 * ## Outgoing edges only
 *
 * No page declares what cites it. An inbound list is the transpose of edges the
 * citing pages state themselves, so the whole graph is recoverable by reading the
 * pages — in both directions — without any page carrying a list of its own inbound
 * references. That is the same rule the served markup follows (see
 * `DEFERRED_PANEL_KINDS` in `components/kb/KbEntityPage.tsx`), and it is what keeps
 * the busiest page's block a couple of kilobytes rather than a couple of hundred.
 *
 * ## Derived, never authored
 *
 * Every string here comes from the graph, from the same helpers the visible page
 * uses: `kbNodeTitle` for a name, `kbExcerpt` for a description, `kbEntityBreadcrumbs`
 * for the trail, `kbOwnership` for the parents and children, `kbRefs` for the
 * outgoing references. So the block cannot disagree with the page it sits on, and
 * there are 537 of these pages — no content file is ever going to grow a `jsonld:`
 * field.
 *
 * ## How this file grows
 *
 * One exported builder per page kind, over shared node builders. Three of them exist:
 * `kbEntityStructuredData` for the four entity kinds, `kbListStructuredData` for the
 * four list pages — the same page-and-trail pair with `CollectionPage` in place of
 * `WebPage` and an `ItemList` or a `DefinedTermSet` as the main entity — and
 * `siteStructuredData` for the two site-scope nodes, which one page carries.
 *
 * A whole-graph projection — every entity, term, chapter and book in a single
 * document — is the same node builders walked over `graph` instead of over one page,
 * which is why each of them takes what it describes and returns one node rather than
 * writing into a shared accumulator.
 */

/** A JSON-LD value: a literal, a reference or nested node, or a list of those. */
export type JsonLdValue = string | number | JsonLdNode | JsonLdValue[]

/** One thing in the graph, or a bare `{ "@id": … }` reference to one. */
export type JsonLdNode = { [key: string]: JsonLdValue }

export interface JsonLdDocument {
  '@context': 'https://schema.org'
  '@graph': JsonLdNode[]
}

// ---------------------------------------------------------------------------
// The vocabulary
// ---------------------------------------------------------------------------

/**
 * The dictionary every other key is read against. Without it `name` is a word;
 * with it, `name` is schema.org's `name`.
 */
const CONTEXT = 'https://schema.org'

/**
 * "…and it is also this kind of thing, per this other vocabulary."
 *
 * schema.org has no type for a theorem, a proof, or a mathematical definition, so
 * each is a `CreativeWork` that names the Wikidata concept it is an instance of.
 * Wikidata is the usual second vocabulary for this, and its concept URIs are
 * language-independent — which is the point, since the only place the markup says
 * "theorem" is the Hungarian word "Tétel".
 *
 * Three deliberate details:
 *
 *   - `entity/`, not `wiki/`. `…/entity/Q65943` is Wikidata's identifier for the
 *     concept, the URI its own RDF uses; `…/wiki/Q65943` is the web page *about*
 *     the concept. `additionalType` wants the identifier.
 *   - `http://`, not `https://`. That is the scheme Wikidata minted these
 *     identifiers with, and an identifier is a name — changing a character makes it
 *     a different name, not a more modern one.
 *   - **a remark has no entry.** Wikidata has nothing for a mathematical remark
 *     worth pointing at, and inventing a type is worse than omitting a key.
 *
 * Exhaustive over the entity types by construction, so a fifth type cannot be added
 * without a decision being made about it here.
 */
const WIKIDATA_TYPE = {
  // "precise mathematical text which describes uniquely a mathematical term or concept"
  definition: 'http://www.wikidata.org/entity/Q114425676',
  // "in mathematics, a statement that has been proved"
  theorem: 'http://www.wikidata.org/entity/Q65943',
  // "rigorous demonstration that a mathematical statement follows from its premises"
  proof: 'http://www.wikidata.org/entity/Q11538',
  remark: undefined,
} as const satisfies Record<KbNode['type'], string | undefined>

/**
 * Both ways of saying "this work is about that term", and we say both.
 *
 * `about` is the widely understood one. `teaches` is the precise one — schema.org
 * defines it as the resource helping a person learn the referenced competency, it
 * expects a `DefinedTerm`, and it is valid directly on `CreativeWork`. For a
 * definition page both are true, and the pair costs about 60 bytes per term.
 *
 * A list rather than two properties written out, so dropping the less commonly
 * consumed of the two is deleting one word here.
 */
const TERM_PREDICATES = ['about', 'teaches'] as const

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------
//
// One rule: an `@id` is the page's canonical absolute URL, plus a fragment when the
// thing being named is not the page itself.
//
// Every URL underneath comes from the `urlFor*` helpers and `absoluteUrl`, for the
// same reason no component builds a path by hand: a page's address is decided in one
// place, and an id scheme that assembled its own would drift from the pages it names
// the first time a container segment moved. The only thing joined here is a URL to a
// fragment.
//
// A term's fragment is the anchor id the markup already renders (`termAnchorId` with
// `ownPageScope`, exactly as `KbEntityPage` and the glossary use it), so a term's id
// is a URL that really resolves to the place the term is defined.

const fragmentId = (url: string, fragment: string): string => `${url}#${fragment}`

/**
 * The fragment naming the thing a page is about, per entity type.
 *
 * Written out rather than derived from `node.type`, because these are published
 * identifiers: renaming the internal union member would silently rename the id of
 * every theorem on the site, and an id that moves is a different thing.
 *
 * Unlike a term's fragment these are not localized and are not anchors in the
 * markup — nothing scrolls to `#theorem`. They name the work rather than a place on
 * the page, and a name a machine reads is better language-independent.
 */
const ENTITY_FRAGMENT = {
  definition: 'definition',
  theorem: 'theorem',
  proof: 'proof',
  remark: 'remark',
} as const satisfies Record<KbNode['type'], string>

/** The trail, which is a thing on the page rather than the page. */
const BREADCRUMB_FRAGMENT = 'breadcrumb'

/** The site, its publisher, and the vocabulary its terms belong to — each named once, site-wide. */
const WEBSITE_FRAGMENT = 'website'
const ORGANIZATION_FRAGMENT = 'organization'
const GLOSSARY_FRAGMENT = 'glossary'

/** The list an index page is a browsing surface over, named on that page. */
const LIST_FRAGMENT = 'list'

/** The canonical absolute URL of a knowledge-base page — the page's own `@id`. */
function kbPageId(node: KbNode): string {
  const url = urlForKbNode(node)
  if (!url) {
    // Only an owner-less remark, which the model permits, no content has, and no
    // route generates — `kbEntityBreadcrumbs` refuses it for the same reason.
    throw new Error(`${node.type} '${node.name}' has no page URL, so it has no structured data.`)
  }
  return absoluteUrl(url)
}

/**
 * The `@id` of the definition, theorem, proof or remark itself — the work, not the
 * page that documents it.
 *
 * The two are different things and both get named: a proof is a page, and it is also
 * a part of a theorem described on another page. Exported because that is the id
 * another page's `hasPart` or `isPartOf` has to use, and both sides naming it the
 * same way is the whole mechanism.
 */
export function kbEntityId(node: KbNode): string {
  return fragmentId(kbPageId(node), ENTITY_FRAGMENT[node.type])
}

/**
 * The site itself, which every page states it is part of.
 *
 * **Rooted at the origin, not at a locale root**, and that is the one id here whose
 * base is not the page that declares it: the node is emitted once, on the locale
 * home page, while its name is a fragment on `/`. Three reasons it is still right:
 *
 *   - an `@id` is a NAME, not a location. Nothing dereferences it; two documents
 *     using the same string are talking about the same thing, and that is all it has
 *     to do. `/` happens to be a real page in the export anyway — the static
 *     redirect stub that sends a reader to the default locale.
 *   - **the site is one site in any number of languages.** `/hu` is one locale's
 *     home page. Naming the site after it would give a second locale a second site,
 *     and the identity of the whole would move the day one was added.
 *   - it is the shape every consumer already meets. Origin-rooted `#website` and
 *     `#organization` are the near-universal convention for site-scope nodes.
 *
 * The consequence to keep in view: because this names the site rather than a
 * locale's home page, the node it points at describes the site and must not carry a
 * per-locale property. A language belongs on the pages, each of which states its
 * own `inLanguage`.
 */
export function siteId(): string {
  return fragmentId(absoluteUrl('/'), WEBSITE_FRAGMENT)
}

/**
 * Who publishes the site. Origin-rooted for the reasons `siteId` gives, and for one
 * more of its own: a publisher is not a property of a locale, so naming it after
 * `/hu` would give a second locale a second publisher.
 */
export function organizationId(): string {
  return fragmentId(absoluteUrl('/'), ORGANIZATION_FRAGMENT)
}

/** The glossary as a controlled vocabulary — what every `DefinedTerm` belongs to. */
export function glossaryId(locale: string): string {
  return fragmentId(absoluteUrl(urlForGlossary(locale)), GLOSSARY_FRAGMENT)
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

/** An edge: "the thing I named, described elsewhere". */
const ref = (id: string): JsonLdNode => ({ '@id': id })

/**
 * One value or a list, as JSON-LD reads them identically.
 *
 * Used where the count is a property of the content rather than of the design: a
 * theorem belongs to its chapter and nothing else, while a proof belongs to its
 * theorem *and* sits in a chapter, and both are `isPartOf`.
 */
function oneOrMany(ids: string[]): JsonLdValue {
  return ids.length === 1 ? ref(ids[0]) : ids.map(ref)
}

/**
 * The page, as a thing distinct from what it is about.
 *
 * Nothing here is new information — `<title>`, `<meta name="description">` and
 * `<link rel="canonical">` already say it. It is worth the bytes because the other
 * nodes hang off it: `mainEntity` is what joins a page to the work it documents.
 *
 * `type` is `CollectionPage` on a page whose subject is a set of other pages, which
 * is the one distinction schema.org draws between our two families of page and the
 * only difference between them here.
 *
 * `mainEntity` is optional because one page has no single subject: the
 * knowledge-base root carries three ways in rather than a list, and a `mainEntity`
 * naming one of them would be false about the other two.
 */
function webPageNode(args: {
  type?: 'WebPage' | 'CollectionPage'
  url: string
  name: string
  description?: string
  inLanguage: string
  mainEntity?: string
  breadcrumb: string
}): JsonLdNode {
  return {
    '@type': args.type ?? 'WebPage',
    '@id': args.url,
    url: args.url,
    name: args.name,
    ...(args.description ? { description: args.description } : {}),
    inLanguage: args.inLanguage,
    isPartOf: ref(siteId()),
    breadcrumb: ref(args.breadcrumb),
    ...(args.mainEntity ? { mainEntity: ref(args.mainEntity) } : {}),
  }
}

/**
 * The navigational trail, which is the one node here with a visible payoff: the
 * breadcrumb line under a search result comes from this rather than from the URL.
 *
 * The items are the ones `kbEntityBreadcrumbs` already built for the visible
 * breadcrumb row, so the two cannot drift. The last carries no `item` because it is
 * the page the reader is on — Google's documented convention.
 */
function breadcrumbNode(id: string, crumbs: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    '@id': id,
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.label,
      ...(index < crumbs.length - 1 ? { item: absoluteUrl(crumb.href) } : {}),
    })),
  }
}

/**
 * The chapter a node is introduced in, and the book that chapter belongs to: two
 * stubs of three lines each that give a crawler the book → chapter → entity chain
 * from a single page, without following a link.
 *
 * `pageTitleOf` rather than `.title`, so each stub calls the chapter and the book
 * what their own pages' `<title>` calls them.
 */
function chapterNode(chapter: ChapterNode): JsonLdNode {
  return {
    '@type': 'Chapter',
    '@id': absoluteUrl(urlForChapter(chapter)),
    name: pageTitleOf(chapter),
    isPartOf: ref(absoluteUrl(urlForBook(chapter.part.book))),
  }
}

function bookNode(book: BookNode): JsonLdNode {
  return {
    '@type': 'Book',
    '@id': absoluteUrl(urlForBook(book)),
    name: pageTitleOf(book),
  }
}

/**
 * A term this node introduces, as a member of the site's one vocabulary.
 *
 * Three things the HTML only implies. **Which URL is a term's definitional home** —
 * today a crawler has to infer that from the glossary's link target. **That two
 * names are one term** rather than two pages competing for the same query, via
 * `alternateName`. And **that every term on the site belongs to one vocabulary**,
 * via `inDefinedTermSet`, stated from each page that introduces a term rather than
 * as one enormous membership list on the glossary.
 */
function definedTermNode(id: string, termKey: string, term: TermDefinition, locale: string): JsonLdNode {
  return {
    '@type': 'DefinedTerm',
    '@id': id,
    name: term.canonical ?? termKey,
    ...(term.synonyms?.length ? { alternateName: term.synonyms } : {}),
    url: id,
    inDefinedTermSet: ref(glossaryId(locale)),
  }
}

/**
 * Every outgoing reference in the node's prose, as absolute URLs, deduplicated and
 * ordered.
 *
 * **Whatever the reader's own link points at**, which is one rule with two visible
 * shapes. A reference to the term "relatív prím" resolves to
 * `/definiciok/relativ-primek#fogalmak.relativ-prim` — the anchor, not merely the
 * page, and it is where that page declares the term's own `DefinedTerm`. A reference
 * to a whole theorem resolves to that theorem's page, with no fragment, because that
 * is where the link goes; the page declares that URL as its own `@id` and points at
 * the work from it. `kbRefs` is what makes these knowledge-base addresses rather than
 * chapter anchors — the same remapping the body itself renders through, so a
 * citation and the link beside it can never be different URLs.
 *
 * Deduplicated because one edge is one edge and a body may link the same term twice
 * (the kis Fermat-tétel does, for two of its five). Sorted by code unit rather than
 * by authored order, so reordering a references map does not rewrite the block, and
 * so the ordering is the same on every machine — which a locale-aware collation would
 * not guarantee.
 *
 * An external target contributes its own URL: it is an outgoing reference the prose
 * makes, and a plain tag-strip loses an `href` as completely as it loses an internal
 * one. Five of them exist across the content today.
 */
function citationIds(node: KbNode): string[] {
  const refs = kbRefs(node.references) ?? {}
  const ids = new Set<string>()
  for (const entry of Object.values(refs)) {
    if (entry.target.type === 'external') {
      ids.add(entry.target.url)
    } else if (entry.href) {
      ids.add(absoluteUrl(entry.href))
    }
  }
  return [...ids].sort()
}

// ---------------------------------------------------------------------------
// The entity pages
// ---------------------------------------------------------------------------

/**
 * The block for one definition, theorem, proof or remark page.
 *
 * The graph it returns, in order: the page, the work the page is about, one
 * `DefinedTerm` per term the work introduces, the chapter and book stubs, and the
 * breadcrumb trail.
 *
 * Both directions of the ownership chain come from `kbOwnership`, which is what the
 * visible ownership links below the body are built from and is already filtered to
 * the pages this environment generated — so nothing here can name a page the build
 * did not produce.
 */
export function kbEntityStructuredData(graph: ContentGraph, node: KbNode): JsonLdDocument {
  const pageId = kbPageId(node)
  const entityId = fragmentId(pageId, ENTITY_FRAGMENT[node.type])
  const breadcrumbId = fragmentId(pageId, BREADCRUMB_FRAGMENT)
  const inLanguage = getLocaleConfig(node.locale).htmlLang
  const name = kbNodeTitle(graph, node)

  const ownership = kbOwnership(graph, node)
  const chapter = graph.embedding.get(keyForKbNode(node))?.chapter

  // Upwards: the entity that owns this one, when there is one, and the chapter the
  // narrative introduces it in. A proof has both — it belongs to its theorem AND
  // sits in a chapter, and both are true at once.
  const partOf = [
    ...(ownership.parent ? [kbEntityId(ownership.parent)] : []),
    ...(chapter ? [absoluteUrl(urlForChapter(chapter))] : []),
  ]
  // Downwards: a theorem's proofs and remarks, a definition's or a proof's remarks.
  const hasPart = [...ownership.proofs, ...ownership.remarks].map(kbEntityId)

  const scope = ownPageScope(node)
  const terms = Object.entries(node.terms ?? {}).map(([termKey, term]) => ({
    id: fragmentId(pageId, termAnchorId(scope, termKey, term)),
    termKey,
    term,
  }))

  const additionalType = WIKIDATA_TYPE[node.type]
  // The chapter's publication date, because no entity carries one of its own: an
  // entity was published when the chapter that introduces it was.
  const datePublished = chapter?.publishedAt
  const dateModified = contentLastmod(kbLastmodKey(node))
  const citations = citationIds(node)

  return {
    '@context': CONTEXT,
    '@graph': [
      webPageNode({
        url: pageId,
        name,
        description: kbExcerpt(node),
        inLanguage,
        mainEntity: entityId,
        breadcrumb: breadcrumbId,
      }),
      {
        '@type': 'CreativeWork',
        '@id': entityId,
        ...(additionalType ? { additionalType } : {}),
        name,
        inLanguage,
        ...(datePublished ? { datePublished: toIsoTime(datePublished) } : {}),
        ...(dateModified ? { dateModified } : {}),
        ...(partOf.length ? { isPartOf: oneOrMany(partOf) } : {}),
        ...(hasPart.length ? { hasPart: hasPart.map(ref) } : {}),
        ...(terms.length
          ? Object.fromEntries(
              TERM_PREDICATES.map((key) => [key, terms.map((entry) => ref(entry.id))]),
            )
          : {}),
        ...(citations.length ? { citation: citations.map(ref) } : {}),
      },
      ...terms.map((entry) => definedTermNode(entry.id, entry.termKey, entry.term, node.locale)),
      ...(chapter ? [chapterNode(chapter), bookNode(chapter.part.book)] : []),
      breadcrumbNode(breadcrumbId, kbEntityBreadcrumbs(graph, node)),
    ],
  }
}

// ---------------------------------------------------------------------------
// The list pages
// ---------------------------------------------------------------------------

/**
 * Which page each list kind is, and what it is called — the same two facts
 * `kb-breadcrumbs.ts` builds each list page's crumb from, so a page's `@id` and the
 * href in its own breadcrumb trail are one string by construction.
 *
 * Exhaustive over `KbListPage`, so a fifth list page cannot be added without a
 * decision about what its block says.
 */
const KB_LIST_PAGES = {
  'kb-root': { url: urlForKbRoot, nameKey: 'knowledgeBase' },
  'definitions-index': { url: urlForDefinitionsIndex, nameKey: 'definitionsIndex' },
  'theorems-index': { url: urlForTheoremsIndex, nameKey: 'theoremsIndex' },
  glossary: { url: urlForGlossary, nameKey: 'glossary' },
} as const satisfies Record<KbListPage, { url: (locale: string) => string; nameKey: LabelKey }>

/**
 * "The members are in the order this page presents them, ascending."
 *
 * True of both indexes: `KbTypeIndexPage` sorts its rows by Hungarian title and
 * renders them in that order, so a consumer told the order is ascending and then
 * given the anchors in document order gets the same sequence twice.
 */
const ASCENDING = 'https://schema.org/ItemListOrderAscending'

/**
 * The index of one entity type, named and counted — deliberately **not** enumerated.
 *
 * Every other node in this file states something the markup only implies. A list of
 * the members would be the exception: the class membership is already stated by each
 * of those pages, in its own block, via `additionalType`; the markup already carries
 * every title and URL as a named link in this same order; and a text extraction — the
 * pipeline this design is written for — loses a list of named links less completely
 * than it loses anything else on the page. Measured before it was dropped: 34.5 KiB
 * on the theorems index, +51% of its markup, for a second copy of what the reader can
 * already see.
 *
 * What the markup does NOT give a reader without counting is how many there are, and
 * that is the whole of what this node adds. The count comes from `kbPublishedCount`,
 * the function the root page's cards and the index page's own count line are built
 * from, so the number here cannot be one a reader can contradict by scrolling.
 */
function itemListNode(id: string, name: string, numberOfItems: number): JsonLdNode {
  return {
    '@type': 'ItemList',
    '@id': id,
    name,
    numberOfItems,
    itemListOrder: ASCENDING,
  }
}

/**
 * The glossary as the one controlled vocabulary the site's terms belong to.
 *
 * **No `hasDefinedTerm`**, for the mirror of the reason the indexes carry no members:
 * the set has 341 rows over 217 terms, and every one of those terms already names
 * this set from the page that introduces it (`definedTermNode`). Membership is one
 * statement either way, and the side with 217 statements to make is the wrong side to
 * make them from — roughly 30 KiB of JSON on a page that serves 106 KiB of markup.
 *
 * This node is what makes those 217 references resolve: without it, every
 * `inDefinedTermSet` on the site points at an id nothing declares.
 */
function definedTermSetNode(id: string, pageUrl: string, name: string, inLanguage: string): JsonLdNode {
  return {
    '@type': 'DefinedTermSet',
    '@id': id,
    name,
    url: pageUrl,
    inLanguage,
  }
}

/**
 * The block for one of the four knowledge-base list pages.
 *
 * The graph it returns, in order: the page, whatever the page is a surface over, and
 * the breadcrumb trail. Three of the four have a main entity — the two indexes name
 * their list, the glossary names its vocabulary — and the root has none, because
 * three cards are not a list of things.
 *
 * No description, unlike an entity page: all four take the locale's default
 * description in their `<meta>`, and restating one sentence about the site on four
 * pages describes none of them.
 */
export function kbListStructuredData(
  graph: ContentGraph,
  locale: string,
  page: KbListPage,
): JsonLdDocument {
  const { url, nameKey } = KB_LIST_PAGES[page]
  const pageId = absoluteUrl(url(locale))
  const breadcrumbId = fragmentId(pageId, BREADCRUMB_FRAGMENT)
  const inLanguage = getLocaleConfig(locale).htmlLang
  const name = getLocaleLabel(locale, nameKey)

  const subject = ((): JsonLdNode | undefined => {
    switch (page) {
      case 'kb-root':
        return undefined
      case 'definitions-index':
        return itemListNode(
          fragmentId(pageId, LIST_FRAGMENT),
          name,
          kbPublishedCount(graph, graph.definitions, locale),
        )
      case 'theorems-index':
        return itemListNode(
          fragmentId(pageId, LIST_FRAGMENT),
          name,
          kbPublishedCount(graph, graph.theorems, locale),
        )
      case 'glossary':
        return definedTermSetNode(glossaryId(locale), pageId, name, inLanguage)
    }
  })()

  return {
    '@context': CONTEXT,
    '@graph': [
      webPageNode({
        type: 'CollectionPage',
        url: pageId,
        name,
        inLanguage,
        ...(subject ? { mainEntity: subject['@id'] as string } : {}),
        breadcrumb: breadcrumbId,
      }),
      ...(subject ? [subject] : []),
      breadcrumbNode(breadcrumbId, kbListBreadcrumbs(locale, page)),
    ],
  }
}

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

/**
 * The two site-scope nodes: what this site is, and who publishes it.
 *
 * Emitted on the locale home page and nowhere else. They describe the site rather
 * than a page, so a second copy on any other page would be the same two statements
 * repeated several hundred times — and every knowledge-base page already reaches them
 * by id through its `isPartOf`. This builder is what makes that id resolve.
 *
 * ## Two constraints a second locale would break
 *
 * Both ids are origin-rooted (`siteId`, `organizationId`) because they name one site
 * and one publisher however many languages those come in. The node bodies, though,
 * are built from one locale's configuration, and two of their keys would then be a
 * contradiction rather than a translation:
 *
 *   - **`inLanguage`.** The site is Hungarian-only today, so `"hu"` is a true
 *     statement about it. Add a second locale and two home pages would describe one
 *     `#website` with two different languages. The key has to become a list, or move
 *     off the node onto the pages that already each carry their own.
 *   - **`name`.** Same shape, smaller stakes: it is the locale's `siteName`, which is
 *     the same wordmark in every locale we would plausibly add.
 *
 * Written down rather than designed around, because designing for a locale that does
 * not exist would mean choosing today between a list of one and a key on the wrong
 * node, with nothing to check the choice against.
 */
export function siteStructuredData(locale: string): JsonLdDocument {
  const config = getLocaleConfig(locale)
  return {
    '@context': CONTEXT,
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId(),
        name: config.siteName,
        url: SITE_URL,
        // The generic 1200×630 social card, standing in for a logo we do not have:
        // there is no square brand asset in the repo, and inventing one here would be
        // a picture nobody designed. Replacing it is a one-line change once there is
        // something to point at.
        logo: absoluteUrl(OG_IMAGE_DEFAULT),
      },
      {
        '@type': 'WebSite',
        '@id': siteId(),
        name: config.siteName,
        url: SITE_URL,
        inLanguage: config.htmlLang,
        publisher: ref(organizationId()),
      },
    ],
  }
}
