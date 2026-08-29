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
 *
 * ## One gesture, one target or many
 *
 * `ArrivalMarks` below is the gesture, and it takes a LIST. This component is the
 * fragment half of §6.2 — one anchor, therefore one element — and
 * `components/kb/HighlightOnArrival.tsx` is the other caller: arriving from a
 * "Bejövő hivatkozások" row marks every reference in the source that points back at
 * where the reader came from (§7.2, D5), which on §7.2's worked case is nine of them
 * at once.
 *
 * One implementation rather than two, and that is not tidiness: D5 says the mark used
 * for a row arrival is "the same mark" as for an anchor arrival, so two copies of it
 * would be two chances for the site to make the same promise in two different
 * shapes. What generalises is the number of boxes drawn and the moment each of them
 * plays — a mark waits for its own target to be in front of the reader — while the
 * wait for the arrival scroll, the easing, the outsets, the hold, the fade and the
 * reduced-motion decision are one decision for the whole arrival. See `ArrivalMarks`.
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
 *
 * What the wait now decides is when the VISIBILITY GATE is armed, not when the boxes
 * start — a mark plays when its own target reaches the reader (`ArrivalMarks`). The
 * wait is still needed for exactly the reason above: armed mid-scroll, the gate would
 * fire for every mark the smooth scroll swept past on its way.
 */
const SETTLE_FRAMES = 2

/**
 * …and how long it will wait for that. A scroll that has not come to rest in four
 * seconds is not going to, so the wait gives up and hands over to the visibility gate
 * below — which is a real answer rather than a fallback: every mark then plays when
 * the reader has it in front of them, whether the page ever came to rest or not.
 * Four seconds against a measured worst case of about 1.5.
 */
const SETTLE_LIMIT_MS = 4000

/**
 * How far into the viewport a mark has to be before its gesture plays: past the
 * bottom edge of the sticky header, which is the top of the region that belongs to
 * the reader rather than to the chrome.
 *
 * Measured when the gate is armed rather than per entry, for `Panel`'s reason
 * (`upperHalfScrollTop`): an `IntersectionObserver`'s margins are fixed at
 * construction, and the header does not change height while a gesture is up.
 */
function headerInset(): number {
  const header = document.querySelector('header')
  return header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0
}

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
 * One thing to frame: the element, and the name the frame says it is marking.
 *
 * The element rather than an id, because the two callers find their targets in
 * different ways — this one by `getElementById` on the fragment, the highlight by
 * `querySelectorAll` on a validated fully qualified name (`lib/kb/highlight.ts`) —
 * and the gesture only ever needs to measure it. The name is carried through to
 * `data-kb-arrival-marker`, which is what a browser test reads to see what was
 * marked, so it is the anchor for a fragment arrival and the fully qualified name
 * for a highlight one.
 */
export interface ArrivalMark {
  element: HTMLElement
  name: string
}

/**
 * One arrival, as a value that is never equal to another.
 *
 * A fresh object each time is what makes it so, and that is needed: two arrivals can
 * name the same anchor — the reader follows a reference into a chapter, goes back,
 * follows it again — and `setState` with an equal value re-renders nothing, which
 * would leave the second arrival unmarked.
 */
interface Arrival {
  marks: readonly ArrivalMark[]
}

export default function ArrivalMarker() {
  const pathname = usePathname()
  const [arrival, setArrival] = useState<Arrival | null>(null)
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
    const target =
      anchor !== '' && anchorMarksTarget(pageLocale(), anchor)
        ? document.getElementById(anchor)
        : null
    // Cleared rather than left alone when this arrival is not one to mark, so a
    // section arrival taken while a previous mark is still on screen ends it.
    setArrival(target ? { marks: [{ element: target, name: anchor }] } : null)
  }, [])

  /**
   * Stable, so handing it to the gesture does not restart the gesture: it is in the
   * effect's dependencies down there, and an arrow written at the call site would be
   * a new value on every render.
   */
  const finished = useCallback(() => setArrival(null), [])

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

  if (!arrival) return null
  return <ArrivalMarks marks={arrival.marks} onFinished={finished} />
}

