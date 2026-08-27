'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CHROME_HISTORY_KEY,
  DEFAULT_STACK,
  isDefaultState,
  readChromeStack,
  reduceChrome,
  type ChromeStack,
  type ChromeState,
} from '@/lib/kb/chrome-state'
import type { KbMenuItem } from '@/lib/kb/menu-items'
import MenuStack from './MenuStack'
import Overlay from './Overlay'

/**
 * The interactive chrome of an entity page: the context menu, the dim behind it,
 * and the one back step that undoes either (sub-plan §6.2, §6.3, D2).
 *
 * **The state is a stack** (`lib/kb/chrome-state.ts`), not a boolean, because
 * "Vissza" is a back step rather than a close. This component owns nothing of what
 * a step means; it owns where the stack is kept — and it keeps it in the browser's
 * history, which is what makes the four ways of taking that step one behaviour:
 *
 *   - **every state change pushes a history entry** carrying the new stack, with no
 *     url argument at all, so the address bar keeps the page's single URL (§6.2);
 *   - **every back step calls `history.back()`** instead of setting state, so the
 *     Vissza button, Escape and a click on the dim take exactly the path the
 *     browser's own Back takes;
 *   - **`popstate` applies whatever the entry recorded**, in either direction, so
 *     Forward re-applies precisely what Back undid.
 *
 * **Why a portal.** `app/globals.scss` puts `transform: translateZ(0)` on
 * `.page-root` (a Chromium stale-tile fix), and a transform makes an element the
 * containing block for `position: fixed` descendants — the comment there records
 * the newsletter dialog sizing itself to the document instead of the viewport, and
 * asks that anything viewport-fixed stay outside that wrapper. A page renders
 * inside it, so the chrome is portalled to `<body>`, where the consent button and
 * the dialogs already live and where the z-index scale is the one that applies.
 *
 * That leaves the chrome out of the served HTML, which is fine for what is here —
 * two buttons and a scrim, no content and no link. It is not fine for the panel
 * contents §2.1 requires in the HTML from the first byte, so the panel's phase has
 * a placement decision to make that this phase does not.
 */

interface EntityChromeProps {
  /** The items this entity has, from `kbMenuItems` — already localized. */
  items: readonly KbMenuItem[]
  /** The bottom-most button's two captions (§6.2). */
  openLabel: string
  backLabel: string
}

export default function EntityChrome({ items, openLabel, backLabel }: EntityChromeProps) {
  const [stack, setStack] = useState<ChromeStack>(DEFAULT_STACK)
  const [mounted, setMounted] = useState(false)
  const open = !isDefaultState(stack)

  useEffect(() => {
    setMounted(true)

    // A reload keeps the history entry's state object, but the page always opens in
    // its default state (§6.2). Clear a stack the entry is carrying from before the
    // reload, or the reader's first Back would be spent undoing a state they cannot
    // see. Everything else in the entry — the Next router's own keys — is kept.
    if (!isDefaultState(readChromeStack(window.history.state))) {
      window.history.replaceState(
        { ...window.history.state, [CHROME_HISTORY_KEY]: DEFAULT_STACK },
        '',
      )
    }
  }, [])

  useEffect(() => {
    function onPopState(event: PopStateEvent) {
      setStack((current) =>
        reduceChrome(current, { type: 'restore', stack: readChromeStack(event.state) }),
      )
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /**
   * One step back, whichever of the four ways asked for it (D2). It does not touch
   * the state: it moves the history, and the `popstate` handler above is what
   * applies the result — so a back step is the same operation whether the reader
   * pressed Vissza, Escape, the dim, or the browser's Back.
   *
   * The guard is belt and braces: nothing offers this step in the default state,
   * where `history.back()` would take the reader off the page.
   */
  const stepBack = useCallback(() => {
    if (!open) return
    window.history.back()
  }, [open])

  /** A new state on top of the current one — what the Menü button does. */
  function openState(state: ChromeState) {
    const next = reduceChrome(stack, { type: 'open', state })
    setStack(next)
    // Two arguments, never three: with no url, `pushState` cannot change the
    // address bar, only add an entry to step back through. Next patches
    // `history.pushState` to copy its routing keys onto whatever data it is handed
    // (`__NA` and the internals tree — next/dist/client/components/app-router.js),
    // and its own popstate handler reloads the page for an entry without them, so
    // the entry has to go through the patched function rather than around it.
    window.history.pushState({ [CHROME_HISTORY_KEY]: next }, '')
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') stepBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, stepBack])

  // Nothing before mount: `document` is what the portal needs, and rendering the
  // same nothing on the server and on the first client pass is what keeps
  // hydration quiet.
  if (!mounted) return null

  return createPortal(
    <>
      {open && <Overlay onBack={stepBack} />}
      <MenuStack
        items={items}
        open={open}
        openLabel={openLabel}
        backLabel={backLabel}
        onOpen={() => openState({ kind: 'menu' })}
        onBack={stepBack}
      />
    </>,
    document.body,
  )
}
