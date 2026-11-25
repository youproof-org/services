import { resolveTemplate } from './expression'
import { joinSegments, linkSegments } from './segments'
import type {
  DisplaySegment,
  DisplayTemplate,
  DisplayTemplateGroupBy,
  DisplayTemplateItemForms,
  DisplayTemplateList,
  DisplayTemplateSeparators,
  TemplateContext,
} from './types'

/** One target of a reference, with what a list template needs to know about it. */
export interface ListMember<T> {
  target: T
  /** Identifies the target, such as its fully qualified name. Two members with one key are the same target. */
  key: string
  context: TemplateContext
  /** Where the target sits in the content. A sorted list renders its members in ascending position. */
  position: number
  /** What the target shares with the other members of its group, for each `group-by` the caller supports. */
  groups: Partial<Record<DisplayTemplateGroupBy, string>>
}

/** A reference whose targets don't fit its template: too many, too few, or one listed twice. */
export class DisplayListError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DisplayListError'
  }
}

/** A single-target template, resolved against its target's context. */
export function resolveSingle<T>(template: string, target: T, context: TemplateContext): DisplaySegment<T>[] {
  return linkSegments(resolveTemplate(template, context).trim(), target)
}

function describeCount({ min, max }: DisplayTemplateList['count']): string {
  if (max === undefined) return `at least ${min}`
  return min === max ? `exactly ${min}` : `${min} to ${max}`
}

function targetCount(n: number): string {
  return n === 1 ? '1 target' : `${n} targets`
}

function checkMembers<T>(count: DisplayTemplateList['count'], members: readonly ListMember<T>[]): void {
  if (members.length < count.min || (count.max !== undefined && members.length > count.max)) {
    throw new DisplayListError(`the template takes ${describeCount(count)} targets, not ${members.length}`)
  }
  const seen = new Set<string>()
  for (const member of members) {
    if (seen.has(member.key)) throw new DisplayListError(`'${member.key}' is listed twice`)
    seen.add(member.key)
  }
}

function groupMembers<T>(members: readonly ListMember<T>[], groupBy: DisplayTemplateGroupBy | undefined): ListMember<T>[][] {
  if (groupBy === undefined) return [[...members]]
  const groups = new Map<string, ListMember<T>[]>()
  for (const member of members) {
    const key = member.groups[groupBy]
    if (key === undefined) throw new Error(`'${member.key}' has no '${groupBy}' to group by`)
    const group = groups.get(key)
    if (group) group.push(member)
    else groups.set(key, [member])
  }
  return [...groups.values()]
}

function formAt(item: DisplayTemplateItemForms, index: number, size: number): string {
  if (size === 1) {
    if (item.only === undefined) throw new DisplayListError(`the template has no 'only' form for a lone ${targetCount(1)}`)
    return item.only
  }
  if (index === 0) return item.first
  return index === size - 1 ? item.last : item.middle
}

function separatorBefore(index: number, size: number, separators: DisplayTemplateSeparators): string {
  return index === size - 1 ? separators.lastSeparator : separators.separator
}

/**
 * A list template, resolved against its targets. The targets are sorted by
 * position unless the template keeps the authored order, then grouped, with the
 * groups in the order of their first member. Positions, and so the item forms and
 * separators, count within each group.
 */
export function resolveList<T>(list: DisplayTemplateList, members: readonly ListMember<T>[]): DisplaySegment<T>[] {
  checkMembers(list.count, members)
  const ordered = list.order === 'sorted' ? [...members].sort((a, b) => a.position - b.position) : members
  const groups = groupMembers(ordered, list.groupBy)
  const parts: DisplaySegment<T>[] = [{ kind: 'text', text: list.before }]
  groups.forEach((group, g) => {
    if (g > 0 && list.group) parts.push({ kind: 'text', text: separatorBefore(g, groups.length, list.group) })
    group.forEach((member, i) => {
      if (i > 0) parts.push({ kind: 'text', text: separatorBefore(i, group.length, list.item) })
      parts.push(...resolveSingle(formAt(list.item, i, group.length), member.target, member.context))
    })
  })
  parts.push({ kind: 'text', text: list.after })
  return joinSegments(parts)
}

/** A collection template, single or list, resolved against a reference's targets. */
export function resolveDisplay<T>(template: DisplayTemplate, members: readonly ListMember<T>[]): DisplaySegment<T>[] {
  if (template.kind === 'list') return resolveList(template.list, members)
  if (members.length !== 1) {
    throw new DisplayListError(`the template takes exactly 1 target, not ${members.length}`)
  }
  const [member] = members
  return resolveSingle(template.template, member.target, member.context)
}
