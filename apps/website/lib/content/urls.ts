import type {
  BookNode,
  ChapterNode,
  StandaloneNode,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  KbNode,
  RefMap,
} from './types'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import { getAnchorPrefix, type AnchorKey } from '@/lib/i18n/config'

// Node → public URL helpers. Each node carries its own `locale` and `slug`, so a
// node's URL is derived from the node itself (and, for cross-references, always
// resolves within that node's locale). All routing through buildLocalizedUrl.

export function homeUrl(locale: string): string {
  return buildLocalizedUrl(locale, 'home')
}

export function urlForBook(book: BookNode): string {
  return buildLocalizedUrl(book.locale, 'book', book.slug)
}

export function urlForChapter(chapter: ChapterNode): string {
  return buildLocalizedUrl(chapter.locale, 'chapter', chapter.part.book.slug, chapter.slug)
}

export function urlForStandalone(node: StandaloneNode): string {
  // StandaloneKind ('article' | 'newsletter' | 'page' | 'landing') is a subset of
  // UrlKey with matching names, so the kind is the URL key directly.
  return buildLocalizedUrl(node.locale, node.kind, node.slug)
}

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------
//
// A node's URL is derived from the node's own `locale` + `slug` and, for the
// owned types, from its owner's slug — never from its namespace. Namespaces are
// expected to be reorganized, and moving a node between them must not move its
// URL; that is the whole reason definitions and theorems sit at a flat path.

export function urlForKbRoot(locale: string): string {
  return buildLocalizedUrl(locale, 'kb-root')
}
export function urlForDefinitionsIndex(locale: string): string {
  return buildLocalizedUrl(locale, 'definitions-index')
}
export function urlForTheoremsIndex(locale: string): string {
  return buildLocalizedUrl(locale, 'theorems-index')
}
export function urlForGlossary(locale: string): string {
  return buildLocalizedUrl(locale, 'glossary')
}

export function urlForDefinition(node: DefinitionNode): string {
  return buildLocalizedUrl(node.locale, 'definition', node.slug)
}

export function urlForTheorem(node: TheoremNode): string {
  return buildLocalizedUrl(node.locale, 'theorem', node.slug)
}

export function urlForProof(node: ProofNode): string {
  return buildLocalizedUrl(node.locale, 'proof', node.proves.slug, node.slug)
}

/**
 * A remark nests under whatever owns it, so its URL shape depends on the owner's
 * type. An owner-less remark is not addressable — the model allows one (no content
 * has one today) and it would have no place in the hierarchy, so this returns null
 * rather than inventing a path for it.
 */
export function urlForRemark(node: RemarkNode): string | null {
  const owner = node.attachedTo
  if (!owner) return null
  switch (owner.type) {
    case 'definition':
      return buildLocalizedUrl(node.locale, 'definition-remark', owner.slug, node.slug)
    case 'theorem':
      return buildLocalizedUrl(node.locale, 'theorem-remark', owner.slug, node.slug)
    case 'proof':
      return buildLocalizedUrl(node.locale, 'proof-remark', owner.proves.slug, owner.slug, node.slug)
  }
}

/** The canonical page URL of any knowledge-base node, or null if it has none. */
export function urlForKbNode(node: KbNode): string | null {
  switch (node.type) {
    case 'definition': return urlForDefinition(node)
    case 'theorem':    return urlForTheorem(node)
    case 'proof':      return urlForProof(node)
    case 'remark':     return urlForRemark(node)
  }
}

// ---------------------------------------------------------------------------
// Fragment identifiers
// ---------------------------------------------------------------------------
//
// Claims and terms get no page of their own: they are structural parts of their
// parent's argument, so they are cited as a fragment on the parent's page. The
// slug is authored (Hungarian); `name` / the term key is the language-independent
// id and is the fallback, so a node authored before the slug migration still
// produces a working — if English — anchor rather than `#undefined`.
//
// Both halves are localized. The prefix comes from the locale's `anchors`
// dictionary (`allitas-`, `fogalom-`, `definicio-`, …) because the whole fragment
// is URL text a reader sees and copies, so it must read in the page's language —
// the same reason the container segments are localized.
//
// A claim and a term carry no locale of their own, so the OWNING node supplies it.
// Taking the owner rather than a bare locale string makes that structural: there is
// no call site where the locale can drift from the node the anchor lives on.

/** Anything that can own an anchor: a knowledge-base node, which knows its locale. */
export interface AnchorOwner {
  locale: string
}

export function claimAnchorId(owner: AnchorOwner, claim: { name: string; slug?: string }): string {
  return `${getAnchorPrefix(owner.locale, 'claim')}-${claim.slug ?? claim.name}`
}

export function termAnchorId(owner: AnchorOwner, termKey: string, term: { slug?: string }): string {
  return `${getAnchorPrefix(owner.locale, 'term')}-${term.slug ?? termKey}`
}

/**
 * A knowledge-base node's own element id on a chapter page. On its own KB page the
 * node IS the page, so no anchor is needed; this is what an entity-scoped
 * cross-reference targets when it lands on the embedding chapter instead.
 *
 * The node's own type supplies the prefix, so the four types stay distinguishable
 * on a chapter page that embeds several of them.
 */
export function entityAnchorId(node: { type: AnchorKey; slug: string; locale: string }): string {
  return `${getAnchorPrefix(node.locale, node.type)}-${node.slug}`
}

/**
 * Re-point a references map at knowledge-base pages.
 *
 * `RefEntry` carries two resolved hrefs (see types.ts): `href` for the chapter
 * context and `kbHref` for a KB page. Rather than threading a "which context"
 * flag through ContentBlocks and every block component down to InlineText, a KB
 * page passes its refs through this once at the page boundary. Nested
 * subsection/details blocks inherit the same `refs` prop, so they are covered.
 */
export function kbRefs(refs: RefMap | undefined): RefMap | undefined {
  if (!refs) return refs
  const out: RefMap = {}
  for (const [key, entry] of Object.entries(refs)) {
    out[key] = entry.kbHref ? { ...entry, href: entry.kbHref } : entry
  }
  return out
}
