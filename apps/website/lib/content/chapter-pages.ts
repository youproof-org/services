import type { PageMetaNode } from '@/lib/i18n/metadata'
import type { ChapterNode, ChapterPageNode, SectionNode } from './types'

/** The parts of a chapter that sit outside its sections. */
export type ChapterFrame = 'abstract' | 'prerequisite-warning' | 'prologue' | 'epilogue'

/**
 * The page of `chapter` that renders a section or one of the chapter's own
 * blocks: a section's own page, page 1 for everything above the first section,
 * and the last page for the epilogue.
 */
export function pageHolding(chapter: ChapterNode, where: SectionNode | ChapterFrame): ChapterPageNode {
  if (typeof where !== 'string') return where.page
  return where === 'epilogue' ? chapter.pages[chapter.pages.length - 1] : chapter.pages[0]
}

/**
 * What `buildPageMeta` reads for a chapter's URL: the chapter's own fields and
 * page 1's `meta`. A `ChapterNode` has no `meta` of its own, and passing one as a
 * `PageMetaNode` would type-check and silently drop the authored title and
 * description.
 */
export function chapterPageMetaNode(chapter: ChapterNode): PageMetaNode {
  return {
    title: chapter.title,
    excerpt: chapter.excerpt,
    publishedAt: chapter.publishedAt,
    thumbnail: chapter.thumbnail,
    meta: chapter.pages[0].meta,
  }
}
