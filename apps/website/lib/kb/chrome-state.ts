/**
 * The state of an entity page's context menu, as a stack (sub-plan §6.2).
 *
 * A stack rather than a boolean, because "Vissza" is a back step and not a close:
 * it undoes exactly one thing and leaves everything before it intact, and pressing
 * it repeatedly walks back to the default state. The default state is the empty
 * stack, so there is no separate "closed" value to keep in sync.
 *
 * Pure and DOM-free on purpose. `EntityChrome` owns the wiring — the history
 * entries, the listeners, the rendering — and this owns what a step actually means,
 * which is the part that can be checked without a browser (test/kb-chrome.test.mjs).
 */

/**
 * The states beyond the default.
 *
 * `menu` is the open context menu. The kinds that a menu item opens are named
 * after that item (`KbMenuItemKey`) so the two cannot drift, and fall into one of
 * two groups: a **panel** state (`context` is the Kontextus panel, `incoming` the
 * Bejövő hivatkozások one) or a **selection mode** (`terms` is Fogalmak, `claims`
 * is Állítások — §6.3).
 *
 * `term` and `claim` are the singulars, and they are the second level of a
 * selection mode: one candidate picked out of the class the mode revealed (§6.3).
 * No menu item opens them — the body does — so they are the two kinds whose names
 * are NOT in `KbMenuItemKey`. They are panel states all the same, which is the
 * whole difference between the two levels: level 1 reveals and waits, level 2
 * opens a sheet about the one thing chosen.
 *
 * `reference` is the third the body opens: one outgoing reference in the prose,
 * pressed (§7.1). It has no mode above it — there is no "references" level 1 to
 * pick from, because a reference is already the one thing the reader pointed at —
 * so it is the one kind that is a selection without belonging to a selection mode.
 *
 * The remaining items join as their phases land, and nothing here changes when they
 * do except this union and `STATE_KINDS`.
 */
export type ChromeStateKind =
  | 'menu'
  | 'incoming'
  | 'context'
  | 'terms'
  | 'claims'
  | 'term'
  | 'claim'
  | 'reference'

/** The kinds a restored history entry may name — anything else is not ours. */
const STATE_KINDS: readonly ChromeStateKind[] = [
  'menu',
  'incoming',
  'context',
  'terms',
  'claims',
  'term',
  'claim',
  'reference',
]

/**
 * The two states that reveal a class of thing in the body instead of opening a
 * sheet over it (§6.3).
 *
 * A selection mode is a state like any other — pushed as a history entry, undone by
 * exactly one back step, whichever of the four ways takes it — and is deliberately
 * NOT a panel: level 1 is "pick one", and nothing slides in until level 2.
 */
export type ChromeSelectionKind = 'terms' | 'claims'

export const SELECTION_KINDS: readonly ChromeSelectionKind[] = ['terms', 'claims']

function isSelectionKind(kind: ChromeStateKind): kind is ChromeSelectionKind {
  return (SELECTION_KINDS as readonly ChromeStateKind[]).includes(kind)
}

/**
 * The two level-2 states: one term, or one claim, picked out of what its mode
 * revealed (§6.3).
 *
 * Deliberately a state of its own rather than a field on the mode, for the same
 * reason level 1 is a state: "Vissza" from level 2 is one step, and it lands on
 * level 1 with every candidate revealed again.
 */
export type ChromeSelectedKind = 'term' | 'claim'

export const SELECTED_KINDS: readonly ChromeSelectedKind[] = ['term', 'claim']

/** Which mode a selected state belongs to — the singular's plural, and no more. */
const MODE_OF: Record<ChromeSelectedKind, ChromeSelectionKind> = {
  term: 'terms',
  claim: 'claims',
}

function isSelectedKind(kind: ChromeStateKind): kind is ChromeSelectedKind {
  return (SELECTED_KINDS as readonly ChromeStateKind[]).includes(kind)
}

