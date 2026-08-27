// The entity page's context menu: what a back step means, what a history entry is
// allowed to restore, and which items an entity carries.
//
// The chrome itself is browser work — a portal, `history.pushState`, `popstate`,
// Escape — and none of that is here. What is here is the part all four ways of
// stepping back go through (`reduceChrome`), the validation standing between a
// history entry and the rendered state (`readChromeStack`), and the availability
// rules of §6.2/§6.5 (`kbMenuItems`). Those are the pieces that can be wrong
// without a browser showing it.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as chromeModule from '../lib/kb/chrome-state.ts'
import * as menuModule from '../lib/kb/menu-items.ts'
import * as graphModule from '../lib/content/graph.ts'
import { hu, claim, narrative, raw } from './support/raw-graph.mjs'

const {
  CHROME_HISTORY_KEY,
  DEFAULT_STACK,
  currentState,
  isDefaultState,
  openPanel,
  readChromeStack,
  reduceChrome,
} = chromeModule.default ?? chromeModule
const { kbMenuItems } = menuModule.default ?? menuModule
const { buildGraphFromRaw } = graphModule.default ?? graphModule

const MENU = { kind: 'menu' }
const CONTEXT = { kind: 'context' }
const INCOMING = { kind: 'incoming' }
const open = (stack, state = MENU) => reduceChrome(stack, { type: 'open', state })
const back = (stack) => reduceChrome(stack, { type: 'back' })

// ---------------------------------------------------------------------------
// The state stack
// ---------------------------------------------------------------------------

test('the default state is the empty stack, and nothing else is', () => {
  assert.deepEqual(DEFAULT_STACK, [])
  assert.equal(isDefaultState(DEFAULT_STACK), true)
  assert.equal(currentState(DEFAULT_STACK), null)
  assert.equal(isDefaultState(open(DEFAULT_STACK)), false)
  assert.deepEqual(currentState(open(DEFAULT_STACK)), MENU)
})

test('a back step pops exactly one state, however deep the stack is', () => {
  const two = open(open(DEFAULT_STACK), MENU)
  assert.equal(two.length, 2)
  assert.equal(back(two).length, 1)
  assert.equal(back(back(two)).length, 0)
})

test('stepping back from the default state is a no-op, not an error', () => {
  // The reader's Back belongs to the browser again once the page is default;
  // the machine must not go negative if something asks anyway.
  assert.deepEqual(back(DEFAULT_STACK), [])
})

test('repeated back steps walk to the default state and stay there', () => {
  let stack = open(open(open(DEFAULT_STACK)))
  for (let i = 0; i < 5; i += 1) stack = back(stack)
  assert.equal(isDefaultState(stack), true)
})

test('a step never mutates the stack it was given, so a history entry keeps its own', () => {
  const one = open(DEFAULT_STACK)
  const two = open(one)
  back(two)
  assert.equal(one.length, 1, 'the entry pushed first still describes one state')
  assert.equal(two.length, 2)
})

test('restore replaces the stack wholesale — this is what Back and Forward both do', () => {
  const two = open(open(DEFAULT_STACK))
  assert.deepEqual(reduceChrome(two, { type: 'restore', stack: DEFAULT_STACK }), [])
  // Forward re-applies what Back undid: the same action, the other entry's stack.
  assert.deepEqual(reduceChrome(DEFAULT_STACK, { type: 'restore', stack: two }), two)
})

// ---------------------------------------------------------------------------
// What a history entry may restore
// ---------------------------------------------------------------------------

test('the stack survives a round trip through a history entry', () => {
  const stack = open(DEFAULT_STACK)
  // The entry the component pushes: our key beside whatever else is in there.
  const entry = { __NA: true, [CHROME_HISTORY_KEY]: stack }
  assert.deepEqual(readChromeStack(entry), stack)
})

test('an entry that is not ours reads as the default state', () => {
  // The entry the page loaded on, an entry the router pushed, and a document the
  // browser has no state for — every one of them means "default", not "unknown".
  assert.deepEqual(readChromeStack(null), [])
  assert.deepEqual(readChromeStack(undefined), [])
  assert.deepEqual(readChromeStack({ __NA: true }), [])
})

