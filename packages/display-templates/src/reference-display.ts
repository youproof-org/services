import {
  entityLabelCases,
  refTargetKey,
  type ContentIndex,
  type EntityLabelRegistry,
  type RefTarget,
} from '@youproof.org/content-model'
import { buildContext, groupKeys } from './context'
import { TemplateCaseError } from './expression'
import type { ReferenceItem } from './references'
import { DisplayListError, resolveDisplay, type ListMember } from './resolve'
import { linkSegments } from './segments'
import type { DisplaySegment, DisplayTemplateCollection } from './types'

/** What resolving the references of one file needs. */
export interface ReferenceDisplayOptions {
  /** The locale of the file the references are written in. */
  locale: string
  /** That locale's display template collection, or undefined when it has none. */
  templates: DisplayTemplateCollection | undefined
  content: ContentIndex
  labels: EntityLabelRegistry
}

/** A resolved reference, or why it can't be rendered. */
export type ReferenceDisplay =
  | { segments: DisplaySegment<RefTarget>[]; error?: undefined }
  | { segments?: undefined; error: string }

/** The locale whose case keys a template on `target` may name: the labelled entity's. */
function targetLabelLocale(target: RefTarget, content: ContentIndex): string | undefined {
  if (target.type === 'external') return undefined
  const key = target.type === 'claim' || target.type === 'term' ? target.parentFqn : target.fqn
  return key ? content.entities.get(key)?.locale : undefined
}

/**
 * One reference, resolved to segments: a `text` item through its link brackets, a
 * `display` item through its template, against the context of each target. Every
 * target must come out with exactly one link, since that link is what its
 * incoming reference lands on.
 */
export function resolveReference(item: ReferenceItem, options: ReferenceDisplayOptions): ReferenceDisplay {
  const resolved = displaySegments(item, options)
  if (resolved.error !== undefined) return resolved
  for (const target of item.targets) {
    const links = resolved.segments.filter((segment) => segment.kind === 'link' && segment.target === target).length
    if (links !== 1) {
      return {
        error: `'${refTargetKey(target)}' renders ${links === 0 ? 'no link' : `${links} links`}; every target renders exactly one.`,
      }
    }
  }
  return resolved
}

function displaySegments(item: ReferenceItem, options: ReferenceDisplayOptions): ReferenceDisplay {
  if (item.display === undefined) return { segments: linkSegments(item.text ?? '', item.targets[0]) }
  const { locale, content, labels } = options
  const template = options.templates?.[item.display]
  if (!template) return { error: `'${item.display}' is not a display template in '${locale}'.` }
  const members: ListMember<RefTarget>[] = []
  for (const target of item.targets) {
    const key = refTargetKey(target)
    const context = buildContext(target, content, labels)
    if (!context) return { error: `'${key}' is not in the content graph.` }
    members.push({
      target,
      key,
      context,
      position: content.positions.get(key) ?? Number.MAX_SAFE_INTEGER,
      groups: groupKeys(target, content, labels),
    })
  }
  try {
    return { segments: resolveDisplay(template, members) }
  } catch (err) {
    if (err instanceof DisplayListError) return { error: `template '${item.display}': ${err.message}.` }
    if (!(err instanceof TemplateCaseError)) throw err
    const caseLocale = item.targets.map((target) => targetLabelLocale(target, content)).find(Boolean)
    const declared = caseLocale ? ` '${caseLocale}' declares: ${entityLabelCases(labels, caseLocale).join(', ')}.` : ''
    return { error: `${err.message}.${declared}` }
  }
}

/** Every reference of a file, resolved, in list order. */
export function resolveReferences(items: readonly ReferenceItem[], options: ReferenceDisplayOptions): ReferenceDisplay[] {
  return items.map((item) => resolveReference(item, options))
}
