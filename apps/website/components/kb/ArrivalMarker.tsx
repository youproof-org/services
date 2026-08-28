'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { anchorMarksTarget } from '@/lib/content/urls'
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config'
import { prefersReducedMotion } from '@/lib/utils/motion'
import styles from './arrival-marker.module.scss'

/**
 * The arrival marker (sub-plan §6.2, D5): land on a fragment and the thing it named
 * is framed for a moment, then the frame goes.
 *
 * Scrolling alone is not enough on these pages. A term is a few words inside a
 * paragraph and a claim one item among several, so a reader who follows a
 * cross-reference lands on a screen of text with nothing saying which part of it was
 * the point. The scroll is unchanged — the browser's, or the router's, exactly as
 * today — and this is purely the "here" gesture on top of it. **No lasting change to
 * the element**: the target is never given a class or an attribute, and nothing about
 * it is different once the frame has gone.
 *
 * ## Where it mounts, and why that is not a detail
 *
 * In `app/layout.tsx`, **outside `.page-root`**. That wrapper carries `transform:
 * translateZ(0)` (a Chromium stale-tile fix — see `app/globals.scss`), and a
 * transform makes the element the containing block for `position: fixed` descendants:
 * a marker inside it would place itself against the document instead of the
 * viewport, which for a target halfway down a chapter means a frame drawn a screenful
 * or more away from it. The comment on `<body>` in the layout asks that anything
 * viewport-fixed stay out here, and this is one of those things.
 *
 * Being out here is also why the marker is site-wide rather than a piece of the
 * entity chrome: the layout is above every route, so a chapter arrival gets the same
 * gesture as an entity one, which is what §6.2 asks for.
 *
 * ## Which arrivals get a mark
 *
 * `anchorMarksTarget` in `lib/content/urls.ts` decides, and it lives there because it
 * is the inverse of the five builders that produce every anchor on the site:
 * `kbAnchorPath`, `termAnchorId` and `claimAnchorId` are marked, `sectionAnchorId`
 * and `partAnchorId` are not (D5). A section or a part anchor lands on a heading
 * bearing its own name, so a mark there would be noise.
 *
 * ## What counts as an arrival
 *
 * Four sources, because there are four ways the fragment can change:
 *
 *   - **the fragment the document loaded on** — a copied link, a bookmark, or a
 *     reference mark opening in a new tab, which is what a body reference does on a
 *     chapter page (`target="_blank"`, see `components/content/InlineText.tsx`);
 *   - **`hashchange`** — a fragment link pressed on the page the reader is already
 *     on, and a Back or Forward step between two entries whose fragments differ;
 *   - **a route change** — a `<Link>` into another page's fragment, which the App
 *     Router serves without a document load. `usePathname` is what notices it;
 *   - **a click on a link carrying a fragment**, watched for a moment afterwards,
 *     which is the one case none of the three above can see. A `<Link>` to a fragment
 *     on the page the reader is already on changes the URL with `history.pushState`:
 *     that fires no `hashchange` (nothing does, for a scripted history change), no
 *     `popstate`, and no path change for `usePathname` to report. Measured — the URL
 *     moved and not one of the three fired. It is not hypothetical either: the export
 *     carries three such links, all of them a reference panel offering a claim that
 *     lives on the entity page the reader is on (`components/kb/panels/ReferencePanel.tsx`).
 *
 * The check is deferred by one animation frame in both the mount and the route-change
 * case, so it reads a URL the App Router has finished settling rather than racing it.
 * It is deliberately NOT waiting for the scroll — measured, the arrival scroll has not
 * even started by then — and that wait belongs to the gesture instead; see
 * `SETTLE_FRAMES`.
 *
 * **It must not fire for a scroll the page performs itself** (§6.2, and phase 16's
 * note on `scrollSelectionIntoUpperHalf`): the overlay has already said what is
 * selected by lighting it alone, and a mark on top of that is a second answer to a
 * question the reader has had answered. Nothing here listens to `scroll`, and the
 * selection scroll changes neither the path nor the fragment — `EntityChrome` pushes
 * its history entries with no url argument at all, precisely so the address bar keeps
 * the page's single URL — so none of the three sources above can see it.
 *
 * `popstate` is deliberately NOT a fourth source. Every chrome state is a history
 * entry on the same URL, so a back step out of a selection fires `popstate` with the
 * fragment unchanged; taking that as an arrival would mark the page's fragment again
 * every time the reader pressed Vissza. `hashchange` already covers the traversals
 * that DO change the fragment, and `lastArrival` below is the second guard.
 *
 * ## Why every frame is drawn from here
 *
 * The frame is `position: fixed` — it has to be, being out here — so it is placed in
 * viewport coordinates around an element that lives in document ones, and any movement
 * of the page between two frames makes it wrong. Nothing stops that movement while the
 * mark is up: the page is not scroll-locked (that is the panel's behaviour, §6.4), and
 * a chapter is still settling for a few hundred milliseconds after it arrives —
 * measured on `alice-es-bob-gyuruje`, the document grows 168px over the first 300ms as
 * fonts and formulas land. So the geometry is re-measured and rewritten on every frame
 * rather than handed to a CSS transition once, and `arrival-marker.module.scss` holds
 * only what does not change.
 *
 * The same loop is what makes reduced motion a decision rather than a `@media` block:
 * §6.4 asks for the mark to appear at its final size and fade, and the final size is a
 * number the loop already computes. And it is what lets the gesture wait for the
 * arrival scroll to finish — see `SETTLE_FRAMES`, which is the one thing about this
 * phase that could not be worked out on paper.
 */

