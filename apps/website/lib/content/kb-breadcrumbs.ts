import type { BreadcrumbItem } from '@/components/layout/Breadcrumb'
import { getLocaleLabel } from '@/lib/i18n/config'
import type { ContentGraph, KbNode } from './types'
import { kbNodeTitle } from './graph'
import {
  homeUrl,
  urlForKbRoot,
  urlForDefinitionsIndex,
  urlForTheoremsIndex,
  urlForGlossary,
  urlForKbNode,
} from './urls'

/**
 * The breadcrumb chain of every knowledge-base page, in one place.
 *
 * Two entry points, because the two families of page know different things: a list
 * page is identified by its key alone, while an entity's chain is derived from the
 * node — its own ownership, not its namespace, decides its ancestors, exactly as
 * its URL does (see urls.ts). Both chains start `Főoldal → Tudásbázis`.
 *
 *   kb-root            Főoldal → Tudásbázis
 *   definitions-index  Főoldal → Tudásbázis → Definíciók
 *   theorems-index     Főoldal → Tudásbázis → Tételek
 *   glossary           Főoldal → Tudásbázis → Fogalmak
 *   definition         Főoldal → Tudásbázis → Definíciók → {def}
 *   theorem            Főoldal → Tudásbázis → Tételek → {thm}
 *   proof              Főoldal → Tudásbázis → Tételek → {thm} → {proof}
 *   remark             the owner's chain, then the remark — so a remark on a proof
 *                      reads → Tételek → {thm} → {proof} → {remark}
 *
 * Every label comes from the locale dictionary or from `kbNodeTitle`, and every
 * href from the `urlFor*` helpers; nothing here builds a path or picks a word.
 */

/** The knowledge-base pages that list rather than render a node. */
export type KbListPage = 'kb-root' | 'definitions-index' | 'theorems-index' | 'glossary'

const homeCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'home'),
  href: homeUrl(locale),
})

const kbRootCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'knowledgeBase'),
  href: urlForKbRoot(locale),
})

const definitionsCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'definitionsIndex'),
  href: urlForDefinitionsIndex(locale),
})

const theoremsCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'theoremsIndex'),
  href: urlForTheoremsIndex(locale),
})

const glossaryCrumb = (locale: string): BreadcrumbItem => ({
  label: getLocaleLabel(locale, 'glossary'),
  href: urlForGlossary(locale),
})

/** The chain of one of the four knowledge-base list pages. */
export function kbListBreadcrumbs(locale: string, page: KbListPage): BreadcrumbItem[] {
  const chain = [homeCrumb(locale), kbRootCrumb(locale)]
  switch (page) {
    case 'kb-root':
      return chain
    case 'definitions-index':
      return [...chain, definitionsCrumb(locale)]
    case 'theorems-index':
      return [...chain, theoremsCrumb(locale)]
    case 'glossary':
      return [...chain, glossaryCrumb(locale)]
  }
}

/** The chain of an entity page, following the node's ownership. */
export function kbEntityBreadcrumbs(graph: ContentGraph, node: KbNode): BreadcrumbItem[] {
  return [homeCrumb(node.locale), kbRootCrumb(node.locale), ...ownershipChain(graph, node)]
}

/**
 * The part of an entity's chain below `Tudásbázis`: the type index it belongs to,
 * every owner between that and the node, and the node itself. Recursive through the
 * ownership chain, so a proof's remark carries the theorem and the proof above it.
 */
function ownershipChain(graph: ContentGraph, node: KbNode): BreadcrumbItem[] {
  const self = nodeCrumb(graph, node)
  switch (node.type) {
    case 'definition':
      return [definitionsCrumb(node.locale), self]
    case 'theorem':
      return [theoremsCrumb(node.locale), self]
    case 'proof':
      return [...ownershipChain(graph, node.proves), self]
    case 'remark':
      // A remark's chain is its owner's chain plus itself. An owner-less remark has
      // no place in the hierarchy at all — `nodeCrumb` has already thrown on it,
      // for the same reason `urlForRemark` returns null there.
      return [...(node.attachedTo ? ownershipChain(graph, node.attachedTo) : []), self]
  }
}

/**
 * A node's own crumb. The leaf of a breadcrumb still needs an href (it is the
 * canonical URL of the page the reader is on), so a node without one has no chain:
 * that is only an owner-less remark, which the model permits, no content has, and
 * no route generates.
 */
function nodeCrumb(graph: ContentGraph, node: KbNode): BreadcrumbItem {
  const href = urlForKbNode(node)
  if (!href) {
    throw new Error(
      `${node.type} '${node.name}' has no page URL, so it has no breadcrumb chain.`,
    )
  }
  return { label: kbNodeTitle(graph, node), href }
}
