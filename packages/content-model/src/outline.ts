import { fqnJoin } from './fqn'
import type { KbEntityType } from './entity-labels'
import { buildEmbedding, chapterIndexLabel, sectionIndexLabel, type Embedding } from './numbering'
import { buildContentPositions } from './positions'

/**
 * The content as the numbering and the reference templates read it: plain data
 * that the website builds from its content graph and the editor from the content
 * it loads. Nothing here reads files, and every array is in reading order.
 *
 * Only the fields named here are read. A caller may pass richer objects, such as
 * the website's graph nodes, as long as they have these fields with these types.
 */
export interface ContentOutline {
  /** In reading order: the website's episode order. */
  books: readonly OutlineBook[]
  /** Every knowledge-base entity, by fully qualified name. */
  entities: ReadonlyMap<string, OutlineEntity>
  /** Articles, then newsletters, then pages, then landings, each in its own order. */
  standalones: readonly OutlineStandalone[]
}

/**
 * A content block, as far as the numbering reads it. Blocks of other types need
 * only their `type`.
 */
export interface OutlineBlock {
  /** As the YAML names it, such as `embed`, `claim`, `subsection` or `details`. */
  type: string
  /** An embed block's target: the embedded entity's kind and fully qualified name. */
  target?: { type: string; fqn: string }
  /** A claim block's name. */
  name?: string
  /** The nested blocks of a subsection or details block. */
  blocks?: readonly OutlineBlock[]
}

export interface OutlineBook {
  name: string
  title: string
  parts: readonly OutlinePart[]
}

export interface OutlinePart {
  name: string
  chapters: readonly OutlineChapter[]
}

export interface OutlineChapter {
  name: string
  title: string
  prologue: readonly OutlineBlock[]
  sections: readonly OutlineSection[]
  epilogue: readonly OutlineBlock[]
}

export interface OutlineSection {
  name: string
  title: string
  body: readonly OutlineBlock[]
}

export interface OutlineEntity {
  type: KbEntityType
  locale: string
  title?: string
  /** The label variant the entity names; absent for its type's default. */
  label?: string
  body: readonly OutlineBlock[]
  /** The keys of the terms the entity defines, in the order the file lists them. */
  terms: readonly string[]
  /**
   * Read for a remark only: true when a definition, theorem or proof lists it among
   * its remarks. Such a remark is numbered with its owner, not on its own.
   */
  attached: boolean
}

export type StandaloneKind = 'article' | 'newsletter' | 'page' | 'landing'

export interface OutlineStandalone {
  kind: StandaloneKind
  name: string
  title: string
  sections: readonly { name: string }[]
}

export interface IndexedChapter {
  chapter: OutlineChapter
  /** The chapter's number as the text writes it, such as `16.`. */
  index: string
}

export interface IndexedSection {
  section: OutlineSection
  /** The section's number as the text writes it, such as `16.1.`. */
  index: string
}

/** An outline with its lookups and what is derived from it, built once by `indexContent`. */
export interface ContentIndex {
  books: ReadonlyMap<string, OutlineBook>
  chapters: ReadonlyMap<string, IndexedChapter>
  sections: ReadonlyMap<string, IndexedSection>
  entities: ReadonlyMap<string, OutlineEntity>
  standalones: readonly OutlineStandalone[]
  /** Entity fully qualified name -> where it is embedded and its number. */
  embedding: ReadonlyMap<string, Embedding>
  /** Fully qualified name -> its place in reading order. */
  positions: ReadonlyMap<string, number>
}

/** The lookups by fully qualified name, the numbering and the reading order of an outline. */
export function indexContent(outline: ContentOutline): ContentIndex {
  const books = new Map<string, OutlineBook>()
  const chapters = new Map<string, IndexedChapter>()
  const sections = new Map<string, IndexedSection>()
  for (const book of outline.books) {
    const bookFqn = fqnJoin('', 'book', book.name)
    books.set(bookFqn, book)
    for (const part of book.parts) {
      for (const chapter of part.chapters) {
        const chapterFqn = fqnJoin(bookFqn, 'chapter', chapter.name)
        chapters.set(chapterFqn, { chapter, index: chapterIndexLabel(book, chapter) })
        for (const section of chapter.sections) {
          sections.set(fqnJoin(chapterFqn, 'section', section.name), {
            section,
            index: sectionIndexLabel(book, chapter, section),
          })
        }
      }
    }
  }
  return {
    books,
    chapters,
    sections,
    entities: outline.entities,
    standalones: outline.standalones,
    embedding: buildEmbedding(outline),
    positions: buildContentPositions(outline),
  }
}
