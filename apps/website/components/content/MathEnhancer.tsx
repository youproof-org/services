'use client'

import { useEffect } from 'react'
import { ARRIVAL_EVENT } from '@/lib/kb/highlight'
import { TEX_SOURCE_CLASS, typeset } from '@/lib/utils/math'

const PENDING_SELECTOR = `.${TEX_SOURCE_CLASS}`
const SLICE_MS = 8
const SETTLE_MS = 200
const READING_LINE = 0.3
const ARRIVAL_SCREENS = 2
const READER_INPUT = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const

const whenIdle = (callback: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(callback) : setTimeout(callback, 50)

function fragmentTarget(): Element | null {
  const id = decodeURIComponent(window.location.hash.slice(1))
  return id ? document.getElementById(id) : null
}


/**
 * What the reader is looking at: the element under a line a third of the way down
 * the viewport, below the sticky header. A formula is never chosen itself, since
 * the swap replaces it; its wrapper stays.
 */
function readingAnchor(): Element | null {
  const hit = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * READING_LINE)
  if (!hit?.closest('.page-root')) return null
  return hit.closest(PENDING_SELECTOR)?.parentElement ?? hit
}

/**
 * Typesets each formula the server shipped as LaTeX source (see `mathSource`).
 * Formulas within a viewport of the screen go first; the rest follow while the
 * browser is idle. The work is cut into slices so a dense chapter never blocks
 * scrolling. `?math=source` skips it, to see the page as served.
 *
 * A typeset formula is a different size from its source, so a swap moves
 * everything below it. On arrival, the formulas from where the reader is sent down
 * to two screens below it go first and at once, scroll or no scroll: nothing above
 * that point moves, so neither does a smooth scroll's destination, and the reader
 * lands on typeset math. Where the reader is sent is the fragment target, or the
 * reference a highlight arrival scrolls to instead (`ARRIVAL_EVENT`). Two rules
 * keep the reader where they are for the rest:
 *
 *   - Nothing is swapped while the page is scrolling, or just after new content or
 *     an arrival. A smooth scroll to an anchor fixes its destination when it
 *     starts, so content growing above the anchor mid-scroll lands the reader
 *     short of it.
 *   - Each slice keeps one element where it was on screen, scrolling by however
 *     far the slice moved it: the arrival target until the reader scrolls, clicks
 *     or types, since its own formulas grow too and its top must stay in view; the
 *     element at the reading line after that. Safari has no scroll anchoring of its
 *     own, and the formula Chrome anchors to can be the one being replaced.
 */
