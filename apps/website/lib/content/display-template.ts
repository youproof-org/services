import 'server-only'
import type { ContextObject, TemplateContext } from '@youproof.org/display-templates'
import type { RefTarget, ContentGraph, StandaloneNode } from './types'
import { getChapterIndexLabel, getSectionIndexLabel } from '../utils/index-helpers'
import { entityLabels } from '../i18n/entity-labels'

// The content graph's side of the display template engine
// (@youproof.org/display-templates): the context a template reads for each target.
// Everything that works on a context lives in the engine, so the editor renders
// with the same code.

/**
 * Build a TemplateContext for the given RefTarget.
 * Returns null if the target type does not support template fields.
 * Extend this function to add context for new target types.
 */
// Embedding info is read straight off the graph (graph.embedding) rather than
// passed in: it is built before any display template is resolved, and threading it
// through as an optional argument made it possible to call this with the argument
// missing and silently lose every `{target.index}`.

export function buildContext(
  target: RefTarget,
  graph: ContentGraph,
): TemplateContext | null {
  if (target.type === 'book') {
    const book = graph.books.get(target.fqn)
    if (!book) return null
    // No `index`: a book is the top of the numbering, not a numbered item within it.
    return {
      target: {
        name: book.name,
        title: book.title,
        type: 'book',
      },
    }
  }

  if (
    target.type === 'article' || target.type === 'newsletter' ||
    target.type === 'page'    || target.type === 'landing'
  ) {
    const map =
      target.type === 'article'    ? graph.articles :
      target.type === 'newsletter' ? graph.newsletters :
      target.type === 'page'       ? graph.pages :
                                     graph.landings
    // Scanned by `name` instead of keyed: the Map key embeds the per-kind content
    // directory (STANDALONE_DIRS in graph.ts, where `newsletter` is singular), and a
    // copy of that mapping here would break silently if it ever changed. There is a
    // handful of standalone items and this runs once per reference at build time.
    let node: StandaloneNode | undefined
    for (const candidate of map.values()) {
      if (candidate.name === target.name) { node = candidate; break }
    }
    if (!node) return null
    // No `index`: standalone items are not numbered.
    return {
      target: {
        name: node.name,
        title: node.title,
        type: target.type,
      },
    }
  }

  if (target.type === 'chapter') {
    const chapter = graph.chapters.get(target.fqn)
    if (!chapter) return null
    return {
      target: {
        index: getChapterIndexLabel(chapter),
        name: chapter.name,
        title: chapter.title,
        type: 'chapter',
      },
    }
  }

  if (target.type === 'claim') {
    const parentKey = target.parentFqn
    const parentEntity =
      graph.definitions.get(parentKey) ??
      graph.theorems.get(parentKey) ??
      graph.proofs.get(parentKey) ??
      graph.remarks.get(parentKey)
    if (!parentEntity) return null
    let claimIdx = 0
    let found = false
    for (const block of parentEntity.body) {
      if (block.type === 'claim') {
        claimIdx++
        if (block.name === target.name) { found = true; break }
      }
    }
    if (!found) return null
    const parentInfo = graph.embedding.get(target.parentFqn)
    return {
      target: {
        index: `${claimIdx}.`,
        name:  target.name,
        type:  'claim',
        parent: {
          index: parentInfo?.index ?? '',
          label: entityLabels(parentEntity.locale, parentEntity.type, parentEntity.label) as unknown as ContextObject,
        },
      },
    }
  }

  if (target.type === 'term') {
    const parentKey = target.parentFqn
    const parentEntity =
      graph.definitions.get(parentKey) ??
      graph.theorems.get(parentKey)   ??
      graph.proofs.get(parentKey)     ??
      graph.remarks.get(parentKey)
    if (!parentEntity) return null
    const parentInfo = graph.embedding.get(target.parentFqn)
    return {
      target: {
        type: 'term',
        name: target.name,
        parent: {
          index: parentInfo?.index ?? '',
          label: entityLabels(parentEntity.locale, parentEntity.type, parentEntity.label) as unknown as ContextObject,
        },
      },
    }
  }

  if (target.type === 'section') {
    const section = graph.sections.get(target.fqn)
    if (!section) return null
    return {
      target: {
        index: getSectionIndexLabel(section),
        name: section.name,
        title: section.title,
        type: 'section',
      },
    }
  }

  if (
    target.type === 'definition' || target.type === 'theorem' ||
    target.type === 'proof'       || target.type === 'remark'
  ) {
    const entityKey = target.fqn
    const entity =
      graph.definitions.get(entityKey) ?? graph.theorems.get(entityKey) ??
      graph.proofs.get(entityKey)     ?? graph.remarks.get(entityKey)
    if (!entity) return null
    const info = graph.embedding.get(target.fqn)
    return {
      target: {
        type:  target.type,
        name:  target.name,
        title: entity.title ?? '',
        label: entityLabels(entity.locale, entity.type, entity.label) as unknown as ContextObject,
        index: info?.index ?? '',
      },
    }
  }

  return null
}
