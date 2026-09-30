'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import NewsletterForm from '@/components/newsletter/NewsletterForm'
import { chapterSlotTakesForm } from '@/lib/newsletter/placement'
import { inChapterDestination, isPlainClick, pageOfSection } from '@/lib/content/chapter-pager'
import { prefersReducedMotion } from '@/lib/utils/motion'
import styles from './chapter-page.module.scss'

/**
 * Makes a paginated chapter read as one document. It wraps the server-rendered
 * page, loads the neighbouring pages as the reader scrolls towards them, keeps the
 * URL and the title on the page in view, places the mid-content newsletter forms,
 * and scrolls to a link's target in place when it's already loaded.
 *
 * Without JavaScript none of this runs, and the page is what the server rendered:
 * its own sections between two `<nav>` placeholders that link to the neighbouring
 * pages.
 *
 * ## Loading
 *
 * Each placeholder is also the sentinel for its direction. When it comes within
 * `LOAD_MARGIN` of the viewport, the neighbouring page's exported HTML is fetched
 * and only its `[data-chapter-page]` wrapper is kept, so its payload never loads.
 * The body is server components apart from `next/link`, which works as a plain
 * `<a>`, and its math is already rendered, so the fragment needs no hydration. It
 * goes into a `div` of its own through `dangerouslySetInnerHTML`, which React
 * leaves alone as long as the prop keeps its identity (`Markup`). The fetched page's own placeholder then takes over the slot,
 * link text and all. One request at a time per direction, and a failed one leaves
 * the link in place.
 *
 * ## Prepending without a jump
 *
 * A page inserted above the viewport pushes everything down by its height. So an
 * element in view is measured just before the commit and the page is scrolled by
 * however far it moved (`holdViewport`). Newsletter forms placed above the
 * viewport, on arrival or by a prepend, are held the same way, in a commit that
 * runs before the browser paints.
 *
 * The browser's own scroll anchoring stays on, and mostly gets there first: the
 * hold measures after it and finds at most a fraction of a pixel left, so the two
 * never correct the same shift twice. The hold matters at scroll offset 0, where
 * the browser doesn't anchor, which is where a reader landing on the top of a later
 * page is when the page above it arrives. Turning anchoring off with
 * `overflow-anchor: none` would also turn it off for everything else in the chapter
 * body, and after a fragment arrival the fonts and formulas above the target are
 * still settling: the target would drift under the sticky header.
 *
 * ## Waiting for the arrival scroll
 *
 * `scroll-behavior: smooth` on `:root` makes the browser's scroll to the URL's
 * fragment a smooth one, and it can start after hydration and take a second or
 * more. A hold is an instant scroll, which would cancel it and leave the reader
 * short of the fragment. So on a fragment arrival the pager places no form and
 * loads no page until that scroll has come to rest (`waitForArrival`), the wait
 * `ArrivalMarker` makes before its gesture.
 *
 * ## URL, title and page views
 *
 * The page crossing `URL_LINE` is the page in view. When it changes, the title is
 * set to that page's `<title>` and the URL is swapped with `history.replaceState`,
 * never `pushState`, so Back still leaves the chapter. The App Router patches
 * `replaceState` to keep `usePathname` in step, and `ConsentGate` sends one
 * `page_view` per pathname, so each crossing is one page view.
 *
 * ## Newsletter forms
 *
 * The server renders an empty, hidden `[data-newsletter-slot]` before every section
 * but the chapter's first, and a fetched page brings its own. Which slots get a form
 * is `chapterSlotTakesForm`, counted from the page the reader arrived on. A form
 * renders through a portal into its slot, and a slot is never evaluated again once
 * it has one, so no form moves.
 *
 * ## Links inside the chapter
 *
 * A plain click on a same-tab link to another page of this chapter, whose target is
 * already in the document, scrolls to it and swaps the URL without a navigation.
 * Everything else is left to the browser: a target that isn't loaded yet is a full
 * page load, and the body's references, which open a new tab (`InlineText`), still
 * do.
 *
 * A single-page chapter only places forms: it has no placeholders to watch, no
 * boundary to cross and no other page to link to.
 */

/** How far outside the viewport a placeholder starts its page loading. */
const LOAD_MARGIN = '150% 0px'

