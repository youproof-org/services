// ---------------------------------------------------------------------------
// Content blocks
// ---------------------------------------------------------------------------

export interface NarrativeBlock {
  type: 'narrative'
  content: string
}

export interface FormulaBlock {
  type: 'formula'
  leadIn?: string
  content: string
  leadOut?: string
}

export interface FigureBlock {
  type: 'figure'
  leadIn?: string
  selfReference?: { display: string }
  src: string
  alt?: string
  caption?: string
  size?: 'small' | 'medium' | 'large'
  // Intrinsic pixel dimensions, resolved from the synced asset at build time
  // (see resolveFigurePaths + the .generated/figure-dimensions.json sidecar).
  // Rendered as <img width/height> so the browser reserves layout space and
  // lazy-loaded figures can't shift the page after an anchor jump.
  width?: number
  height?: number
}

export interface EmbedTarget {
  type: string
  name: string
  namespace: string
}

export interface EmbedBlock {
  type: 'embed'
  target: EmbedTarget
  showTitle?: boolean
}

export interface ClaimBlock {
  type: 'claim'
  name: string
  // Localized fragment identifier: a claim has no page of its own, so it is cited
  // as `#claim-{slug}` on whichever node asserts it. Falls back to `name` when
  // absent (see claimAnchorId) — `name` stays the language-independent id that
  // cross-references resolve against.
  slug?: string
  content: string
  formula?: string
}

export interface RecallBlock {
  type: 'recall'
  target: EmbedTarget
}

export interface ListBlock {
  type: 'unordered-list' | 'ordered-list'
  leadIn?: string
  items: string[]
}

export interface TypewriterBlock {
  type: 'typewriter'
  leadIn?: string
  rows: string[]
}

export interface QuoteBlock {
  type: 'quote'
  leadIn?: string
  quote: string
  author?: string
}

export interface SubsectionBlock {
  type: 'subsection'
  title: string
  blocks: ContentBlock[]
}

export interface DetailsBlock {
  type: 'details'
  title?: string
  blocks: ContentBlock[]
}

export interface UnknownBlock {
  type: 'unknown'
  content?: string
}

export type ContentBlock = (
  | NarrativeBlock
  | FormulaBlock
  | FigureBlock
  | EmbedBlock
  | ClaimBlock
  | RecallBlock
  | ListBlock
  | TypewriterBlock
  | QuoteBlock
  | SubsectionBlock
  | DetailsBlock
  | UnknownBlock
) & { context?: 'web' | 'latex' }

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export interface ExternalRefTarget {
  type: 'external'
  url: string
}

export interface KnowledgeBaseRefTarget {
  type: 'definition' | 'theorem' | 'proof' | 'remark'
  name: string
  namespace: string
}

// A book's index page. Addressed by the language-independent `name` (parts are
// flattened out of URLs, so no further parentage is needed); resolution goes
// through urlForBook, which supplies the book's own locale + slug.
export interface BookRefTarget {
  type: 'book'
  name: string
}

export interface ChapterRefTarget {
  type: 'chapter'
  book: string
  part: string
  name: string
}

export interface SectionRefTarget {
  type: 'section'
  book: string
  part: string
  chapter: string
  name: string
}

export interface ClaimRefTarget {
  type: 'claim'
  name: string
  parent: KnowledgeBaseRefTarget
}

export interface TermRefTarget {
  type: 'term'
  name: string
  parent: KnowledgeBaseRefTarget
}

// A standalone item (article/newsletter/page/landing). Addressed by the
// language-independent `name`, not the localized `slug`, so the href stays correct
// if the slug is ever localized — resolution goes through urlForStandalone, which
// supplies the target's own locale + slug.
export interface StandaloneRefTarget {
  type: StandaloneKind
  name: string
}

export type RefTarget =
  | ExternalRefTarget
  | KnowledgeBaseRefTarget
  | ClaimRefTarget
  | TermRefTarget
  | BookRefTarget
  | ChapterRefTarget
  | SectionRefTarget
  | StandaloneRefTarget

export interface RefEntry {
  display: string
  // Resolved at graph-build time, in two variants, because the SAME references map
  // is rendered in two places and must point somewhere different in each:
  //   href   — used on a chapter page (and inside an entity embedded there): the
  //            in-page/cross-chapter anchor, i.e. today's behaviour, unchanged.
  //   kbHref — used on a standalone knowledge-base page: the target's own KB page.
  // A KB page therefore remaps its refs (see kbRefs) rather than threading a
  // "which context am I in" flag through every block component.
  href?: string
  kbHref?: string
  target: RefTarget
}

export type RefMap = Record<string, RefEntry>

// ---------------------------------------------------------------------------
// Entity labels
// ---------------------------------------------------------------------------

export interface InflectedForm {
  base: string
  suffix?: string
}

export interface EntityLabels {
  canonical: string
  cases?: Record<string, InflectedForm>
}