/**
 * The kinds whose state says WHICH thing it is about, and therefore the kinds that
 * carry a `target`: the two mode singulars, plus a pressed outgoing reference.
 *
 * A reference is a selection in every respect that matters here — the body lights
 * the thing that was pressed, the panel is about that thing, and one back step
 * gives up both — and in exactly one respect it is not: no mode revealed it, so
 * `selectionMode` answers null for it and `SELECTED_KINDS` stays the two singulars
 * of the two modes. This is the wider list, and it is the one `target` follows.
 */
export type ChromeTargetKind = ChromeSelectedKind | 'reference'

export const TARGET_KINDS: readonly ChromeTargetKind[] = ['term', 'claim', 'reference']

function isTargetKind(kind: ChromeStateKind): kind is ChromeTargetKind {
  return (TARGET_KINDS as readonly ChromeStateKind[]).includes(kind)
}

export interface ChromeState {
  kind: ChromeStateKind
  /**
   * Which thing the state is about, as the handle the DOM already carries.
   *
   * For `term` and `claim` that is the selected element's `id` — its page-relative
   * anchor (`fogalmak.{slug}` / `allitasok.{slug}`, see `lib/content/urls.ts`). For
   * `reference` it is the anchor's **`href`**: a reference mark carries no id (it
   * is a plain `<a>` from `components/content/InlineText.tsx`), and the href is
   * what identifies what it points at — which is what the panel is about, so two
   * marks aimed at the same target are one panel and one state.
   *
   * In both cases it is a handle that exists on both sides without being invented
   * for this: the server renders it into the element and onto the panel section,
   * and the click that opens the state reads it straight off the DOM.
   *
   * Set on the `TARGET_KINDS` and on nothing else, which `readChromeStack` enforces
   * on the way back out of a history entry.
   */
  target?: string
}

/** Bottom-to-top: the last entry is where the reader is now. */
export type ChromeStack = readonly ChromeState[]

/** The default state: menu closed, nothing dimmed, nothing to step back from. */
export const DEFAULT_STACK: ChromeStack = []

export type ChromeAction =
  /** A new state on top of the current one — what a menu item does. */
  | { type: 'open'; state: ChromeState }
  /** One step back. The single meaning behind all four ways of taking it (D2). */
  | { type: 'back' }
  /** Whatever a history entry recorded — what `popstate` applies, in either
   *  direction, so Forward re-applies precisely what Back undid. */
  | { type: 'restore'; stack: ChromeStack }

export function reduceChrome(stack: ChromeStack, action: ChromeAction): ChromeStack {
  switch (action.type) {
    case 'open':
      return [...stack, action.state]
    case 'back':
      // Popping the default state is a no-op rather than an error: the reader's
      // Back belongs to the browser once the page is back in its default state.
      return stack.slice(0, -1)
    case 'restore':
      return action.stack
  }
}

/** True while the page shows no chrome state at all — menu closed, no dim. */
export function isDefaultState(stack: ChromeStack): boolean {
  return stack.length === 0
}

/** Where the reader is now, or `null` in the default state. */
export function currentState(stack: ChromeStack): ChromeState | null {
  return stack.length === 0 ? null : stack[stack.length - 1]
}

/**
 * The kinds that open a panel: every kind that is neither the menu nor one of the
 * selection modes. Subtraction rather than a second list, so a kind added to
 * `ChromeStateKind` has to be classified rather than silently become a panel.
 *
 * `term`, `claim` and `reference` land here on purpose, and they are the reason the
 * subtraction names the two modes instead of "anything to do with a selection":
 * level 1 must not slide a sheet in or freeze the page, and a picked candidate — or
 * a pressed reference (§7.1) — must do both (§6.3, §6.4).
 */
export type ChromePanelKind = Exclude<ChromeStateKind, 'menu' | ChromeSelectionKind>

/**
 * Which panel the reader has open, or `null` when none is: the menu state and the
 * default state both answer "none".
 *
 * The panel is what scroll-locks the page and what the slide belongs to (§6.4), so
 * "is a panel open" is asked often enough to be one function rather than a `kind`
 * comparison repeated at every call site.
 */