/** A thin band a quarter of the way down the viewport: the page it crosses is in view. */
const URL_LINE = '-25% 0px -74% 0px'

/** Frames with an unchanged scroll offset that count as the arrival scroll at rest. */
const SETTLE_FRAMES = 2

/** How long the pager waits for the arrival scroll before it goes ahead anyway. */
const SETTLE_LIMIT_MS = 4000

/**
 * Markup for `dangerouslySetInnerHTML`, created once per fetched page. React 19
 * compares the prop by identity and sets `innerHTML` again whenever it's a new
 * object, which would replace the slots the forms are portalled into.
 */
interface Markup {
  __html: string
}

interface LoadedPage {
  index: number
  markup: Markup
  title: string
  /** The fetched page's own placeholders, which take over once it's in the document. */
  prevSlotMarkup: Markup | null
  nextSlotMarkup: Markup | null
}

interface PlacedForm {
  slot: number
  element: HTMLElement
}

type Direction = 'prev' | 'next'

interface ChapterPagerProps {
  /** The chapter's `name`, which a fetched page has to carry on its `<article>`. */
  chapter: string
  locale: string
  /** The page the server rendered, 1-based. */
  page: number
  /** Every page's URL, page 1 first. */
  pageUrls: string[]
  /** The chapter-global index of each page's first section, page 1 first. */
  pageFirstSections: number[]
  sectionCount: number
  /** The server-rendered placeholder links to the neighbouring pages. */
  prevLink?: ReactNode
  nextLink?: ReactNode
  /** The server-rendered page wrapper. */
  children: ReactNode
}

