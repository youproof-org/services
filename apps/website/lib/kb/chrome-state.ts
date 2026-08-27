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
 * `menu` is the open context menu. Every other kind is named after the menu item
 * that opens it (`KbMenuItemKey`) so the two cannot drift, and falls into one of
 * two groups: a **panel** state (`context` is the Kontextus panel, `incoming` the
 * Bejövő hivatkozások one) or a **selection mode** (`terms` is Fogalmak, `claims`
 * is Állítások — §6.3). The remaining items join as their phases land, and nothing
 * here changes when they do except this union and `STATE_KINDS`.
 */
export type ChromeStateKind = 'menu' | 'incoming' | 'context' | 'terms' | 'claims'

/** The kinds a restored history entry may name — anything else is not ours. */
const STATE_KINDS: readonly ChromeStateKind[] = [
  'menu',
  'incoming',
  'context',
  'terms',
  'claims',
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

export interface ChromeState {
  kind: ChromeStateKind
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
 */
export function selectionMode(stack: ChromeStack): ChromeSelectionKind | null {
  const state = currentState(stack)
  if (state === null) return null
  return isSelectionKind(state.kind) ? state.kind : null
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
 */
export function readChromeStack(historyState: unknown): ChromeStack {
  if (typeof historyState !== 'object' || historyState === null) return DEFAULT_STACK
  const raw = (historyState as Record<string, unknown>)[CHROME_HISTORY_KEY]
  if (!Array.isArray(raw)) return DEFAULT_STACK
  const stack: ChromeState[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return DEFAULT_STACK
    const kind = (entry as Record<string, unknown>).kind
    if (!STATE_KINDS.includes(kind as ChromeStateKind)) return DEFAULT_STACK
    stack.push({ kind: kind as ChromeStateKind })
  }
  return stack
}
