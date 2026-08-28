'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  CHROME_HISTORY_KEY,
  DEFAULT_STACK,
  SELECTION_KINDS,
  TARGET_KINDS,
  currentState,
  isDefaultState,
  openPanel,
  readChromeStack,
  reduceChrome,
  selectedTarget,
  selectionMode,
  type ChromePanelKind,
  type ChromeSelectedKind,
  type ChromeSelectionKind,
  type ChromeStack,
  type ChromeState,
  type ChromeTargetKind,
} from '@/lib/kb/chrome-state'
import type { KbMenuItem, KbMenuItemKey } from '@/lib/kb/menu-items'
import claimStyles from '@/components/content/blocks/claim-block.module.scss'
import MenuStack from './MenuStack'
import Overlay from './Overlay'
import Panel, { scrollSelectionIntoUpperHalf, type KbPanelSection } from './Panel'

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
 * That leaves the menu and the dim out of the served HTML, which is fine for what
 * they are — two buttons and a scrim, no content and no link.
 *
 * **Level 2 of a selection mode is entered from the body, not from the menu**
 * (§6.3). Nothing in this component's own tree is clickable for it: what the reader
 * presses is a term or a claim in the article, which is a different subtree
 * entirely and is rendered on the server. So the press is caught with one listener
 * on `document` for as long as level 1 is up, and the state it opens carries the
 * pressed element's `id`.
 *
 * **An outgoing reference is the third thing the body opens** (§7.1), and the one
 * that opens without a mode to pick from first: the reader points at a mark in the
 * prose and the page shows what it points at. It is caught the same way — one
 * listener on `document` — and differs in three respects, each of them §7.1's or
 * D1's: the listener is mounted in the DEFAULT state rather than during a mode, only
 * the PLAIN click is taken so the mark stays a working link, and the state is named
 * by the mark's `href` because a reference mark carries no id.
 *
 * **The selection modes are published on `<body>`, not rendered.** Fogalmak and
 * Állítások do not add an element: they lift a class of thing that is already in
 * the body out from under the dim (§6.3). What is revealed is spread across the
 * whole article, so the state is written to `document.body` as `data-kb-select` and
 * `app/globals.scss` expresses the reveal from there — the note beside those rules
 * explains why the lift needs the page's own stacking context out of the way.
 *
 * **The panel is the exception, and it is not portalled.** §2.1 requires its
 * contents in the HTML from the first byte, and a portal renders nothing on the
 * server. So `Panel` is rendered here unconditionally — inside `<main>`, beside the
 * article, where this component itself sits — and moves its own already-rendered
 * nodes out to `<body>` on mount; see the note there. Everything below the
 * `mounted` guard is client-only by construction, and the panel is deliberately
 * above it.
 */

/**
 * What a mode offers, as a selector for the thing the reader presses.
 *
 * The counterpart of the reveal rules in `app/globals.scss`, and it matches them
 * selector for selector, `.page-root` included: what is lit is what is pressable,
 * so a selector that drifted from those would light one set of things and act on
 * another. The wrapper is part of it because a term also renders inside the panel
 * (`panels/ClaimPanel.tsx` restates a claim, and a claim can contain one), and that
 * copy is not a candidate.
 *
 * A term is a global class (`components/content/InlineText.tsx`), a claim a
 * CSS-module one — imported rather than written out, so renaming the module's file
 * cannot silently make this match nothing.
 */
const SELECTABLE: Record<ChromeSelectionKind, string> = {
  terms: '.page-root .term',
  claims: `.page-root .${claimStyles.claim}`,
}

/** The mode's singular: which level-2 state picking one of its candidates opens. */
const SELECTED_OF: Record<ChromeSelectionKind, ChromeSelectedKind> = {
  terms: 'term',
  claims: 'claim',
}

/**
 * The outgoing references in the body — every mark `InlineText` emits for a `[slug]`
 * (§7.1).
 *
 * Both classes, because both are references: `ref-concept` is the treatment an
 * entity, a claim and a term reference wear, `ref-link` the one a book, a chapter, a
 * section, a standalone item and an external URL wear
 * (`components/content/InlineText.tsx`). §7.1's inert rule is about references
 * rather than about a treatment, and which of them opens a panel is decided by
 * whether the page HAS one for the href — not by the class, which cannot tell an
 * external URL from a chapter.
 *
 * Scoped to `.page-root` for the same reason `SELECTABLE` is: the panel's own
 * contents include reference marks (a restated claim, a previewed body), and those
 * are ordinary links that navigate (§6.4). The panel is moved out of the wrapper on
 * mount (see `Panel`), so this selector cannot reach them.
 */
const REFERENCES = '.page-root a.ref-concept, .page-root a.ref-link'