export default function ChapterPager({
  chapter,
  locale,
  page,
  pageUrls,
  pageFirstSections,
  sectionCount,
  prevLink,
  nextLink,
  children,
}: ChapterPagerProps) {
  const [loaded, setLoaded] = useState<LoadedPage[]>([])
  const [placed, setPlaced] = useState<PlacedForm[]>([])
  const [arrived, setArrived] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inFlight = useRef<Record<Direction, boolean>>({ prev: false, next: false })
  const pendingHold = useRef<(() => void) | null>(null)
  const titles = useRef(new Map<number, string>())
  const shownPage = useRef(page)

  const paginated = pageUrls.length > 1
  const arrival = pageFirstSections[page - 1]
  const before = loaded.filter((p) => p.index < page)
  const after = loaded.filter((p) => p.index > page)
  const firstInDocument = before[0]
  const lastInDocument = after[after.length - 1]
  const prevPage = (firstInDocument?.index ?? page) - 1
  const nextPage = (lastInDocument?.index ?? page) + 1
  const prevSlotMarkup = firstInDocument ? firstInDocument.prevSlotMarkup : null
  const nextSlotMarkup = lastInDocument ? lastInDocument.nextSlotMarkup : null
  const hasPrevSlot =
    prevPage >= 1 && (firstInDocument ? prevSlotMarkup !== null : prevLink !== undefined)
  const hasNextSlot =
    nextPage <= pageUrls.length && (lastInDocument ? nextSlotMarkup !== null : nextLink !== undefined)

  useEffect(() => {
    titles.current.set(page, document.title)
  }, [page])

  const load = useCallback(
    async (direction: Direction, index: number) => {
      if (inFlight.current[direction]) return
      inFlight.current[direction] = true
      try {
        const response = await fetch(pageUrls[index - 1])
        if (!response.ok) return
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html')
        const fetched = readFetchedPage(doc, chapter, index)
        if (!fetched || !containerRef.current) return
        titles.current.set(index, fetched.title)
        pendingHold.current = holdViewport(containerRef.current)
        flushSync(() => {
          setLoaded((current) =>
            current.some((p) => p.index === index)
              ? current
              : [...current, fetched].sort((a, b) => a.index - b.index),
          )
        })
      } catch {
        // The placeholder link stays, and following it is a full page load.
      } finally {
        inFlight.current[direction] = false
      }
    },
    [chapter, pageUrls],
  )

  useLayoutEffect(() => {
    const target = fragmentTarget()
    if (!target || !containerRef.current?.contains(target)) {
      setArrived(true)
      return
    }
    return waitForArrival(target, () => setArrived(true))
  }, [])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!arrived || !container) return
    const loadedPages = new Set([page, ...loaded.map((p) => p.index)])
    const filled = new Set(placed.map((form) => form.slot))
    const additions: PlacedForm[] = []
    for (const element of container.querySelectorAll<HTMLElement>('[data-newsletter-slot]')) {
      const slot = Number(element.dataset.newsletterSlot)
      if (filled.has(slot)) continue
      const sectionBeforeLoaded = loadedPages.has(pageOfSection(pageFirstSections, slot - 1))
      if (chapterSlotTakesForm({ sectionCount, arrival, slot, sectionBeforeLoaded })) {
        additions.push({ slot, element })
      }
    }
    if (additions.length > 0) {
      pendingHold.current ??= holdViewport(container)
      for (const { element } of additions) element.hidden = false
      setPlaced((current) => [...current, ...additions])
      return
    }
    pendingHold.current?.()
    pendingHold.current = null
  }, [arrived, loaded, placed, page, arrival, pageFirstSections, sectionCount])

  useEffect(() => {
    const container = containerRef.current
    if (!paginated || !arrived || !container) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const slot = entry.target as HTMLElement
          load(slot.dataset.chapterSlot as Direction, Number(slot.dataset.page))
        }
      },
      { rootMargin: LOAD_MARGIN },
    )
    for (const slot of container.querySelectorAll(':scope > [data-chapter-slot]')) observer.observe(slot)
    return () => observer.disconnect()
  }, [paginated, arrived, load, prevPage, nextPage])

  const showPage = useCallback(
    (index: number, hash: string) => {
      shownPage.current = index
      const title = titles.current.get(index)
      if (title) document.title = title
      window.history.replaceState(null, '', pageUrls[index - 1] + window.location.search + hash)
    },
    [pageUrls],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!paginated || !container) return
    const observer = new IntersectionObserver(
      (entries) => {
        const crossing = entries.filter((entry) => entry.isIntersecting).pop()
        if (!crossing) return
        const index = Number((crossing.target as HTMLElement).dataset.chapterPage)
        if (index !== shownPage.current) showPage(index, '')
      },
      { rootMargin: URL_LINE },
    )
    for (const wrapper of container.querySelectorAll(':scope > [data-chapter-page]')) observer.observe(wrapper)
    return () => observer.disconnect()
  }, [paginated, loaded, showPage])

  useEffect(() => {
    const article = containerRef.current?.closest('article')
    if (!paginated || !article) return
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || !isPlainClick(event)) return
      if (!(event.target instanceof Element)) return
      const link = event.target.closest('a[href]')
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute('download')) return
      if (link.target !== '' && link.target !== '_self') return
      const destination = inChapterDestination(link.href, window.location.href, pageUrls)
      if (!destination) return
      const target = destination.anchor
        ? document.getElementById(destination.anchor)
        : containerRef.current?.querySelector(`:scope > [data-chapter-page="${destination.page}"]`)
      if (!target) return
      event.preventDefault()
      target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'instant' : 'smooth' })
      showPage(destination.page, destination.anchor ? `#${destination.anchor}` : '')
    }
    article.addEventListener('click', onClick)
    return () => article.removeEventListener('click', onClick)
  }, [paginated, pageUrls, showPage])

  return (
    <div ref={containerRef}>
      {hasPrevSlot && (
        <PageSlot key={`prev-${prevPage}`} direction="prev" page={prevPage} markup={prevSlotMarkup}>
          {prevLink}
        </PageSlot>
      )}
      {before.map((p) => (
        <div key={p.index} data-chapter-page={p.index} dangerouslySetInnerHTML={p.markup} />
      ))}
      {children}
      {after.map((p) => (
        <div key={p.index} data-chapter-page={p.index} dangerouslySetInnerHTML={p.markup} />
      ))}
      {hasNextSlot && (
        <PageSlot key={`next-${nextPage}`} direction="next" page={nextPage} markup={nextSlotMarkup}>
          {nextLink}
        </PageSlot>
      )}
      {placed.map(({ slot, element }) =>
        createPortal(
          <NewsletterForm locale={locale} placement="mid-content" instance={`mid-content-${slot}`} />,
          element,
          `mid-content-${slot}`,
        ),
      )}
    </div>
  )
}