/** How long the rectangle takes to close onto its target. */
const SHRINK_MS = 320

/** How long it is held there once it has arrived — §6.2's "held for a moment". */
const HOLD_MS = 420

/** And how long it takes to go. */
const FADE_MS = 260

/**
 * How far outside the target the frame starts, and where it ends up, in CSS pixels.
 *
 * `TIGHT` is §6.2's "framing it tightly": far enough out not to sit on the glyphs,
 * close enough that it is unmistakably around THIS phrase and not the paragraph.
 * `WIDE` is where the shrink begins, and it is a fixed distance rather than a
 * multiple of the target's size on purpose — a claim block is a hundred times the
 * area of a two-word term, and a proportional start would give the block a rectangle
 * the size of the screen and the term one nobody would see move.
 */
const OUTSET_TIGHT = 4
const OUTSET_WIDE = 26

/**
 * The gesture waits for the arrival scroll to finish before it starts, and this is
 * how "finished" is decided: the page's scroll offset unchanged for this many
 * consecutive frames, with the target somewhere in the viewport.
 *
 * **Why it waits at all.** "Scroll as today" turns out to mean a SMOOTH scroll, and a
 * long one. `app/globals.scss` puts `scroll-behavior: smooth` on `:root`, and a
 * cross-chapter arrival can be tens of thousands of pixels: measured on
 * `alice-es-bob-gyuruje#definiciok.gyuru-test.fogalmak.gyuru`, the target starts 34000px
 * down and the page takes about 1.5 seconds to ease onto it. A gesture that began when
 * the FRAGMENT arrived would therefore play out in full while the target was still a
 * screen or thirty away — the whole second of it off-screen, marking nothing the reader
 * could see. Showing the reader where they landed is this component's only job, so it
 * starts when they have landed.
 *
 * Two conditions rather than one, and the viewport half is what makes the pair sound:
 * on a document load the scroll has not started yet when this first runs, so "still"
 * alone would fire immediately, before the page had moved at all.
 */
const SETTLE_FRAMES = 2

/**
 * …and how long it will wait for that. A scroll that has not come to rest in four
 * seconds is not going to, and a mark whose target is off-screen is a smaller failure
 * than no mark at all — the reader who was sent somewhere gets the gesture either way.
 * Four seconds against a measured worst case of about 1.5.
 */
const SETTLE_LIMIT_MS = 4000

/**
 * How many frames the fragment is re-read for after a link carrying one is pressed.
 *
 * Long enough for the App Router to have finished a same-page hash navigation, short
 * enough to be a moment rather than a standing cost — nothing polls on this page
 * otherwise, and nothing should. A press that changed no fragment simply spends these
 * frames finding the key unchanged and doing nothing, which is why no guard is needed
 * for the two body clicks that call `preventDefault` (`components/kb/EntityChrome.tsx`):
 * a navigation that did not happen cannot be mistaken for an arrival.
 */
const CLICK_WATCH_FRAMES = 30

