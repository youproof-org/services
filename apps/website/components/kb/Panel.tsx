'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ChromePanelKind } from '@/lib/kb/chrome-state'
import styles from './panel.module.scss'

/**
 * The entity page's panel: one sheet over the bottom half of the screen, holding
 * whichever content the reader asked for (sub-plan §6.4).
 *
 * **Every content is in the served HTML, hidden.** §2.1 makes that the rule that
 * overrides layout preference where the two conflict — the panel's contents are
 * the edges of the knowledge graph, and a crawler that cannot see them cannot see
 * the structure this work exists to expose. So the sections are rendered on the
 * server, all of them, and opening a panel unhides one. Nothing is fetched, and
 * nothing is built on the client.
 *
 * ## Why the nodes are adopted rather than portalled
 *
 * `app/globals.scss` puts `transform: translateZ(0)` on `.page-root`, and a
 * transform makes the element the containing block for `position: fixed`
 * descendants: a panel rendered inside the article would size and place itself
 * against the document rather than the viewport. `EntityChrome` solves that for the
 * menu and the dim with `createPortal` to `<body>` — but a portal renders nothing
 * on the server, which is exactly what this component may not do.
 *
 * So the panel is server-rendered where React puts it, inside the article, and on
 * mount the **existing DOM nodes are moved** into a container appended to `<body>`.
 * The real nodes travel; no client-side copy of them is made, and nothing is
 * re-rendered from data. React keeps owning the element it created — it holds a
 * reference to the node and updates it in place, which does not care who the
 * parent is.
 *
 * The one thing that does care is deletion: React removes a host node by calling
 * `removeChild` on the parent it *believes* the node has, which would throw once
 * the node lives somewhere else. Hence the cleanup, which puts the node back where
 * React left it. It has to run before the removal, which is why the adoption is a
 * layout effect and not a passive one: React destroys layout effects synchronously
 * while walking a deleted subtree, and defers passive ones until after the DOM is
 * already gone.
 */

/** One content the panel can show, and the item that opens it. */
export interface KbPanelSection {
  /**
   * The chrome state that shows this content. A panel state is named after the
   * menu item that opens it (`ChromeStateKind`), so this is that item's key too —
   * except for `term` and `claim`, which the body opens rather than the menu.
   */
  key: ChromePanelKind
  /**
   * Which candidate this content is about, for the two kinds where the key alone
   * does not say: a page has one `incoming` panel but one `term` panel per term.
   * The value is the selected element's `id`, which is what the chrome state
   * carries (`ChromeState.target`).
   */
  target?: string
  /**
   * The panel's header while this content is showing. Already localized — and a
   * `ReactNode` rather than a string because a level-2 panel is headed by its
   * subject rather than by a caption: a term's canonical form is authored content
   * and can carry inline markup, so it goes through `InlineText` like every other
   * authored string on the site.
   */
  title: ReactNode
  /** Server-rendered content. A `ReactNode` so it can come from a server component. */
  content: ReactNode
}

interface PanelProps {
  sections: readonly KbPanelSection[]
  /** Which content is showing, or `null` while the panel is closed. */
  activeKey: ChromePanelKind | null
  /** Which candidate of that content, for a `term` or `claim` panel; else `null`. */
  activeTarget?: string | null
}

/**
 * The panel's element id.
 *
 * A literal rather than a CSS-module class because it is also the handle the build
 * gate and the browser tests reach for, and `next.config.ts` derives a module class
 * from the *file name* — renaming `panel.module.scss` would silently rename the
 * class. One panel per page, so an id is honest.
 */
export const PANEL_ID = 'kb-panel'

/**
 * The share of the viewport the panel leaves uncovered — the top half, which is
 * `height: 50vh` in `panel.module.scss` read from the other end.
 *
 * A constant here rather than a measurement of the sheet, because the scroll below
 * has to place the selection in the free half *while the sheet is still arriving*:
 * measuring the panel mid-slide would answer "the bottom edge of the screen".
 */
const FREE_HALF = 0.5

/**
 * How long the sheet takes to arrive — the `280ms` of `panel.module.scss`, written
 * a second time because a stylesheet and a script cannot share a number.
 *
 * The scroll below borrows it rather than picking its own, which is what makes the
 * two one gesture (§6.4) instead of two movements that happen to start together.
 */
const PANEL_SLIDE_MS = 280

/**
 * Where the page has to be scrolled for the selection to sit comfortably inside the
 * half the panel does not cover (§6.4).
 *
 * **Centred in the free region, not merely above the panel's edge.** §6.4 asks for
 * "comfortably inside it rather than flush against its bottom edge", and the region
 * is not the whole upper half either: the site header is sticky, so the top of it
 * belongs to the header rather than to the reader. Both ends are measured here, and
 * a selection too tall to centre is placed at the top of the region instead — a long
 * claim then runs under the panel, which is the only thing that can happen and is
 * better than running under the header.
 */
function upperHalfScrollTop(element: Element): number {
  const header = document.querySelector('header')
  // Sticky at the top, so its own box is where the free region starts. A page
  // without one starts the region at the viewport's top edge.
  const top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0
  const bottom = window.innerHeight * FREE_HALF
  const rect = element.getBoundingClientRect()
  const room = Math.max(0, bottom - top - rect.height)
  return Math.max(0, window.scrollY + rect.top - (top + room / 2))
}

