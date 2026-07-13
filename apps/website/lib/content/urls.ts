import type { BookNode, ChapterNode, StandaloneNode } from './types'
import { buildLocalizedUrl } from '@/lib/i18n/url'

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
