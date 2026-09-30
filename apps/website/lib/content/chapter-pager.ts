/**
 * The pure half of `components/content/ChapterPager.tsx`: which page of a chapter a
 * section sits on, and where a link inside the chapter leads. No DOM here, so the
 * rules are unit-tested on their own (`test/chapter-pager.test.mjs`).
 */

/**
 * The 1-based page holding the section at chapter-global index `section`.
 * `pageFirstSections[p - 1]` is the global index of page `p`'s first section, so
 * the list is ascending and starts at 0.
 */
export function pageOfSection(pageFirstSections: readonly number[], section: number): number {
  let page = 1
  for (let p = 1; p < pageFirstSections.length; p++) {
    if (pageFirstSections[p] <= section) page = p + 1
  }
  return page
}

/** A page of this chapter, and the anchor on it a link names ('' for none). */
export interface InChapterDestination {
  page: number
  anchor: string
}

/**
 * Where a link leads when it leads to a page of this chapter, or null when it
 * leads anywhere else.
 *
 * A link to the page the URL already names is left to the browser, which scrolls
 * to a fragment of the document it's on by itself. A link with a query string is
 * left alone too, because the query means something to the page it arrives on
 * (the arrival highlight's parameter, for one). The anchor comes back decoded,
 * since the `id` it has to match never is.
 */
export function inChapterDestination(
  href: string,
  currentHref: string,
  pageUrls: readonly string[],
): InChapterDestination | null {
  let url: URL
  let current: URL
  try {
    url = new URL(href, currentHref)
    current = new URL(currentHref)
  } catch {
    return null
  }
  if (url.origin !== current.origin || url.search !== '' || url.pathname === current.pathname) return null
  const page = pageUrls.indexOf(url.pathname) + 1
  if (page === 0) return null
  let anchor: string
  try {
    anchor = decodeURIComponent(url.hash.slice(1))
  } catch {
    return null
  }
  return { page, anchor }
}

/** The mouse state of a click the page may take over: the primary button, no modifier. */
export interface ClickLike {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * Whether a click asks for this tab to follow the link. A modified or non-primary
 * click is the reader asking their browser for a new tab, a window or a download.
 */
export function isPlainClick(event: ClickLike): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