export function openPanel(stack: ChromeStack): ChromePanelKind | null {
  const state = currentState(stack)
  if (state === null || state.kind === 'menu') return null
  // A selection mode dims and reveals; it does not open a sheet, and it must not
  // scroll-lock the page — picking a term means finding it first (§6.3).
  return isSelectionKind(state.kind) ? null : state.kind
}

/**
 * Which class of thing the body is currently offering, or `null` when it is
 * offering none (§6.3).
 *
 * The counterpart of `openPanel`, and asked at exactly one place: the reveal is a
 * property of the whole page rather than of any one component, so `EntityChrome`
 * publishes the answer on `<body>` and `app/globals.scss` expresses both states
 * from there.
 *
 * **Both levels answer the same mode.** At level 2 the page is still in Fogalmak —
 * the reveal machinery is what shows the reader their selection, and it is the
 * narrowing from "all of them" to "just this one" that says which (§6.3). So the
 * mode's rules, and with them the dropped `.page-root` transform they need, stay
 * in place across the step; `selectedTarget` is what distinguishes the two levels.
 */
export function selectionMode(stack: ChromeStack): ChromeSelectionKind | null {
  const state = currentState(stack)
  if (state === null) return null
  if (isSelectionKind(state.kind)) return state.kind
  return isSelectedKind(state.kind) ? MODE_OF[state.kind] : null
}

/**
 * The thing the reader has picked — a candidate at level 2, or the outgoing
 * reference they pressed (§7.1) — or `null` at every other state, level 1 included.
 *
 * The value is the handle the selected element carries (see `ChromeState.target`),
 * which is both what the body has to light up and what the panel has to show, so
 * one answer serves both.
 */
export function selectedTarget(stack: ChromeStack): string | null {
  const state = currentState(stack)
  if (state === null || !isTargetKind(state.kind)) return null
  return state.target ?? null
}

/**
 * The key the stack travels under inside a history entry's state object.
 *
 * A key on the entry rather than a URL: every state of the page is the same URL
 * (§6.2), so the entry is what distinguishes them. The rest of the entry belongs to
 * the Next router and is preserved untouched — see `EntityChrome`.
 */
export const CHROME_HISTORY_KEY = 'kbChrome'

/**
 * The stack recorded in a `popstate` event's state, or the default stack when the
 * entry is not one of ours (the entry the page loaded on, an entry pushed by the
 * router, or `null` for a document the browser has no state for).
 *
 * Validating rather than casting: `history.state` is whatever anything on the page
 * put there, it survives a reload, and a malformed entry must degrade to the
 * default state instead of rendering an unknown one.
 *
 * `target` goes through the same treatment, and the pairing is checked in both
 * directions: a state of a `TARGET_KIND` without one names nothing, and any other
 * kind with one is not a shape this module produces. Either is a malformed entry
 * rather than a state to render — the alternative is a `term` state that lights
 * nothing up and opens an empty panel.
 */
export function readChromeStack(historyState: unknown): ChromeStack {
  if (typeof historyState !== 'object' || historyState === null) return DEFAULT_STACK
  const raw = (historyState as Record<string, unknown>)[CHROME_HISTORY_KEY]
  if (!Array.isArray(raw)) return DEFAULT_STACK
  const stack: ChromeState[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return DEFAULT_STACK
    const { kind, target } = entry as Record<string, unknown>
    if (!STATE_KINDS.includes(kind as ChromeStateKind)) return DEFAULT_STACK
    if (isTargetKind(kind as ChromeStateKind)) {
      if (typeof target !== 'string' || target === '') return DEFAULT_STACK
      stack.push({ kind: kind as ChromeStateKind, target })
    } else {
      if (target !== undefined) return DEFAULT_STACK
      stack.push({ kind: kind as ChromeStateKind })
    }
  }
  return stack
}