/**
 * Put the selected element there, over the same time the sheet takes to arrive.
 *
 * **One gesture** (§6.4): "the selection should already be in place by the time the
 * panel has finished arriving", which is a statement about durations and not only
 * about start times. `behavior: 'smooth'` cannot give it — the browser picks the
 * duration from the distance, and measured here a 351px scroll was still 63px short
 * when the 280ms slide had already landed. So the movement is driven frame by frame
 * over `PANEL_SLIDE_MS`, eased out as the slide is (`ease-out` in
 * `panel.module.scss`; the same shape and the same length, not the identical
 * bezier).
 *
 * Each step asks for `instant` because `app/globals.scss` puts `scroll-behavior:
 * smooth` on `:root`, and a per-frame position handed to a smooth scroller would be
 * animated towards rather than taken.
 *
 * The scroll survives the panel's scroll lock: `overflow: hidden` stops the READER
 * from scrolling, not the page from being scrolled programmatically (measured).
 *
 * **Reduced motion jumps** (§6.4): the same destination, arrived at in one step.
 *
 * Returns a cancel, which the caller runs when the selection goes away. There is no
 * scroll back — §6.4: closing does not scroll back — so cancelling stops the
 * movement where it is rather than undoing it.
 */
export function scrollSelectionIntoUpperHalf(
  element: Element,
  reducedMotion: boolean,
): () => void {
  const to = upperHalfScrollTop(element)
  const from = window.scrollY
  if (reducedMotion || to === from) {
    window.scrollTo({ top: to, behavior: 'instant' })
    return () => {}
  }

  let frame = 0
  const started = performance.now()
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / PANEL_SLIDE_MS)
    const eased = 1 - (1 - progress) ** 3
    window.scrollTo({ top: from + (to - from) * eased, behavior: 'instant' })
    if (progress < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}

/**
 * What identifies one section among all of them.
 *
 * The key alone would do for the menu's panels, one per page — but not for the
 * level-2 ones, where a page carries a `term` section per term and a `claim`
 * section per claim (§6.3). The `<h2>`'s id is built from the same pair, so the
 * `aria-labelledby` links stay unique for the same reason they stay correct.
 */
function sectionId(key: ChromePanelKind, target: string | null | undefined): string {
  return target ? `${key}-${target}` : key
}

/** `useLayoutEffect` warns when it runs under the server renderer; this does not. */
const useAdoptionEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function Panel({ sections, activeKey, activeTarget = null }: PanelProps) {
  const rootRef = useRef<HTMLElement | null>(null)
  const open = activeKey !== null

  /**
   * The content the panel is *showing*, which is not the same as the one that is
   * active: on close the active key drops to `null` immediately while the sheet is
   * still sliding down, and emptying it mid-slide would read as a glitch. So the
   * last opened content stays put behind the closed panel.
   *
   * Adjusting state during render rather than in an effect keeps the two in the
   * same commit — an effect would paint one frame of an empty panel on open.
   */
  const [shown, setShown] = useState<string | null>(null)
  const active = activeKey === null ? null : sectionId(activeKey, activeTarget)
  if (active !== null && active !== shown) setShown(active)

  useAdoptionEffect(() => {
    const node = rootRef.current
    if (!node) return
    // Where React believes the node lives, so the cleanup can put it back exactly
    // there rather than merely somewhere in the same parent.
    const home = node.parentNode
    const nextSibling = node.nextSibling

    const host = document.createElement('div')
    host.dataset.kbPanelHost = ''
    document.body.appendChild(host)
    host.appendChild(node)

    return () => {
      if (home) {
        if (nextSibling && nextSibling.parentNode === home) home.insertBefore(node, nextSibling)
        else home.appendChild(node)
      }
      host.remove()
    }
  }, [])

  /**
   * The page behind is scroll-locked while the panel is open and unlocks when it
   * closes (§6.4): the panel is about something the page has just placed where the
   * reader can see it, and letting the page drift out from under it would undo
   * that. The dim on its own locks nothing (§6.3) — this is the panel's behaviour,
   * not the overlay's.
   *
   * `overflow` on `<body>`, which is what `ui/Modal.tsx` already does for the
   * consent dialog. The panel itself is fixed and a child of `<body>`, so the lock
   * does not reach it, and its own scroller (below) stays free.
   */
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <aside
      ref={rootRef}
      id={PANEL_ID}
      className={`${styles.panel}${open ? ` ${styles.open}` : ''}`}
    >
      {/*
        Pinned: it is a sibling of the scroller, not inside it, so 222 inbound
        references scroll under a header that stays put (§6.4). Every section's
        title is here and server-rendered, one unhidden — a single live <h2> would
        be empty in the served HTML, where no panel is open.
      */}
      <div className={styles.header}>
        {sections.map((section) => (
          <h2
            key={sectionId(section.key, section.target)}
            id={`${PANEL_ID}-title-${sectionId(section.key, section.target)}`}
            className={styles.title}
            hidden={sectionId(section.key, section.target) !== shown}
          >
            {section.title}
          </h2>
        ))}
      </div>

      <div className={styles.body}>
        {sections.map((section) => (
          <section
            key={sectionId(section.key, section.target)}
            aria-labelledby={`${PANEL_ID}-title-${sectionId(section.key, section.target)}`}
            /*
              The two handles the build gate and the browser tests count on. §2.1
              requires every one of these contents in the served HTML, and "every
              term panel is there" is a count against the node's terms — so the
              markup has to say which section is which without being parsed.
            */
            data-kb-panel-kind={section.key}
            data-kb-panel-target={section.target}
            hidden={sectionId(section.key, section.target) !== shown}
          >
            {section.content}
          </section>
        ))}
      </div>
    </aside>
  )
}