/**
 * `useLayoutEffect` warns when it runs under the server renderer; this does not.
 * The same guard `components/kb/Panel.tsx` uses, and for the same reason: this
 * component is server-rendered (it renders nothing there, but the hook is still
 * called), and the first measurement below has to happen before a paint.
 */
const useMarkerEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The page's own locale, which is what both halves of an anchor are localized in. */
function pageLocale(): string {
  const lang = document.documentElement.lang
  return isLocale(lang) ? lang : DEFAULT_LOCALE
}

/**
 * One arrival, as a value that is never equal to another.
 *
 * The counter is what makes it so, and it is needed: two arrivals can name the same
 * anchor — the reader follows a reference into a chapter, goes back, follows it again
 * — and `setState` with an equal value re-renders nothing, which would leave the
 * second arrival unmarked.
 */
interface Arrival {
  anchor: string
  n: number
}

export default function ArrivalMarker() {
  const pathname = usePathname()
  const [arrival, setArrival] = useState<Arrival | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  /**
   * The path-and-fragment the marker last acted on, so one arrival is marked once.
   *
   * A route change and a `hashchange` can both describe the same arrival — a `<Link>`
   * to another page's fragment is one navigation, not two — and a Vissza press inside
   * the chrome must not look like a new arrival at the fragment the page is already
   * on. Both halves are in the key because either can change alone.
   */
  const lastArrival = useRef<string | null>(null)

  /**
   * Read the fragment; mark its target if it is one of the marked kinds and this is
   * not the arrival already acted on. All four sources go through this one function.
   */
  const check = useCallback(() => {
    // Decoded, because a URL's fragment may be percent-encoded — a copied or pasted
    // link commonly is — while the `id` it has to be matched against never is. Every
    // segment of an anchor is ASCII in the one locale that exists today, but both
    // halves are authored per locale (`lib/content/urls.ts`) and nothing promises the
    // next one will be.
    const anchor = decodeURIComponent(window.location.hash.slice(1))
    const key = `${window.location.pathname}#${anchor}`
    if (key === lastArrival.current) return
    lastArrival.current = key
    // `getElementById`, not `querySelector`: `.` separates an anchor's segments and is
    // a class separator in a selector (see `lib/content/urls.ts`).
    const marked =
      anchor !== '' &&
      anchorMarksTarget(pageLocale(), anchor) &&
      document.getElementById(anchor) !== null
    // Cleared rather than left alone when this arrival is not one to mark, so a
    // section arrival taken while a previous mark is still on screen ends it.
    setArrival((current) => (marked ? { anchor, n: (current?.n ?? 0) + 1 } : null))
  }, [])

  useEffect(() => {
    // One frame late on purpose: on a route change the App Router has the new URL and
    // the new DOM to settle, and reading either mid-navigation would answer about the
    // page being left. NOT a wait for the scroll — measured, the arrival scroll has
    // not begun by then, and waiting for it is the gesture's own job (`SETTLE_FRAMES`).
    // `hashchange` needs no deferral at all: the fragment is already the new one when
    // it fires.
    const frame = requestAnimationFrame(check)
    window.addEventListener('hashchange', check)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('hashchange', check)
    }
  }, [pathname, check])

  /**
   * The fourth source: a press on a link carrying a fragment, followed for a moment.
   *
   * On `document`, because what is pressed is a link anywhere on the page — in the
   * prose, in a panel, in the navigation — and none of it is this component's to hand a
   * handler to. It does not decide anything: it only re-reads the fragment for the next
   * `CLICK_WATCH_FRAMES` frames, and `check` is what decides, exactly as for the other
   * three. So a press that navigates nowhere costs half a second of finding nothing
   * changed.
   */
  useEffect(() => {
    let frames = 0
    let watch = 0
    const reread = () => {
      check()
      if (frames++ < CLICK_WATCH_FRAMES) watch = requestAnimationFrame(reread)
    }
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return
      if (!event.target.closest('a[href*="#"]')) return
      cancelAnimationFrame(watch)
      frames = 0
      watch = requestAnimationFrame(reread)
    }
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('click', onClick)
      cancelAnimationFrame(watch)
    }
  }, [check])

  /**
   * The gesture: close onto the target, hold, fade, gone.
   *
   * A layout effect, so the first measurement is written before the browser paints
   * the commit that created the element — the stylesheet's `opacity: 0` is what would
   * otherwise be on screen for that frame.
   *
   * The target is re-measured every frame rather than once, because it may still be
   * moving: `scroll-behavior: smooth` eases a same-page fragment into place, and a
   * marker fixed to the viewport has to follow it. Re-reading it also means the frame
   * simply follows a target the reader scrolls away from, instead of being left
   * behind at a stale position.
   */
  useMarkerEffect(() => {
    if (!arrival) return
    const element = document.getElementById(arrival.anchor)
    const node = box.current
    if (!element || !node) return

    const reduced = prefersReducedMotion()
    // §6.4: the mark appears at its final size and fades. Not removed — showing the
    // reader where they landed is its whole job — and nothing is shortened either;
    // only the closing movement is dropped, so the frame is up for as long.
    const shrinkMs = reduced ? 0 : SHRINK_MS
    const fadeAt = shrinkMs + HOLD_MS

    let frame = 0
    let done = false
    /** 0 while the loop is still waiting for the arrival scroll to come to rest. */
    let started = 0
    let stillFrames = 0
    let previousY = Number.NaN
    const waitingSince = performance.now()

    const step = (now: number) => {
      const rect = element.getBoundingClientRect()

      if (started === 0) {
        const y = window.scrollY
        stillFrames = y === previousY ? stillFrames + 1 : 0
        previousY = y
        const landed =
          stillFrames >= SETTLE_FRAMES && rect.bottom > 0 && rect.top < window.innerHeight
        if (!landed && now - waitingSince < SETTLE_LIMIT_MS) {
          frame = requestAnimationFrame(step)
          return
        }
        started = now
      }

      const elapsed = now - started
      // The same shape and length the panel's slide and its scroll share
      // (`components/kb/Panel.tsx`): eased out, so the frame decelerates onto the
      // target rather than stopping dead on it.
      const closing = shrinkMs === 0 ? 1 : Math.min(1, elapsed / shrinkMs)
      const eased = 1 - (1 - closing) ** 3
      const outset = OUTSET_WIDE + (OUTSET_TIGHT - OUTSET_WIDE) * eased
      const opacity =
        elapsed <= fadeAt ? 1 : Math.max(0, 1 - (elapsed - fadeAt) / FADE_MS)

      const style = node.style
      style.top = `${rect.top - outset}px`
      style.left = `${rect.left - outset}px`
      style.width = `${rect.width + outset * 2}px`
      style.height = `${rect.height + outset * 2}px`
      style.opacity = `${opacity}`

      if (elapsed >= fadeAt + FADE_MS) {
        // Unmounted rather than left at zero opacity: §6.2 asks for the frame to be
        // gone, and a spent layer left in the DOM is the kind of thing that is
        // eventually found sitting over something.
        done = true
        setArrival(null)
        return
      }
      frame = requestAnimationFrame(step)
    }

    // Synchronously first, then per frame. Nothing is drawn by this call — it begins
    // the wait — and the element stays at the stylesheet's `opacity: 0` until the
    // first frame of the gesture writes a box.
    step(performance.now())
    return () => {
      if (!done) cancelAnimationFrame(frame)
    }
  }, [arrival])

  if (!arrival) return null
  return (
    <div
      ref={box}
      className={styles.marker}
      /*
        The handle the browser tests reach for, naming what is being marked. A
        `data-` attribute rather than the CSS-module class for the reason `PANEL_ID`
        is a literal (`components/kb/Panel.tsx`): `next.config.ts` derives a module
        class from the FILE NAME, so renaming the stylesheet would silently rename
        it. Carrying the anchor makes a trace of what the marker did readable rather
        than merely present.
      */
      data-kb-arrival-marker={arrival.anchor}
      /*
        Nothing to announce. The marker adds no information a reader gets any other
        way — it says "the thing you asked for is here", which a reader who cannot
        see the screen learns from the fragment they followed rather than from a
        rectangle. `Overlay` is `aria-hidden` for the same reason and records the same
        thing: the chrome's screen-reader story is a separate piece of work, and this
        is deliberately not a half of it. No string, and so no label in
        `lib/i18n/locales.json` either.
      */
      aria-hidden="true"
    />
  )
}