test('a malformed entry reads as the default state rather than an unknown one', () => {
  for (const value of ['menu', 42, {}, [{}], [{ kind: 'panel' }], [{ kind: 'menu' }, null]]) {
    assert.deepEqual(
      readChromeStack({ [CHROME_HISTORY_KEY]: value }),
      [],
      `${JSON.stringify(value)} should not restore a state`,
    )
  }
})

// ---------------------------------------------------------------------------
// Which state is a panel (§6.4)
// ---------------------------------------------------------------------------

test('no panel is open in the default state or with the menu up', () => {
  assert.equal(openPanel(DEFAULT_STACK), null)
  assert.equal(openPanel(open(DEFAULT_STACK, MENU)), null)
})

test('a panel state names the panel that is open', () => {
  // Opened from the menu, so the stack is menu-then-panel: the panel is the top.
  const stack = open(open(DEFAULT_STACK, MENU), CONTEXT)
  assert.equal(openPanel(stack), 'context')
  // One step back is the open menu again, with no panel — which is what closing
  // the panel and unlocking the page comes down to.
  assert.equal(openPanel(back(stack)), null)
  assert.deepEqual(currentState(back(stack)), MENU)
})

test('a panel state survives a history entry, and an unknown kind still does not', () => {
  const stack = open(open(DEFAULT_STACK, MENU), CONTEXT)
  assert.deepEqual(readChromeStack({ [CHROME_HISTORY_KEY]: stack }), stack)
  // …and the panel that landed with it.
  const incoming = open(open(DEFAULT_STACK, MENU), INCOMING)
  assert.deepEqual(readChromeStack({ [CHROME_HISTORY_KEY]: incoming }), incoming)
  // The kinds are a closed set: a panel whose phase has not landed cannot be
  // restored from an entry written by a newer build. `claims` is one of those —
  // it is a menu item today, but not yet a state.
  assert.deepEqual(readChromeStack({ [CHROME_HISTORY_KEY]: [{ kind: 'claims' }] }), [])
})

// ---------------------------------------------------------------------------
// Which items an entity carries (§6.2, §6.5)
// ---------------------------------------------------------------------------

const keysOf = (node) => kbMenuItems(node).map((item) => item.key)

test('Bejövő hivatkozások and Kontextus are on every entity', () => {
  const g = buildGraphFromRaw(raw())
  for (const node of [
    g.definitions.get('definitions.def-egy'),
    g.theorems.get('theorems.tetel-egy'),
    g.proofs.get('theorems.tetel-egy.proofs.biz-egy'),
    g.remarks.get('definitions.def-egy.remarks.rem-egy'),
  ]) {
    const keys = keysOf(node)
    assert.ok(keys.includes('incoming'), `${node.type} has no incoming item`)
    assert.ok(keys.includes('context'), `${node.type} has no context item`)
  }
})

test('Fogalmak follows the terms and Állítások the claims, in menu order', () => {
  const g = buildGraphFromRaw(raw())
  // The fixture definition defines one term and asserts one claim.
  assert.deepEqual(keysOf(g.definitions.get('definitions.def-egy')), [
    'incoming',
    'terms',
    'claims',
    'context',
  ])
  // The theorem has neither, and a short menu is the common case (§6.5).
  assert.deepEqual(keysOf(g.theorems.get('theorems.tetel-egy')), ['incoming', 'context'])
})

test('a node with an empty terms map has no Fogalmak item', () => {
  const g = buildGraphFromRaw(raw({ terms: {} }))
  assert.ok(!keysOf(g.definitions.get('definitions.def-egy')).includes('terms'))
})

test('Állítások never appears on a proof, even if one carries a claim', () => {
  // Forbidden by the identifiers sub-plan's D3, so this cannot come from content —
  // it is the type rule of §6.5 written down where the menu can be wrong.
  const proof = { ...hu, type: 'proof', name: 'p', slug: 'p', body: [narrative('B.'), claim('c', 'c')] }
  assert.deepEqual(keysOf(proof), ['incoming', 'context'])
})

test('every item carries its localized caption and its icon', () => {
  const g = buildGraphFromRaw(raw())
  const items = kbMenuItems(g.definitions.get('definitions.def-egy'))
  assert.deepEqual(
    items.map((item) => [item.key, item.icon, item.label]),
    [
      ['incoming', 'incoming', 'Bejövő hivatkozások'],
      ['terms', 'star', 'Fogalmak'],
      ['claims', 'paragraph', 'Állítások'],
      ['context', 'target', 'Kontextus'],
    ],
  )
})