/**
 * The gesture itself: close onto the target — or onto each of them — hold, fade, gone.
 *
 * Shared by both callers (see the note on generalising at the top of this file). The
 * wait for the arrival scroll, the easing, the outsets, the hold, the fade and the
 * reduced-motion decision are one decision for the whole arrival; what is per mark is
 * its rectangle and **when its own gesture plays**.
 *
 * ## Each mark plays when the reader can see it
 *
 * A row arrival can mark places spread over a whole section — nine on §7.2's worked
 * case, twenty-two once a section row covers what is embedded in it — and only the
 * first of them is on screen when the page comes to rest. Playing all of them at once
 * would spend most of the gesture off-screen: the reader scrolls down half a minute
 * later and finds the references they came for wearing nothing at all, which is the
 * failure D5 already names for a mark that animates before its target has arrived,
 * one step further out.
 *
 * So a mark waits for its own target to be in front of the reader, and an
 * `IntersectionObserver` is what decides that — one registration per target, no
 * polling, and no work at all for a mark nobody has scrolled to yet. Its top margin
 * is pulled in by the sticky header's height (`headerInset`), because a reference
 * underneath the header is not something the reader can see.
 *
 * Two consequences worth being explicit about:
 *
 *   - **the marks no longer move as one thing** — only the ones that start in the same
 *     frame do. That property was never the point; it was how "one gesture, not nine"
 *     was expressed while every box started together. What is still one gesture is the
 *     shape: same clock length, same easing, same outsets for every box.
 *   - **a mark the reader never scrolls to never plays**, and its box stays in the DOM,
 *     empty and `pointer-events: none`, until the arrival ends. That is deliberate:
 *     there is no deadline after which "show me where they are" stops being the
 *     question the reader asked. Both callers drop the whole list on the next
 *     navigation or arrival, so nothing outlives the page it was answering about.
 *
 * A layout effect, so the first measurement is written before the browser paints the
 * commit that created the elements — the stylesheet's `opacity: 0` is what would
 * otherwise be on screen for that frame.
 *
 * The targets are re-measured every frame rather than once, because they may still be
 * moving: `scroll-behavior: smooth` eases a same-page fragment into place, and a
 * marker fixed to the viewport has to follow it. Re-reading them also means a frame
 * simply follows a target the reader scrolls away from, instead of being left behind
 * at a stale position.
 */
interface ArrivalMarksProps {
  /**
   * What to frame, in the order the reader meets it. The FIRST one is the target the
   * wait for the arrival scroll watches: whoever put a list here scrolled to that one
   * (§7.2 sends the reader to the first of the marks, not to the source's own
   * anchor), so it is the mark whose being on screen means the page has landed.
   */
  marks: readonly ArrivalMark[]
  /**
   * Called once, when every mark has played out. Must be stable — it is a dependency.
   *
   * "Every mark", not "the last one to start": a mark whose target the reader has not
   * reached yet has not played, so an arrival with one of those outstanding is not
   * over. It ends when the reader has seen all of them, or when the caller replaces
   * the list.
   */
  onFinished: () => void
}

