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
import { getContainerSegment, type ContainerKey } from '@/lib/i18n/config'

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
// An anchor is the localized, dotted path of a node, taken RELATIVE TO THE PAGE
// that renders it — except that a knowledge-base entity is always rooted at its
// own type container, exactly as its URL is, because a node's address must not
// depend on where it happens to be embedded.
//
//   book index page      reszek.{part}
//   chapter page         szakaszok.{section}
//                        definiciok.{d}.fogalmak.{term}
//                        tetelek.{t}.bizonyitasok.{p}.megjegyzesek.{r}
//   a definition's page  fogalmak.{term}          (the page node drops out)
//
// Both halves are localized. The segments come from the same `containers`
// dictionary the URL segments come from — one word, one place, so an anchor and a
// URL for the same concept cannot drift apart — and the key is the node's `slug`.
// A fragment is URL text a reader sees and copies, so it must read in the page's
// language.
//
// `.` is the separator, which is why no name or slug may contain one (enforced by
// validateIdentifiers). A `.` in an HTML id is valid and needs no URL encoding, but
// it IS a class separator in a CSS selector: getElementById, `:target` and
// [id="…"] are fine, querySelector('#' + id) is not.

const seg = (locale: string, key: ContainerKey): string => getContainerSegment(locale, key)

/**
 * A knowledge-base node's anchor path, rooted at its own type container. This is
 * what an entity-scoped cross-reference targets when it lands on the embedding
 * chapter instead of the node's own page.
 *
 * Recursive through the ownership chain, so a remark on a proof reads
 * `tetelek.{t}.bizonyitasok.{p}.megjegyzesek.{r}` — the same shape as its URL. An
 * owner-less remark (permitted by the model, absent from the content) roots at its
 * own container rather than inventing a parent.
 */
export function kbAnchorPath(node: KbNode): string {
  switch (node.type) {
    case 'definition':
      return `${seg(node.locale, 'definition')}.${node.slug}`
    case 'theorem':
      return `${seg(node.locale, 'theorem')}.${node.slug}`
    case 'proof':
      return `${kbAnchorPath(node.proves)}.${seg(node.locale, 'proof')}.${node.slug}`
    case 'remark':
      return node.attachedTo
        ? `${kbAnchorPath(node.attachedTo)}.${seg(node.locale, 'remark')}.${node.slug}`
        : `${seg(node.locale, 'remark')}.${node.slug}`
  }
}

/** A section's anchor on the page of the chapter or standalone item that owns it. */
export function sectionAnchorId(section: { slug: string; locale: string }): string {
  return `${seg(section.locale, 'section')}.${section.slug}`
}

/** A part's anchor on its book's index page. */
export function partAnchorId(part: { slug: string; locale: string }): string {
  return `${seg(part.locale, 'part')}.${part.slug}`
}

/**
 * Where a claim or a term is being rendered, which is what makes its anchor
 * page-relative.
 *
 * `prefix` is the dotted path of the owning node relative to the current page:
 * the node's full `kbAnchorPath` when it is embedded in a chapter, and EMPTY when
 * the node is itself the page — there, the page node drops out of the path and a
 * term is simply `fogalmak.{slug}`.
 *
 * Passing the scope rather than a bare locale keeps two things structural: the
 * locale cannot drift from the node the anchor lives on, and a caller cannot
 * accidentally emit a chapter-context anchor on a knowledge-base page.
 */
export interface AnchorScope {
  locale: string
  prefix: string
}

/** The scope for claims and terms rendered on their owning node's OWN page. */
export function ownPageScope(node: { locale: string }): AnchorScope {
  return { locale: node.locale, prefix: '' }
}

/** The scope for claims and terms rendered inside a chapter that embeds the node. */
export function embeddedScope(node: KbNode): AnchorScope {
  return { locale: node.locale, prefix: kbAnchorPath(node) }
}

const join = (prefix: string, tail: string): string => (prefix ? `${prefix}.${tail}` : tail)

/**
 * A claim's anchor. `slug` is authored Hungarian; `name` is the
 * language-independent id and the fallback, so a claim added between migrations
 * still produces a working — if English — anchor rather than `#undefined`.
 */
export function claimAnchorId(scope: AnchorScope, claim: { name: string; slug?: string }): string {
  return join(scope.prefix, `${seg(scope.locale, 'claim')}.${claim.slug ?? claim.name}`)
}

/** A term's anchor. Same fallback rule as a claim's, with the map key as the name. */
export function termAnchorId(scope: AnchorScope, termKey: string, term: { slug?: string }): string {
  return join(scope.prefix, `${seg(scope.locale, 'term')}.${term.slug ?? termKey}`)
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