/**
 * The marker the selected element carries while it is the selection.
 *
 * The body says WHICH candidate is selected and the element says THAT IT IS — two
 * halves of one fact, because `app/globals.scss` needs both to express the
 * narrowing: "a mode is up and one is picked" gates the rule, and "this is not the
 * one" is what drops the others back under the dim (§6.3).
 */
const SELECTED_ATTR = 'data-kb-selected'

/** The panels the body opens are not menu items, so they are not what it goes live on. */
function isMenuPanelKind(
  key: ChromePanelKind,
): key is Exclude<ChromePanelKind, ChromeTargetKind> {
  return !(TARGET_KINDS as readonly ChromePanelKind[]).includes(key)
}

/**
 * The mark a reference state is about, for the reveal and the scroll (§7.1).
 *
 * The one the reader pressed when there is one — a body can display the same
 * reference several times, and lighting the first of them would light a mark the
 * reader did not touch and scroll the page to it. `isConnected` and the href are
 * checked because the ref outlives the state: a Forward step re-applies a state
 * whose click happened long ago, and it is only the right element if it is still on
 * the page and still points where the state says.
 *
 * The search is the fallback for exactly that case, and it takes the first match:
 * with no click to go on, the first occurrence is the only defensible answer.
 */
function referenceElement(href: string, picked: Element | null): Element | null {
  if (picked?.isConnected && picked.getAttribute('href') === href) return picked
  return (
    Array.from(document.querySelectorAll(REFERENCES)).find(
      (mark) => mark.getAttribute('href') === href,
    ) ?? null
  )
}

/** §6.4: under reduced motion the scroll jumps rather than eases. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface EntityChromeProps {
  /** The items this entity has, from `kbMenuItems` — already localized. */
  items: readonly KbMenuItem[]
  /** The bottom-most button's two captions (§6.2). */
  openLabel: string
  backLabel: string
  /**
   * The panel's contents, server-rendered (§2.1). An item is live exactly when a
   * section here carries its key — the ones whose phases have not landed stay
   * disabled, so nothing offers a press it will not act on.
   */
  panels: readonly KbPanelSection[]
}

