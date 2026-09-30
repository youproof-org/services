import type { PageMetaNode } from '@/lib/i18n/metadata'
import type { ChapterNode, ChapterPageNode, SectionNode } from './types'
import { stubKindFor } from './stub'
import { urlForChapter, urlForChapterPage } from './urls'

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
 * The pages this build generates for a chapter: every page, or only page 1 where
 * the chapter renders as a stub, since the stub stands in for the whole chapter.
 *
 * The one list the route, its static params and every page-qualified href read,
 * so a link can't point at a page the build didn't generate.
 */
export function generatedPages(chapter: ChapterNode): ChapterPageNode[] {
  return stubKindFor(chapter) ? chapter.pages.slice(0, 1) : chapter.pages
}

/**
 * The page a chapter URL's last segment addresses, or undefined when it addresses
 * none.
 *
 * `^[1-9][0-9]*$` and nothing else, and never `1`: page 1 is the chapter URL
 * itself, so `/1`, `/0`, `/01` and `/2.0` 404 rather than becoming second
 * spellings of a page that already has one.
 */
export function chapterPageAt(chapter: ChapterNode, segment: string | undefined): ChapterPageNode | undefined {
  if (!segment || !/^[1-9][0-9]*$/.test(segment) || segment === '1') return undefined
  return generatedPages(chapter)[Number(segment) - 1]
}

/**
 * Where a link to something on this page goes: the page's own URL, or the chapter
 * URL where the chapter renders as a stub, which is then the only page it has.
 */
export function chapterPageHref(page: ChapterPageNode): string {
  return generatedPages(page.chapter).includes(page)
    ? urlForChapterPage(page.chapter, page.index)
    : urlForChapter(page.chapter)
}

/**
 * What `buildPageMeta` reads for one page of a chapter: the chapter's own fields
 * and the page's `meta`. A `ChapterNode` has no `meta` of its own, and passing one
 * as a `PageMetaNode` would type-check and silently drop the authored title and
 * description.
 */
export function chapterPageMetaNode(page: ChapterPageNode): PageMetaNode {
  const { chapter } = page
  return {
    title: chapter.title,
    excerpt: chapter.excerpt,
    publishedAt: chapter.publishedAt,
    thumbnail: chapter.thumbnail,
    meta: page.meta,
  }
}