export default function MathEnhancer() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('math') === 'source') return

    let stopped = false
    let pumpScheduled = false
    let unsettledAt = performance.now()
    let ownScrollY: number | null = null
    let arrivedAtFragment = true
    const nearViewport = new Set<Element>()
    let aroundFragment: Element[] = []
    let highlightTarget: Element | null = null
    let arrivedAtPage = window.location.pathname + window.location.hash

    const arrivalTarget = () => (highlightTarget?.isConnected ? highlightTarget : fragmentTarget())

    const arrivalTargetOnScreen = () => {
      const target = arrivalTarget()
      if (!target) return null
      const { top, bottom } = target.getBoundingClientRect()
      return bottom > 0 && top < window.innerHeight ? target : null
    }

    const enhance = (formula: Element) => {
      if (!formula.isConnected) return
      const template = document.createElement('template')
      template.innerHTML = typeset(formula.textContent ?? '', formula.hasAttribute('data-display'))
      formula.replaceWith(template.content)
    }

    const typesetAroundFragment = () => {
      const sliceStart = performance.now()
      while (aroundFragment.length > 0 && performance.now() - sliceStart < SLICE_MS) {
        enhance(aroundFragment.shift()!)
      }
      if (aroundFragment.length > 0 && !stopped) setTimeout(typesetAroundFragment)
    }

    const queueAroundFragment = () => {
      const target = arrivalTarget()
      if (!target) return
      const reach = target.getBoundingClientRect().top + window.innerHeight * ARRIVAL_SCREENS
      const wasIdle = aroundFragment.length === 0
      aroundFragment = [...document.querySelectorAll(PENDING_SELECTOR)].filter(
        (formula) =>
          target.compareDocumentPosition(formula) & Node.DOCUMENT_POSITION_FOLLOWING &&
          formula.getBoundingClientRect().top < reach,
      )
      if (wasIdle) typesetAroundFragment()
    }

    const keepingReadingPosition = (work: () => void) => {
      const anchor = (arrivedAtFragment && arrivalTargetOnScreen()) || readingAnchor()
      const before = anchor?.getBoundingClientRect().top
      work()
      if (!anchor?.isConnected || before === undefined) return
      const moved = anchor.getBoundingClientRect().top - before
      if (Math.abs(moved) < 1) return
      window.scrollBy({ top: moved, behavior: 'instant' })
      ownScrollY = window.scrollY
    }

    const nextSlice = () => {
      const sliceStart = performance.now()
      const inTime = () => performance.now() - sliceStart < SLICE_MS
      for (const formula of nearViewport) {
        if (!inTime()) return true
        nearViewport.delete(formula)
        enhance(formula)
      }
      for (const formula of document.querySelectorAll(PENDING_SELECTOR)) {
        if (!inTime()) return true
        intersection.unobserve(formula)
        enhance(formula)
      }
      return false
    }

    const schedulePump = () => {
      if (pumpScheduled || stopped) return
      pumpScheduled = true
      const unsettledFor = SETTLE_MS - (performance.now() - unsettledAt)
      const run = () => {
        pumpScheduled = false
        if (stopped) return
        if (performance.now() - unsettledAt < SETTLE_MS) return schedulePump()
        let more = false
        keepingReadingPosition(() => (more = nextSlice()))
        if (more) schedulePump()
      }
      if (unsettledFor > 0) setTimeout(run, unsettledFor)
      else if (nearViewport.size > 0) setTimeout(run)
      else whenIdle(run)
    }

    const unsettle = () => {
      unsettledAt = performance.now()
      schedulePump()
    }

    const arrive = () => {
      arrivedAtPage = window.location.pathname + window.location.hash
      highlightTarget = null
      arrivedAtFragment = true
      queueAroundFragment()
      unsettle()
    }

    const arriveAtHighlight = (event: Event) => {
      if (!(event.target instanceof Element)) return
      highlightTarget = event.target
      arrivedAtFragment = true
      queueAroundFragment()
      unsettle()
    }

    const leaveFragment = () => {
      arrivedAtFragment = false
    }

    const onScroll = () => {
      if (ownScrollY !== null && Math.abs(window.scrollY - ownScrollY) < 1) return
      ownScrollY = null
      unsettle()
    }

    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          intersection.unobserve(entry.target)
          nearViewport.add(entry.target)
        }
        schedulePump()
      },
      { rootMargin: '100% 0px' },
    )

    const observeWithin = (root: ParentNode) =>
      root.querySelectorAll(PENDING_SELECTOR).forEach((el) => intersection.observe(el))

    const mutations = new MutationObserver((records) => {
      let arrived = false
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return
          if (node.matches(PENDING_SELECTOR)) {
            arrived = true
            intersection.observe(node)
          }
          if (node.querySelector(PENDING_SELECTOR)) {
            arrived = true
            observeWithin(node)
          }
        })
      }
      if (!arrived) return
      if (window.location.pathname + window.location.hash === arrivedAtPage) unsettle()
      else arrive()
    })

    observeWithin(document)
    queueAroundFragment()
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('hashchange', arrive)
    document.addEventListener(ARRIVAL_EVENT, arriveAtHighlight)
    READER_INPUT.forEach((type) => window.addEventListener(type, leaveFragment, { passive: true, capture: true }))
    schedulePump()
    return () => {
      stopped = true
      intersection.disconnect()
      mutations.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('hashchange', arrive)
      document.removeEventListener(ARRIVAL_EVENT, arriveAtHighlight)
      READER_INPUT.forEach((type) => window.removeEventListener(type, leaveFragment, { capture: true }))
    }
  }, [])

  return null
}
