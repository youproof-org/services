import { getLocaleLabel, type LabelKey } from '@/lib/i18n/config'
import type { KbNode } from '@/lib/content/types'

/**
 * Which items an entity's context menu carries, and what each one looks like
 * (sub-plan §6.2, §6.5).
 *
 * Server-side, and it has to be: the menu is a client component, and a `KbNode`
 * cannot cross that boundary — it holds parent and child references, so it is a
 * cyclic object graph, not serializable props. What crosses is the flat list this
 * builds: a key, an icon name and a localized caption per item.
 */

/** The four items, in the order §6.2 lists them — which is top to bottom. */
export type KbMenuItemKey = 'incoming' | 'terms' | 'claims' | 'context'

/** The generated icon files under `public/assets/generated/kb-menu/` (D3). */
export type KbMenuIcon = 'menu' | 'back' | 'incoming' | 'star' | 'paragraph' | 'target'

export interface KbMenuItem {
  key: KbMenuItemKey
  icon: KbMenuIcon
  /** The caption, already localized: the client component takes no locale. */
  label: string
}

const ICON: Record<KbMenuItemKey, KbMenuIcon> = {
  incoming: 'incoming',
  terms: 'star',
  claims: 'paragraph',
  context: 'target',
}

const LABEL: Record<KbMenuItemKey, LabelKey> = {
  incoming: 'kbMenuIncoming',
  terms: 'kbMenuTerms',
  claims: 'kbMenuClaims',
  context: 'kbMenuContext',
}

/** Fogalmak's condition: the node defines at least one term. */
function definesTerm(node: KbNode): boolean {
  return Object.keys(node.terms ?? {}).length > 0
}

/**
 * Állítások's condition: the node asserts at least one claim, and is not a proof.
 *
 * The type check is a guard, not a filter — the identifiers sub-plan (D3) makes a
 * `claim` block inside a proof body a build error, so nothing should reach here
 * with one. §6.5 states the rule as the type's rather than the content's ("never",
 * not "currently zero"), and the menu should read the same way.
 */
function assertsClaim(node: KbNode): boolean {
  if (node.type === 'proof') return false
  return node.body.some((block) => block.type === 'claim')
}

/**
 * Bejövő hivatkozások and Kontextus are on every entity page: every one of the
 * entities is embedded exactly once, so Kontextus can never open an empty panel,
 * and an entity with no inbound reference gets an empty list rather than no item —
 * one place to look, whatever the answer turns out to be.
 */
function isAvailable(node: KbNode, key: KbMenuItemKey): boolean {
  switch (key) {
    case 'terms':
      return definesTerm(node)
    case 'claims':
      return assertsClaim(node)
    default:
      return true
  }
}

export function kbMenuItems(node: KbNode): KbMenuItem[] {
  const keys: KbMenuItemKey[] = ['incoming', 'terms', 'claims', 'context']
  return keys
    .filter((key) => isAvailable(node, key))
    .map((key) => ({ key, icon: ICON[key], label: getLocaleLabel(node.locale, LABEL[key]) }))
}
