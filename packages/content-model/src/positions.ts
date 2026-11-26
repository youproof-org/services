import { fqnJoin } from './fqn'
import type { ContentOutline, OutlineBlock } from './outline'

/**
 * Where each target sits in the content, one distinct number per fully qualified
 * name, so a list template can render its targets in reading order.
 *
 * The order is the site's reading order: the books in order, each book's parts and
 * chapters in order, and within a chapter the chapter itself, its prologue, each
 * section followed by what it embeds, and the epilogue. Embeds are read in block
 * order, through subsections and details blocks. That agrees with the entity
 * numbers, which `buildEmbedding` counts over the top-level embeds of the prologue
 * and then the sections, so a sorted list reads in ascending number. An entity is
 * followed by its claims, in the order the template context numbers them, and then
 * by its terms. Standalone items come after the books.
 */
export function buildContentPositions(outline: ContentOutline): Map<string, number> {
  const positions = new Map<string, number>()
  const place = (fqn: string) => {
    if (!positions.has(fqn)) positions.set(fqn, positions.size)
  }
  const placeEntity = (fqn: string) => {
    place(fqn)
    const entity = outline.entities.get(fqn)
    if (!entity) return
    for (const block of entity.body) if (block.type === 'claim' && block.name !== undefined) place(fqnJoin(fqn, 'claim', block.name))
    for (const termKey of entity.terms) place(fqnJoin(fqn, 'term', termKey))
  }
  const scan = (blocks: readonly OutlineBlock[]) => {
    for (const block of blocks) {
      if (block.type === 'embed' && block.target) placeEntity(block.target.fqn)
      if ((block.type === 'subsection' || block.type === 'details') && block.blocks) scan(block.blocks)
    }
  }
  for (const book of outline.books) {
    const bookFqn = fqnJoin('', 'book', book.name)
    place(bookFqn)
    for (const part of book.parts) {
      place(fqnJoin(bookFqn, 'part', part.name))
      for (const chapter of part.chapters) {
        const chapterFqn = fqnJoin(bookFqn, 'chapter', chapter.name)
        place(chapterFqn)
        scan(chapter.prologue)
        for (const section of chapter.sections) {
          place(fqnJoin(chapterFqn, 'section', section.name))
          scan(section.body)
        }
        scan(chapter.epilogue)
      }
    }
  }
  for (const item of outline.standalones) {
    const itemFqn = fqnJoin('', item.kind, item.name)
    place(itemFqn)
    for (const section of item.sections) place(fqnJoin(itemFqn, 'section', section.name))
  }
  return positions
}
