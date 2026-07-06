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

export interface SectionNode {
  name: string
  title: string
  chapter: ChapterNode            // parent reference
  body: ContentBlock[]
  references: RefMap
}

export interface ChapterNode {
  name: string
  title: string
  part: PartNode                  // parent reference
  published: boolean              // false when absent; gates real vs. stub page
  legacyPath?: string             // old youproof.hu path, if any (kebab: legacy-path)
  abstract: ContentBlock[]
  prerequisiteWarning?: ContentBlock[]
  prologue: ContentBlock[]
  sections: SectionNode[]
  epilogue: ContentBlock[]
  references: RefMap
  thumbnail?: ThumbnailImage
}

export interface PartNode {
  name: string
  title: string
  book: BookNode                  // parent reference
  chapters: ChapterNode[]
}

export interface BookNode {
  name: string
  title: string
  parts: PartNode[]
  logo?: ThumbnailImage
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
}
