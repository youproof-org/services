import {
  entityLabels,
  entityLabelVariant,
  KB_ENTITY_TYPES,
  type ContentIndex,
  type EntityLabelRegistry,
  type OutlineEntity,
  type RefTarget,
} from '@youproof.org/content-model'
import type { ListMember } from './resolve'
import type { ContextObject, DisplayTemplateGroupBy, TemplateContext } from './types'

function labelContext(labels: EntityLabelRegistry, entity: OutlineEntity): ContextObject {
  return entityLabels(labels, entity.locale, entity.type, entity.label) as unknown as ContextObject
}

/**
 * The context a template reads for one target, in the shapes `TEMPLATE_CONTEXT_SHAPES`
 * declares. Null when the content doesn't hold the target, or when nothing renders
 * its type (a part, or an external URL).
 */
export function buildContext(target: RefTarget, content: ContentIndex, labels: EntityLabelRegistry): TemplateContext | null {
  if (target.type === 'book') {
    const book = content.books.get(target.fqn)
    if (!book) return null
    return { target: { name: book.name, title: book.title, type: 'book' } }
  }

  if (target.type === 'article' || target.type === 'newsletter' || target.type === 'page' || target.type === 'landing') {
    const item = content.standalones.find((candidate) => candidate.kind === target.type && candidate.name === target.name)
    if (!item) return null
    return { target: { name: item.name, title: item.title, type: target.type } }
  }

  if (target.type === 'chapter') {
    const found = content.chapters.get(target.fqn)
    if (!found) return null
    return { target: { index: found.index, name: found.chapter.name, title: found.chapter.title, type: 'chapter' } }
  }

  if (target.type === 'claim') {
    const parent = content.entities.get(target.parentFqn)
    if (!parent) return null
    let claimIdx = 0
    let found = false
    for (const block of parent.body) {
      if (block.type === 'claim') {
        claimIdx++
        if (block.name === target.name) { found = true; break }
      }
    }
    if (!found) return null
    return {
      target: {
        index: `${claimIdx}.`,
        name: target.name,
        type: 'claim',
        parent: {
          index: content.embedding.get(target.parentFqn)?.index ?? '',
          label: labelContext(labels, parent),
        },
      },
    }
  }

  if (target.type === 'term') {
    const parent = content.entities.get(target.parentFqn)
    if (!parent) return null
    return {
      target: {
        type: 'term',
        name: target.name,
        parent: {
          index: content.embedding.get(target.parentFqn)?.index ?? '',
          label: labelContext(labels, parent),
        },
      },
    }
  }

  if (target.type === 'section') {
    const found = content.sections.get(target.fqn)
    if (!found) return null
    return { target: { index: found.index, name: found.section.name, title: found.section.title, type: 'section' } }
  }

  if (target.type === 'definition' || target.type === 'theorem' || target.type === 'proof' || target.type === 'remark') {
    const entity = content.entities.get(target.fqn)
    if (!entity) return null
    return {
      target: {
        type: target.type,
        name: target.name,
        title: entity.title ?? '',
        label: labelContext(labels, entity),
        index: content.embedding.get(target.fqn)?.index ?? '',
      },
    }
  }

  return null
}

/** What a target shares with the other members of its group, for each `group-by` it supports. */
export function groupKeys(target: RefTarget, content: ContentIndex, labels: EntityLabelRegistry): ListMember<RefTarget>['groups'] {
  if (target.type === 'external') return {}
  const groups: Partial<Record<DisplayTemplateGroupBy, string>> = { type: target.type }
  if (target.type === 'claim') groups.parent = target.parentFqn
  const entity = (KB_ENTITY_TYPES as readonly string[]).includes(target.type) ? content.entities.get(target.fqn) : undefined
  if (entity) groups.label = `${entity.type}:${entityLabelVariant(labels, entity.locale, entity.type, entity.label)}`
  return groups
}