export function ArrivalMarks({ marks, onFinished }: ArrivalMarksProps) {
  /** One box per mark, in the same order. */
  const boxes = useRef<(HTMLDivElement | null)[]>([])

  useMarkerEffect(() => {
    const nodes = marks.map((_, index) => boxes.current[index])
    if (marks.length === 0 || nodes.some((node) => !node)) return

    const reduced = prefersReducedMotion()
    // §6.4: the mark appears at its final size and fades. Not removed — showing the
    // reader where they landed is its whole job — and nothing is shortened either;
    // only the closing movement is dropped, so the frame is up for as long.
    const shrinkMs = reduced ? 0 : SHRINK_MS
    const fadeAt = shrinkMs + HOLD_MS
    const spentAt = fadeAt + FADE_MS

    /**
     * Per mark: when its own gesture started, or one of three sentinels. One array
     * rather than three sets — the index is the mark, the box and the state at once.
     *
     *   - `WAITING` — its target has not been in front of the reader yet.
     *   - `STARTING` — it has, and the next frame is its first. The clock is set THERE
     *     rather than when the gate fires, so a mark's first drawn frame is always its
     *     frame zero: `OUTSET_WIDE` exactly, at full opacity. Starting the clock in the
     *     gate's callback would spend the few milliseconds until the next frame, and
     *     the box would appear already a little way into its own shrink.
     *   - `SPENT` — it has played out.
     */
    const WAITING = 0
    const SPENT = -1
    const STARTING = -2
    const startedAt = marks.map(() => WAITING as number)
    let spent = 0
    /** The pending animation frame, or 0 when no frame is scheduled. */
    let frame = 0
    let finished = false
    let observer: IntersectionObserver | null = null

    /**
     * One frame: every mark that is playing, measured and written at the same instant.
     *
     * Only the playing ones. A waiting mark is not measured at all — that is what
     * makes an arrival with twenty-two marks cost the same per frame as one with two
     * on screen — and a spent one is left where its last frame put it, at zero
     * opacity, until the whole arrival ends.
     *
     * The loop stops itself when nothing is playing, and the gate below starts it
     * again when a mark comes into view. `frame` is the handle and the flag: 0 means
     * nothing is scheduled, which is what the gate tests.
     */
    const step = (now: number) => {
      frame = 0
      let playing = false
      for (let index = 0; index < marks.length; index += 1) {
        if (startedAt[index] === STARTING) startedAt[index] = now
        const started = startedAt[index]
        if (started === WAITING || started === SPENT) continue
        const elapsed = now - started
        // The same shape and length the panel's slide and its scroll share
        // (`components/kb/Panel.tsx`): eased out, so the frame decelerates onto the
        // target rather than stopping dead on it.
        const closing = shrinkMs === 0 ? 1 : Math.min(1, elapsed / shrinkMs)
        const eased = 1 - (1 - closing) ** 3
        const outset = OUTSET_WIDE + (OUTSET_TIGHT - OUTSET_WIDE) * eased
        const opacity = elapsed <= fadeAt ? 1 : Math.max(0, 1 - (elapsed - fadeAt) / FADE_MS)

        const rect = marks[index].element.getBoundingClientRect()
        const style = nodes[index]!.style
        style.top = `${rect.top - outset}px`
        style.left = `${rect.left - outset}px`
        style.width = `${rect.width + outset * 2}px`
        style.height = `${rect.height + outset * 2}px`
        style.opacity = `${opacity}`

        if (elapsed >= spentAt) {
          startedAt[index] = SPENT
          spent += 1
        } else {
          playing = true
        }
      }

      if (spent === marks.length) {
        // Unmounted rather than left at zero opacity: §6.2 asks for the frame to be
        // gone, and a spent layer left in the DOM is the kind of thing that is
        // eventually found sitting over something.
        finished = true
        onFinished()
        return
      }
      if (playing) frame = requestAnimationFrame(step)
    }

    /**
     * The visibility gate: start each mark when its target reaches the reader.
     *
     * Armed once, after the arrival scroll has settled — see `settle` below. Arming it
     * earlier would start the marks the smooth scroll happens to sweep past on its
     * way, which is the very thing the wait exists to prevent.
     *
     * A mark already on screen starts immediately: an observer delivers its targets'
     * current state in its first callback, so nothing has to be tested here for the
     * common case of "the page landed on this one".
     */
    const arm = () => {
      // Keyed by the target element: an observer entry says which element it is about,
      // and the box to start is the one at that element's position in the list.
      const index = new Map<Element, number>(
        marks.map((mark, position) => [mark.element, position]),
      )
      observer = new IntersectionObserver(
        (entries) => {
          let woke = false
          for (const entry of entries) {
            const position = index.get(entry.target)
            if (position === undefined || !entry.isIntersecting) continue
            if (startedAt[position] !== WAITING) continue
            startedAt[position] = STARTING
            // One play per mark: the reader scrolling back to it is not a second
            // arrival, and the marker is not a hover effect.
            observer?.unobserve(entry.target)
            woke = true
          }
          if (woke && frame === 0) frame = requestAnimationFrame(step)
        },
        // Below the sticky header, not merely inside the viewport: a reference under
        // the header is not one the reader can see.
        { rootMargin: `-${headerInset()}px 0px 0px 0px` },
      )
      for (const mark of marks) observer.observe(mark.element)
    }

    /**
     * The wait for the arrival scroll to come to rest, watched on the lead mark —
     * whichever target the caller scrolled to (see `marks`). Unchanged in what it
     * decides; what changes is what happens next, which is arming the gate rather than
     * starting every box.
     */
    let stillFrames = 0
    let previousY = Number.NaN
    const waitingSince = performance.now()
    const settle = (now: number) => {
      frame = 0
      const lead = marks[0].element.getBoundingClientRect()
      const y = window.scrollY
      stillFrames = y === previousY ? stillFrames + 1 : 0
      previousY = y
      const landed =
        stillFrames >= SETTLE_FRAMES && lead.bottom > 0 && lead.top < window.innerHeight
      if (!landed && now - waitingSince < SETTLE_LIMIT_MS) {
        frame = requestAnimationFrame(settle)
        return
      }
      arm()
    }

    // Synchronously first, then per frame. Nothing is drawn by this call — it begins
    // the wait — and the elements stay at the stylesheet's `opacity: 0` until the
    // first frame of a mark's own gesture writes a box.
    settle(performance.now())
    return () => {
      if (!finished) cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [marks, onFinished])

  return (
    <>
      {marks.map((mark, index) => (
        <div
          /*
            By position, not by name: a highlight arrival marks several references
            aimed at the SAME fully qualified name, so the name is not unique within
            one arrival. The list is a snapshot taken when the arrival was recognised
            and never reordered, so the position is stable for as long as the boxes
            live.
          */
          key={index}
          ref={(node) => {
            boxes.current[index] = node
          }}
          className={styles.marker}
          /*
            The handle the browser tests reach for, naming what is being marked. A
            `data-` attribute rather than the CSS-module class for the reason `PANEL_ID`
            is a literal (`components/kb/Panel.tsx`): `next.config.ts` derives a module
            class from the FILE NAME, so renaming the stylesheet would silently rename
            it. Carrying the name makes a trace of what the marker did readable rather
            than merely present.
          */
          data-kb-arrival-marker={mark.name}
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
      ))}
    </>
  )
}
