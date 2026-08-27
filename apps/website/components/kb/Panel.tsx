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
   * menu item that opens it (`ChromeStateKind`), so this is that item's key too.
   */
  key: ChromePanelKind
  /** The panel's header while this content is showing. Already localized. */
  title: string
  /** Server-rendered content. A `ReactNode` so it can come from a server component. */
  content: ReactNode
}

interface PanelProps {
  sections: readonly KbPanelSection[]
  /** Which content is showing, or `null` while the panel is closed. */
  activeKey: ChromePanelKind | null
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

/** `useLayoutEffect` warns when it runs under the server renderer; this does not. */
const useAdoptionEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export default function Panel({ sections, activeKey }: PanelProps) {
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
  const [shown, setShown] = useState<ChromePanelKind | null>(null)
  if (activeKey !== null && activeKey !== shown) setShown(activeKey)

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
            key={section.key}
            id={`${PANEL_ID}-title-${section.key}`}
            className={styles.title}
            hidden={section.key !== shown}
          >
            {section.title}
          </h2>
        ))}
      </div>

      <div className={styles.body}>
        {sections.map((section) => (
          <section
            key={section.key}
            aria-labelledby={`${PANEL_ID}-title-${section.key}`}
            hidden={section.key !== shown}
          >
            {section.content}
          </section>
        ))}
      </div>
    </aside>
  )
}
