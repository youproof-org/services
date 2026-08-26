import type { ContentGraph, ChapterNode, BookNode, ContentBlock, EmbedBlock, FigureBlock } from '../content/types'
import { toRoman } from './roman'

// ---------------------------------------------------------------------------
// Part index (Roman numeral)
// ---------------------------------------------------------------------------

export function getPartRomanIndex(chapter: ChapterNode): string {
  const part = chapter.part
  const book = part.book
  const idx = book.parts.indexOf(part)
  return toRoman(idx + 1)
}

// ---------------------------------------------------------------------------
// Book index (roman numeral position among all books in the graph)
// ---------------------------------------------------------------------------

export function getBookRomanIndex(book: BookNode, graph: ContentGraph): string {
  const idx = graph.episodeOrder.indexOf(book.name)
  return toRoman(idx + 1)
}

// ---------------------------------------------------------------------------
// Chapter index (1–N sequential across all parts in the book)
// ---------------------------------------------------------------------------

export function getChapterIndex(chapter: ChapterNode): number {
  const book = chapter.part.book
  let idx = 1
  for (const part of book.parts) {
    for (const ch of part.chapters) {
      if (ch === chapter) return idx
      idx++
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// Embed label map for a chapter
// Maps entity name (slug) → "n.k" label
// Only definitions, theorems, and independent remarks are indexed.
// ---------------------------------------------------------------------------

function isIndexedEmbed(
  graph: ContentGraph,
  block: EmbedBlock
): boolean {
  const { type: entityType, fqn } = block.target
  if (entityType === 'definition' || entityType === 'theorem') return true
  if (entityType === 'remark') {
    const remark = graph.remarks.get(fqn)
    return remark !== undefined && remark.attachedTo === undefined
  }
  return false
}

export function walkFigureBlocks(
  graph: ContentGraph,
  chapter: ChapterNode,
  chapterIndex: number,
  onFigure: (block: FigureBlock, index: string) => void
): void {
  let count = 0

  function walk(blocks: ContentBlock[]): void {
    for (const block of blocks) {
      if (block.type === 'figure') {
        count++
        onFigure(block as FigureBlock, `${chapterIndex}.${count}.`)
      } else if (block.type === 'embed') {
        const key = (block as EmbedBlock).target.fqn
        const content =
          graph.definitions.get(key)?.body ??
          graph.theorems.get(key)?.body ??
          graph.proofs.get(key)?.body ??
          graph.remarks.get(key)?.body
        if (content) walk(content)
      } else if (block.type === 'subsection' || block.type === 'details') {
        walk((block as { blocks: ContentBlock[] }).blocks)
      }
    }
  }

  walk(chapter.prologue)
  for (const section of chapter.sections) walk(section.body)
  walk(chapter.epilogue)
}

export function buildChapterFigureIndices(
  graph: ContentGraph,
  chapter: ChapterNode,
  chapterIndex: number
): Map<object, string> {
  const indices = new Map<object, string>()
  walkFigureBlocks(graph, chapter, chapterIndex, (block, index) => {
    indices.set(block, index)
  })
  return indices
}

export function buildChapterEmbedIndices(
  graph: ContentGraph,
  chapter: ChapterNode,
  chapterIndex: number
): Record<string, string> {
  const labels: Record<string, string> = {}
  let k = 0

  function processBlocks(blocks: ContentBlock[]) {
    for (const block of blocks) {
      if (block.type !== 'embed') continue
      if (!isIndexedEmbed(graph, block as EmbedBlock)) continue
      const entityKey = (block as EmbedBlock).target.fqn
      if (!(entityKey in labels)) {
        k++
        labels[entityKey] = `${chapterIndex}.${k}.`
      }
    }
  }

  processBlocks(chapter.prologue)
  for (const section of chapter.sections) {
    processBlocks(section.body)
  }

  return labels
}
