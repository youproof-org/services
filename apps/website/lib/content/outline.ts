import type { ContentOutline, OutlineEntity } from '@youproof.org/content-model'
import type { ContentGraph, KbNode } from './types'

function outlineEntity(node: KbNode): OutlineEntity {
  return {
    type: node.type,
    locale: node.locale,
    title: node.title,
    label: node.label,
    body: node.body,
    terms: Object.keys(node.terms ?? {}),
    attached: node.type === 'remark' && node.attachedTo !== undefined,
  }
}

/**
 * The graph as the shared numbering and template code reads it (`ContentOutline`
 * in packages/content-model). Books and standalone items are passed as they are,
 * since the graph's nodes already have the outline's shape.
 */
export function contentOutline(graph: ContentGraph): ContentOutline {
  const entities = new Map<string, OutlineEntity>()
  for (const map of [graph.definitions, graph.theorems, graph.proofs, graph.remarks]) {
    for (const [fqn, node] of map) entities.set(fqn, outlineEntity(node))
  }
  return {
    books: [...graph.books.values()],
    entities,
    standalones: [graph.articles, graph.newsletters, graph.pages, graph.landings].flatMap((map) => [...map.values()]),
  }
}