// ---------------------------------------------------------------------------
// Term definitions
// ---------------------------------------------------------------------------

export interface TermDefinition {
  display: string
  canonical: string
  // Localized fragment identifier, as for a claim: `#term-{slug}` on the node that
  // introduces the term. Falls back to the term's map key when absent.
  slug?: string
  synonyms?: string[]
}

export type TermMap = Record<string, TermDefinition>

// ---------------------------------------------------------------------------
// Mathematical entity nodes
// ---------------------------------------------------------------------------

export interface DefinitionNode {
  type: 'definition'
  name: string
  slug: string                    // localized URL segment (flat, namespace-independent)
  locale: string
  namespace: string               // e.g. "/primalitas" — grouping only, never in the URL
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  remarks: RemarkNode[]           // remarks attached to this definition
  references: RefMap
  body: ContentBlock[]
}

export interface TheoremNode {
  type: 'theorem'
  name: string
  slug: string                    // localized URL segment (flat, namespace-independent)
  locale: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  proofs: ProofNode[]             // proofs belonging to this theorem
  remarks: RemarkNode[]           // remarks attached to this theorem
  references: RefMap
  body: ContentBlock[]
}

export interface ProofNode {
  type: 'proof'
  name: string
  slug: string                    // localized URL segment, nested under its theorem
  locale: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  proves: TheoremNode             // the theorem this proof belongs to
  remarks: RemarkNode[]           // remarks attached to this proof
  references: RefMap
  body: ContentBlock[]
}

export interface RemarkNode {
  type: 'remark'
  name: string
  slug: string                    // localized URL segment, nested under its owner
  locale: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  attachedTo?: DefinitionNode | TheoremNode | ProofNode  // undefined = independent
  references: RefMap
  body: ContentBlock[]
}

// ---------------------------------------------------------------------------
// Book content nodes
// ---------------------------------------------------------------------------

export interface ThumbnailImage {
  src: string
  alt: string
}

// Optional crawler/social metadata, independent of on-page display text. All
// fields optional with a fallback chain (see lib/i18n/metadata.ts buildPageMeta):
//   title       → meta.title,             else display title
//   description → meta.description,        else display excerpt
//   og:title    → meta.openGraph.title,    else resolved title
//   og:desc     → meta.openGraph.description, else resolved description
// The root field is `meta` (generic) rather than `seo`; `open-graph` is nested
// so future channels (e.g. `meta.twitter`) slot in as siblings.
export interface MetaInfo {
  title?: string
  description?: string
  openGraph?: {
    title?: string
    description?: string
  }
}

export interface SectionNode {
  name: string                    // language-independent internal id (cross-refs)
  slug: string                    // localized in-page anchor id (not a URL segment)
  locale: string
  title: string
  chapter: ChapterNode            // parent reference
  body: ContentBlock[]
  references: RefMap
}

export interface ChapterNode {
  name: string                    // language-independent internal id (cross-refs)
  slug: string                    // localized URL segment
  locale: string
  title: string
  part: PartNode                  // parent reference
  publishedAt?: string            // kebab: published-at; canonical 'YYYY-MM-DD HH:MM:SS' UTC, if published
  published: boolean              // derived: publishedAt != null; gates real vs. stub page
  legacyPath?: string             // old youproof.hu path, if any (kebab: legacy-path)
  excerpt?: string                // short card copy for ContentRow listings (not derived from abstract)
  abstract: ContentBlock[]
  prerequisiteWarning?: ContentBlock[]
  prologue: ContentBlock[]
  sections: SectionNode[]
  epilogue: ContentBlock[]
  references: RefMap
  thumbnail?: ThumbnailImage
  meta?: MetaInfo                  // optional crawler/social metadata (kebab: meta)
}

// A part has no URL — it is flattened out of chapter paths — but it IS anchored,
// on its book's index page, and is a cross-reference target. So it carries a slug
// like every other addressable node, plus a locale to localize that anchor's
// container segment with.
export interface PartNode {
  name: string                    // language-independent internal id (cross-refs)
  slug: string                    // localized in-page anchor segment (not a URL segment)
  locale: string
  title: string
  book: BookNode                  // parent reference
  chapters: ChapterNode[]
}

// A simple `{ items: string[] }` wrapper — object-wrapped (not a bare string[])
// so it can grow future sub-fields without a breaking rename. Display-only:
// inline cross-references in these items are intentionally out of scope for now.
export interface ItemList {
  items: string[]
}