/**
 * A placeholder: the server-rendered link while the neighbouring page is the
 * server's own neighbour, and the fetched page's placeholder markup after that.
 */
function PageSlot({
  direction,
  page,
  markup,
  children,
}: {
  direction: Direction
  page: number
  markup: Markup | null
  children: ReactNode
}) {
  const shared = { className: styles['page-slot'], 'data-chapter-slot': direction, 'data-page': page }
  return markup === null ? <nav {...shared}>{children}</nav> : <nav {...shared} dangerouslySetInnerHTML={markup} />
}

/**
 * The parts of a fetched page the pager uses, or null when it isn't the expected
 * page of this chapter, which the pager then treats like a failed fetch.
 */
function readFetchedPage(doc: Document, chapter: string, index: number): LoadedPage | null {
  if (doc.querySelector('article[data-chapter]')?.getAttribute('data-chapter') !== chapter) return null
  const wrapper = doc.querySelector(`[data-chapter-page="${index}"]`)
  if (!wrapper) return null
  const slotMarkup = (direction: Direction) => {
    const slot = doc.querySelector(`[data-chapter-slot="${direction}"]`)
    return slot ? { __html: slot.innerHTML } : null
  }
  return {
    index,
    markup: { __html: wrapper.innerHTML },
    title: doc.title,
    prevSlotMarkup: slotMarkup('prev'),
    nextSlotMarkup: slotMarkup('next'),
  }
}

/**
 * The element the URL's fragment names. Decoded, because a pasted URL often
 * percent-encodes its fragment and an `id` never is; `getElementById`, because an
 * anchor's `.` is a class separator in a selector.
 */
function fragmentTarget(): HTMLElement | null {
  try {
    const anchor = decodeURIComponent(window.location.hash.slice(1))
    return anchor ? document.getElementById(anchor) : null
  } catch {
    return null
  }
}

/**
 * Calls `onArrived` once the scroll to `target` has come to rest: the offset
 * unchanged for `SETTLE_FRAMES` frames with the target in the viewport, or after
 * `SETTLE_LIMIT_MS` whatever the scroll is doing. The viewport half matters on a
 * document load, where the scroll hasn't started yet when this first runs. Returns
 * the cancel.
 */
function waitForArrival(target: HTMLElement, onArrived: () => void): () => void {
  const startedAt = performance.now()
  let stillFrames = 0
  let previousY = Number.NaN
  let frame = 0
  const check = (now: number) => {
    const y = window.scrollY
    stillFrames = y === previousY ? stillFrames + 1 : 0
    previousY = y
    const { top, bottom } = target.getBoundingClientRect()
    const landed = stillFrames >= SETTLE_FRAMES && bottom > 0 && top < window.innerHeight
    if (landed || now - startedAt >= SETTLE_LIMIT_MS) onArrived()
    else frame = requestAnimationFrame(check)
  }
  frame = requestAnimationFrame(check)
  return () => cancelAnimationFrame(frame)
}

/**
 * Measures the first element of the chapter body that reaches into the viewport,
 * and returns what puts it back: a scroll by however far it has moved since. Call
 * it just before a change and run the result just after, before the browser paints.
 *
 * An element that has scrolled off the top can't move the view, and a hidden slot
 * has no box, so both are skipped. When the whole body is above the viewport, its
 * bottom edge is what the view hangs from instead. When it's all below, a change
 * inside it moves nothing the reader sees.
 */
function holdViewport(container: HTMLElement): () => void {
  for (const element of container.querySelectorAll<HTMLElement>(':scope > [data-chapter-page] > *')) {
    const { top, bottom, height } = element.getBoundingClientRect()
    if (height === 0 || bottom <= 0) continue
    return () => scrollByDrift(element.getBoundingClientRect().top - top)
  }
  const { bottom } = container.getBoundingClientRect()
  if (bottom > 0) return () => {}
  return () => scrollByDrift(container.getBoundingClientRect().bottom - bottom)
}

function scrollByDrift(drift: number) {
  if (Math.abs(drift) >= 1) window.scrollBy({ top: drift, behavior: 'instant' })
}
