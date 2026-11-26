import { fqnJoin } from './fqn'
import type { ContentOutline, OutlineBlock, OutlineBook, OutlineChapter, OutlineSection } from './outline'

/**
 * A chapter's number: its position among all the chapters of its book, across the
 * parts, counting from 1. 0 when the book doesn't hold the chapter.
 */
export function chapterNumber(book: OutlineBook, chapter: OutlineChapter): number {
  let number = 1
  for (const part of book.parts) {
    for (const candidate of part.chapters) {
      if (candidate === chapter) return number
      number++
    }
  }
  return 0
}

/**
 * The two container numbers, as the text and every reference to them write them:
 * `16.` for a chapter, `16.1.` for its first section. A section's number is its
 * position among its chapter's sections.
 */
export function chapterIndexLabel(book: OutlineBook, chapter: OutlineChapter): string {
  return `${chapterNumber(book, chapter)}.`
}

export function sectionIndexLabel(book: OutlineBook, chapter: OutlineChapter, section: OutlineSection): string {
  return `${chapterNumber(book, chapter)}.${chapter.sections.indexOf(section) + 1}.`
}

/** Where a knowledge-base entity is introduced in the narrative, by fully qualified names. */
export interface Embedding {
  chapter: string
  /** Absent for an embed in the chapter's prologue or epilogue. */
  section: string | undefined
  /** The chapter-scoped number, such as `11.3.`, for a numbered entity. */
  index?: string
}

/**
 * Where each entity is embedded: the first chapter and section, in reading order,
 * whose blocks embed it, through subsections and details blocks.
 *
 * Definitions, theorems and remarks that belong to no other entity are also
 * numbered: in embed order within the chapter that introduces them, over the
 * top-level blocks of the prologue and then of each section. The epilogue and
 * nested blocks are not numbered. An entity a later chapter embeds again keeps its
 * first number and takes none in the later chapter.
 */
export function buildEmbedding(outline: ContentOutline): Map<string, Embedding> {
  const info = new Map<string, Embedding>()

  const scan = (blocks: readonly OutlineBlock[], chapter: string, section?: string) => {
    for (const block of blocks) {
      if (block.type === 'embed' && block.target && !info.has(block.target.fqn)) {
        info.set(block.target.fqn, { chapter, section })
      }
      if ((block.type === 'subsection' || block.type === 'details') && block.blocks) scan(block.blocks, chapter, section)
    }
  }

  const chapters: { book: OutlineBook; chapter: OutlineChapter; fqn: string }[] = []
  for (const book of outline.books) {
    const bookFqn = fqnJoin('', 'book', book.name)
    for (const part of book.parts) {
      for (const chapter of part.chapters) chapters.push({ book, chapter, fqn: fqnJoin(bookFqn, 'chapter', chapter.name) })
    }
  }

  for (const { chapter, fqn } of chapters) {
    scan(chapter.prologue, fqn)
    scan(chapter.epilogue, fqn)
    for (const section of chapter.sections) scan(section.body, fqn, fqnJoin(fqn, 'section', section.name))
  }

  const isNumbered = (target: { type: string; fqn: string }): boolean => {
    if (target.type === 'definition' || target.type === 'theorem') return true
    if (target.type === 'remark') {
      const remark = outline.entities.get(target.fqn)
      return remark !== undefined && remark.type === 'remark' && !remark.attached
    }
    return false
  }

  for (const { book, chapter } of chapters) {
    const chapterIdx = chapterNumber(book, chapter)
    let k = 0
    const number = (blocks: readonly OutlineBlock[]) => {
      for (const block of blocks) {
        if (block.type !== 'embed' || !block.target || !isNumbered(block.target)) continue
        const entry = info.get(block.target.fqn)
        if (entry && !entry.index) entry.index = `${chapterIdx}.${++k}.`
      }
    }
    number(chapter.prologue)
    for (const section of chapter.sections) number(section.body)
  }

  return info
}