export interface BookNode {
  name: string                    // language-independent internal id (cross-refs)
  slug: string                    // localized URL segment
  locale: string
  title: string
  parts: PartNode[]
  thumbnail?: ThumbnailImage      // series cover shown on book cards
  publishedAt?: string            // kebab: published-at; canonical 'YYYY-MM-DD HH:MM:SS' UTC, if published
  published: boolean              // derived: publishedAt != null
  legacyPath?: string             // old youproof.hu series path, if any (kebab: legacy-path)
  excerpt?: string                // short card copy / meta-description fallback (books have no abstract-derived excerpt)
  abstract: ContentBlock[]        // "Kivonat" prose
  teaser?: ItemList               // curiosity-sparking hook questions (questions box)
  bibliography?: ItemList         // "Felhasznált irodalom" — display-only list of cited works
  meta?: MetaInfo                 // optional crawler/social metadata (kebab: meta)
}

// ---------------------------------------------------------------------------
// Standalone content nodes (article, newsletter, page, landing)
// "Same structure as a chapter minus the book relationship." Inline
// cross-references ARE carried (see `references` below and StandalonePage);
// entity embeds are out of scope for now, so these render with no embed indices.
// ---------------------------------------------------------------------------

export type StandaloneKind = 'article' | 'newsletter' | 'page' | 'landing'

export interface StandaloneSection {
  name: string
  slug: string                    // localized in-page anchor id
  title: string
  body: ContentBlock[]
  references: RefMap
}

export interface StandaloneNode {
  kind: StandaloneKind
  name: string                    // language-independent internal id (kebab)
  slug: string                    // localized URL segment
  locale: string
  title: string
  publishedAt?: string            // kebab: published-at; canonical 'YYYY-MM-DD HH:MM:SS' UTC, if published
  published: boolean              // derived: publishedAt != null
  legacyPath?: string             // old youproof.hu path, if any (kebab: legacy-path)
  excerpt?: string                // short card copy for ContentRow listings (article/newsletter)
  abstract: ContentBlock[]
  prologue: ContentBlock[]
  sections: StandaloneSection[]
  epilogue: ContentBlock[]
  thumbnail?: ThumbnailImage
  meta?: MetaInfo                 // optional crawler/social metadata (kebab: meta)
  references: RefMap              // inline [slug] targets (kebab: references)
}

// ---------------------------------------------------------------------------
// Knowledge-base graph derivatives
// ---------------------------------------------------------------------------

/** Any knowledge-base entity. */
export type KbNode = DefinitionNode | TheoremNode | ProofNode | RemarkNode

/**
 * The knowledge-base node a claim or term belongs to, threaded through the
 * renderers so a nested block can build its own anchor id.
 *
 * `locale` is what makes the anchor prefix localizable: a claim and a term carry no
 * locale of their own, so the owner supplies it (see claimAnchorId/termAnchorId).
 */
export interface AnchorParent {
  type: string
  namespace: string
  name: string
  locale: string
}

/**
 * Where in the narrative a knowledge-base node is introduced: the chapter that
 * embeds it and the section within that chapter. Every node is embedded exactly
 * once today, and a node only gets a page at all if it IS embedded (see
 * kbPageExists), so a KB page can always show this.
 */
export interface EmbeddingContext {
  chapter: ChapterNode
  section?: SectionNode           // absent only for a chapter prologue/epilogue embed
  index?: string                  // chapter-scoped label, e.g. "11.3."
}


/**
 * One row of the glossary. A term has no page, so the entry points at the anchor
 * on whichever node introduces it. Note that a term key may legitimately be
 * defined by more than one node (8 keys are today), so an entry is identified by
 * the (owner, key) pair, not by the key alone.
 */
export interface GlossaryEntry {
  termKey: string                 // language-independent key, e.g. "natural-number"
  canonical: string               // Hungarian display form
  ownerName: string
  ownerTitle: string
  href: string                    // owner's KB page + "#term-{slug}"
}

// ---------------------------------------------------------------------------
// Content graph
// Map keys:
//   Entities:     "/entities/{namespace}/{name}"
//   Books:        "/books/{book}"
//   Parts:        "/books/{book}/{part}"
//   Chapters:     "/books/{book}/{part}/{chapter}"
//   Sections:     "/books/{book}/{part}/{chapter}/{section}"
// ---------------------------------------------------------------------------

export interface ContentGraph {
  episodeOrder: string[]
  books:        Map<string, BookNode>
  parts:       Map<string, PartNode>
  chapters:    Map<string, ChapterNode>
  sections:    Map<string, SectionNode>
  definitions: Map<string, DefinitionNode>
  theorems:    Map<string, TheoremNode>
  proofs:      Map<string, ProofNode>
  remarks:     Map<string, RemarkNode>
  // Standalone content, keyed by "/{kind}s/{slug}" (e.g. "/articles/foo").
  articles:    Map<string, StandaloneNode>
  newsletters: Map<string, StandaloneNode>
  pages:       Map<string, StandaloneNode>
  landings:    Map<string, StandaloneNode>

  // ── Derived, built once at graph-build time ──
  /** Entity key -> where the node is embedded in the narrative. */
  embedding:   Map<string, EmbeddingContext>
  /** Every term definition in the knowledge base, sorted by `canonical`. */
  glossary:    GlossaryEntry[]
}
