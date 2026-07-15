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

export type RefTarget =
  | ExternalRefTarget
  | KnowledgeBaseRefTarget
  | ClaimRefTarget
  | TermRefTarget
  | ChapterRefTarget
  | SectionRefTarget

export interface RefEntry {
  display: string
  href?: string
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
  synonyms?: string[]
}

export type TermMap = Record<string, TermDefinition>

// ---------------------------------------------------------------------------
// Mathematical entity nodes
// ---------------------------------------------------------------------------

export interface DefinitionNode {
  type: 'definition'
  name: string
  namespace: string               // e.g. "/primalitas"
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

export interface PartNode {
  name: string
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
// cross-references + entity embeds are out of scope for now, so no RefMap is
// carried and these render with refs undefined.
// ---------------------------------------------------------------------------

export type StandaloneKind = 'article' | 'newsletter' | 'page' | 'landing'

export interface StandaloneSection {
  name: string
  slug: string                    // localized in-page anchor id
  title: string
  body: ContentBlock[]
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
}
