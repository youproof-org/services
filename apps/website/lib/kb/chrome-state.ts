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
 * `menu` is the open context menu. Every other kind is a panel, and is named after
 * the menu item that opens it (`KbMenuItemKey`) so the two cannot drift: `context`
 * is the Kontextus panel. The remaining items and the two selection modes join as
 * their phases land, and nothing here changes when they do except this union and
 * `STATE_KINDS`.
 */
export type ChromeStateKind = 'menu' | 'context'

/** The kinds a restored history entry may name — anything else is not ours. */
const STATE_KINDS: readonly ChromeStateKind[] = ['menu', 'context']

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

/** The kinds that are a panel rather than the menu — every kind except `menu`. */
export type ChromePanelKind = Exclude<ChromeStateKind, 'menu'>

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
  return state === null || state.kind === 'menu' ? null : state.kind
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