export default function EntityChrome({
  items,
  openLabel,
  backLabel,
  panels,
}: EntityChromeProps) {
  const [stack, setStack] = useState<ChromeStack>(DEFAULT_STACK)
  const [mounted, setMounted] = useState(false)
  const open = !isDefaultState(stack)
  // The menu's items show in the `menu` state only. A panel is opened FROM the
  // menu, and §6.4 rules out a panel opening a nested panel, so once one is up the
  // stack is the Vissza button alone.
  const menuOpen = currentState(stack)?.kind === 'menu'
  const panel = openPanel(stack)
  const panelKeys = panels.map((section) => section.key)
  const selection = selectionMode(stack)
  /**
   * The thing the reader has picked: a candidate at level 2 (§6.3), or the outgoing
   * reference they pressed (§7.1). `null` at level 1 and in every other state.
   */
  const selected = selectedTarget(stack)
  /** True while that thing is a reference, which is how it is found in the DOM. */
  const referenceSelected = selected !== null && currentState(stack)?.kind === 'reference'
  /**
   * The hrefs this page has a reference panel for — the whole of what makes a
   * reference actionable (§7.1). A reference with no panel is an external URL or a
   * target this build shows nothing about, and stays the plain link it already is.
   *
   * The panel's own `target`, so the set and the section it opens cannot drift: the
   * click reads the href off the DOM and `Panel` finds the section by the same
   * string (`KbEntityPage` and `panels/ReferencePanel.tsx` put it there).
   */
  const referenceTargets = useMemo(
    () =>
      new Set(
        panels
          .filter((section) => section.key === 'reference' && section.target)
          .map((section) => section.target as string),
      ),
    [panels],
  )
  /**
   * The reference mark the reader actually pressed.
   *
   * A state names a reference by its href (see `ChromeState.target`), and a body can
   * carry the same reference several times — `kis-fermat-tetel-megjegyzes` displays
   * one of its eleven four times over. The href is right for the PANEL, which is
   * about the target; it is not enough for the REVEAL, which is about the mark the
   * reader pressed. So the element travels in a ref, and the search below is the
   * fallback for a state restored by Forward rather than opened by a click.
   */
  const pickedReference = useRef<Element | null>(null)
  /**
   * The items that act when pressed. A panel item is live when its content is in
   * the `panels` prop; a selection mode is live wherever its item exists at all,
   * because what it reveals is the body itself and `kbMenuItems` has already
   * checked that the entity has some (§6.5).
   *
   * The `term` and `claim` sections are filtered out rather than listed disabled:
   * they are panels with no menu item behind them, so "live" says nothing about
   * them and the menu has nothing to render for them either.
   */
  const liveItems: KbMenuItemKey[] = [...panelKeys.filter(isMenuPanelKind), ...SELECTION_KINDS]

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

    /**
     * The page owns its own scroll position while it is on this page (§6.4).
     *
     * Every chrome state is a history entry (see above), and the browser restores a
     * scroll position when it goes back to one — so with the default setting, a back
     * step out of a selection puts the page back where it was before the selection
     * scrolled it, which is exactly what "closing does not scroll back" forbids. It
     * would also throw away a scroll the READER made: level 1 leaves the page
     * scrollable on purpose, because picking a term means finding it first (§6.3).
     *
     * The mode belongs to the entry the document is on, and an entry pushed from it
     * inherits it, so setting it once here covers every state this component can
     * push — which is what `e2e/kb-select.test.ts`'s "closing does not scroll the
     * page back" demonstrates: the selection is three pushes deep and the back step
     * out of it leaves the page where the scroll put it. Entries made before this
     * mounted are untouched, and the previous value goes back on the entry the
     * reader leaves on, so nothing after this page inherits `manual` either.
     */
    const restoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = restoration
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

  /**
   * A menu item was pressed. The key is looked up among the kinds that are live
   * rather than cast: that is what turns a `KbMenuItemKey` into the
   * `ChromeStateKind` a state needs, and it is also the compile-time link between
   * the two unions — they have to overlap for the comparison to typecheck at all.
   * An item with nothing behind it yet is rendered disabled and never gets here.
   */
  function onSelect(key: KbMenuItemKey) {
    const kind = liveItems.find((candidate) => candidate === key)
    if (kind) openState({ kind })
  }

  /** A new state on top of the current one — what the Menü button does. */
  const openState = useCallback(
    (state: ChromeState) => {
      const next = reduceChrome(stack, { type: 'open', state })
      setStack(next)
      // Two arguments, never three: with no url, `pushState` cannot change the
      // address bar, only add an entry to step back through. Next patches
      // `history.pushState` to copy its routing keys onto whatever data it is handed
      // (`__NA` and the internals tree — next/dist/client/components/app-router.js),
      // and its own popstate handler reloads the page for an entry without them, so
      // the entry has to go through the patched function rather than around it.
      window.history.pushState({ [CHROME_HISTORY_KEY]: next }, '')
    },
    [stack],
  )

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') stepBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, stepBack])

  /**
   * Publish the selection mode on `<body>` (§6.3).
   *
   * An attribute rather than a class on some element of this component's own,
   * because what the mode changes is not here: it is every term or every claim in
   * the article, plus the wrapper those live in. `ConsentBanner` already publishes
   * its height on `<html>` the same way, for the same reason — a fact about the
   * page that the stylesheet, not a component, acts on.
   *
   * The cleanup removes it, so a back step, an unmount and a navigation all leave
   * the page in its ordinary state.
   */
  useEffect(() => {
    if (!selection) return
    document.body.dataset.kbSelect = selection
    return () => {
      delete document.body.dataset.kbSelect
    }
  }, [selection])

  /**
   * Publish that the page is out of its default state (§7.1).
   *
   * The condition an outgoing reference's inertness is stated as: "no panel open,
   * menu closed". The two attributes above cannot express it — a mode is only some
   * of the states, and a selection only some of those — and the states they miss are
   * the ones where the dim happens to absorb the click anyway. `app/globals.scss`
   * says the thing rather than relying on that coincidence, and this is its hook.
   *
   * The current kind is the value rather than a bare presence flag, so the attribute
   * says which state as well as that there is one; nothing reads the value, and no
   * rule should need to — "not the default state" is the whole of what it means.
   */
  useEffect(() => {
    const state = currentState(stack)
    if (!state) return
    document.body.dataset.kbChrome = state.kind
    return () => {
      delete document.body.dataset.kbChrome
    }
  }, [stack])

  /**
   * A plain click on an outgoing reference in the body (§7.1, D1).
   *
   * On `document`, and for the page's whole life rather than for one state: what is
   * pressed is a mark inside the article, server-rendered and not this component's
   * to hand a handler to, and unlike a selection mode there is no state that turns
   * it on — a reference is pressable in the DEFAULT state, which is the one state
   * this component otherwise has nothing mounted for.
   *
   * **Only the plain click is taken** (D1). The mark stays an `<a>` with a real
   * `href` and `target="_blank"`, because crawler discoverability is why this ticket
   * exists, so a modified click — ctrl, meta, shift, alt — is left to the browser
   * and opens the target page as on any link. A middle click never reaches here at
   * all: it fires `auxclick`. The cost is that plain and modified click do different
   * things, which D1 accepted knowingly.
   *
   * **Inert unless the page is in its default state** (§7.1). The stylesheet keeps
   * the pointer off a reference while any state is up; this is the same answer for
   * the activation a stylesheet cannot reach — a keyboard Enter on a focused mark,
   * which arrives as a click with no pointer behind it. Preventing rather than
   * ignoring, because ignoring means the browser navigates.
   *
   * **A reference with no panel is not intercepted at all**: an external URL, which
   * §7.1 leaves an ordinary outbound link, or a target this build shows nothing
   * about. `referenceTargets` is the whole of that test.
   */
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return
      const mark = event.target.closest(REFERENCES)
      if (!mark) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      if (open) {
        event.preventDefault()
        return
      }
      const target = mark.getAttribute('href')
      if (!target || !referenceTargets.has(target)) return
      event.preventDefault()
      pickedReference.current = mark
      openState({ kind: 'reference', target })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [open, openState, referenceTargets])

  /**
   * Level 1 → level 2: pick one of the revealed candidates (§6.3).
   *
   * On `document`, and only while level 1 is up. What the reader presses is in the
   * article — a server-rendered span or div this component does not own and cannot
   * hand a handler to — and the mode is the only thing that makes it pressable at
   * all, so the listener has exactly the mode's lifetime. At level 2 it is gone:
   * the only lit thing left is the selection itself, and pressing it again is not
   * a second step (`selected` is in the dependencies, so the listener comes off the
   * moment one is picked).
   *
   * `preventDefault` because a revealed claim can contain an outgoing reference,
   * and §7.1 makes a body reference inert unless the page is in its default state.
   * An element with no `id` is not a candidate: the id IS the selection's identity
   * (see `ChromeState.target`), and nothing can be shown about a thing that has
   * none.
   */
  useEffect(() => {
    if (!selection || selected) return
    const selector = SELECTABLE[selection]
    const kind = SELECTED_OF[selection]
    function onClick(event: MouseEvent) {
      if (!(event.target instanceof Element)) return
      const candidate = event.target.closest(selector)
      if (!candidate?.id) return
      event.preventDefault()
      openState({ kind, target: candidate.id })
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [selection, selected, openState])

  /**
   * Level 2 itself: light the one, drop the others, and put it where the panel is
   * not (§6.3, §6.4).
   *
   * The narrowing is published the same way the mode is — an attribute on `<body>`
   * naming the selection, and `SELECTED_ATTR` on the element that IS it, with
   * `app/globals.scss` expressing what the pair means. That is what replaces a
   * highlight colour and a selected-state style: the overlay does the work (§6.3).
   *
   * The scroll rides along in the same commit as the panel's arrival, so the two
   * are one gesture (§6.4). It is safe to measure here: the mode was already up
   * before this state, so `.page-root`'s transform came off a step ago and the
   * layout is not about to move under the measurement.
   *
   * **This scroll must not fire the arrival marker** (§6.2, phase 18's): the
   * overlay has just said what is selected by lighting it alone, and the marker
   * would be a second answer to a question the reader has already had answered.
   * Nothing here starts one, and nothing that lands later should.
   *
   * The cleanup unlights and does NOT scroll back — §6.4 is explicit that closing
   * leaves the reader where they have been reading.
   */
  useEffect(() => {
    if (!selected) return
    document.body.dataset.kbSelected = selected
    // Two kinds of handle, because two kinds of thing are selected: a candidate is
    // named by its `id` and a reference by its `href` (see `ChromeState.target`).
    const element = referenceSelected
      ? referenceElement(selected, pickedReference.current)
      : document.getElementById(selected)
    if (!element) {
      return () => {
        delete document.body.dataset.kbSelected
      }
    }
    element.setAttribute(SELECTED_ATTR, '')
    const cancelScroll = scrollSelectionIntoUpperHalf(element, prefersReducedMotion())
    return () => {
      cancelScroll()
      delete document.body.dataset.kbSelected
      element.removeAttribute(SELECTED_ATTR)
    }
  }, [selected, referenceSelected])

  return (
    <>
      {/*
        Server-rendered, always. `activeKey` is null on the server and on the first
        client pass, which is the panel closed with every one of its contents
        already in the HTML.
      */}
      <Panel sections={panels} activeKey={panel} activeTarget={selected} />

      {/*
        Nothing before mount: `document` is what the portal needs, and rendering the
        same nothing on the server and on the first client pass is what keeps
        hydration quiet.
      */}
      {mounted &&
        createPortal(
          <>
            {open && <Overlay onBack={stepBack} />}
            <MenuStack
              items={items}
              open={open}
              showItems={menuOpen}
              liveItems={liveItems}
              openLabel={openLabel}
              backLabel={backLabel}
              onOpen={() => openState({ kind: 'menu' })}
              onSelect={onSelect}
              onBack={stepBack}
            />
          </>,
          document.body,
        )}
    </>
  )
}
