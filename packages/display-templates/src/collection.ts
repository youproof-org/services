import { KB_ENTITY_TYPES, KEBAB_CASE } from '@youproof.org/content-model'
import { checkTemplate, type TemplateCheckOptions } from './check'
import {
  TEMPLATE_TARGET_TYPES,
  type DisplayTemplate,
  type DisplayTemplateCollection,
  type DisplayTemplateGroupBy,
  type DisplayTemplateItemForms,
  type DisplayTemplateList,
  type DisplayTemplateSeparators,
  type DisplayTemplateTargetType,
  type LocaleCases,
} from './types'

export interface CollectionReadOptions {
  /** The case keys each locale declares, which a template's `base` and `suffix` may name. */
  cases: LocaleCases
}

export interface CollectionReadResult {
  /** The templates that read without a problem, keyed by name. */
  collection: DisplayTemplateCollection
  /** Every problem in the collection, each naming its template. Empty when the collection is valid. */
  errors: string[]
}

const TEMPLATE_KEYS = ['targets', 'template', 'list']
const LIST_KEYS = ['count', 'group-by', 'order', 'item', 'group', 'before', 'after']
const ITEM_KEYS = ['first', 'middle', 'last', 'only', 'separator', 'last-separator']
const SEPARATOR_KEYS = ['separator', 'last-separator']
const COUNT_KEYS = ['min', 'max']
const GROUP_BY: readonly DisplayTemplateGroupBy[] = ['label', 'parent', 'type']

export function isMapping(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

/**
 * Read one locale's display template collection from its parsed YAML, and report
 * every invalid template in it at once. The defaults the list resolver relies on
 * are filled in here: `middle` from `first`, `last` from `middle`, `last-separator`
 * from `separator`, and an exact `count` as a range of one value.
 */
export function readDisplayTemplateCollection(raw: unknown, options: CollectionReadOptions): CollectionReadResult {
  if (raw === undefined || raw === null) return { collection: {}, errors: [] }
  if (!isMapping(raw)) return { collection: {}, errors: ['the file must map template names to templates.'] }
  const itemForm: TemplateCheckOptions = { links: 'at-most-one', cases: options.cases }
  const listText: TemplateCheckOptions = { links: 'none', expressions: false, cases: options.cases }
  const reader = new TemplateReader(itemForm, listText)
  const collection: DisplayTemplateCollection = {}
  const errors: string[] = []
  for (const [name, entry] of Object.entries(raw)) {
    const problems: string[] = []
    const template = reader.readDisplayTemplate(name, entry, problems)
    if (problems.length > 0) errors.push(...problems.map((problem) => `template '${name}': ${problem}`))
    else if (template) collection[name] = template
  }
  return { collection, errors }
}

function rejectUnknownKeys(raw: Record<string, unknown>, known: string[], where: string, problems: string[]): void {
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) problems.push(`unknown key '${where}${key}'. Known: ${known.join(', ')}`)
  }
}

function readTargets(raw: unknown, problems: string[]): DisplayTemplateTargetType[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push(`'targets' must be a non-empty list of target types. Known: ${TEMPLATE_TARGET_TYPES.join(', ')}`)
    return []
  }
  const targets: DisplayTemplateTargetType[] = []
  for (const type of raw) {
    if (!(TEMPLATE_TARGET_TYPES as readonly unknown[]).includes(type)) {
      problems.push(`'${String(type)}' is not a target type. Known: ${TEMPLATE_TARGET_TYPES.join(', ')}`)
    } else if (targets.includes(type)) {
      problems.push(`'targets' lists '${type}' twice`)
    } else {
      targets.push(type)
    }
  }
  return targets
}

function readCount(raw: unknown, problems: string[]): DisplayTemplateList['count'] | undefined {
  const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1
  if (typeof raw === 'number') {
    if (isCount(raw)) return { min: raw, max: raw }
    problems.push("'list.count' must be a whole number of at least 1")
    return undefined
  }
  if (!isMapping(raw)) {
    problems.push("'list.count' must be a number or a range with 'min' and 'max'")
    return undefined
  }
  rejectUnknownKeys(raw, COUNT_KEYS, 'list.count.', problems)
  const min = raw.min ?? 1
  const max = raw.max
  if (!isCount(min)) problems.push("'list.count.min' must be a whole number of at least 1")
  if (max !== undefined && !isCount(max)) problems.push("'list.count.max' must be a whole number of at least 1")
  if (!isCount(min) || (max !== undefined && !isCount(max))) return undefined
  if (max !== undefined && min >= max) {
    problems.push(`'list.count.min' (${min}) must be smaller than 'list.count.max' (${max}); write one value as 'count: ${min}'`)
    return undefined
  }
  return max === undefined ? { min } : { min, max }
}

function readGroupBy(
  raw: unknown,
  targets: DisplayTemplateTargetType[],
  problems: string[],
): DisplayTemplateGroupBy | undefined {
  if (raw === undefined) return undefined
  if (!(GROUP_BY as unknown[]).includes(raw)) {
    problems.push(`'list.group-by' must be one of ${GROUP_BY.join(', ')}`)
    return undefined
  }
  const groupBy = raw as DisplayTemplateGroupBy
  const supported = (type: DisplayTemplateTargetType) =>
    groupBy === 'type' ||
    (groupBy === 'parent' && type === 'claim') ||
    (groupBy === 'label' && (KB_ENTITY_TYPES as readonly string[]).includes(type))
  const unsupported = targets.filter((type) => !supported(type))
  if (unsupported.length > 0) {
    const which = groupBy === 'parent' ? 'only claims have a parent' : `only ${KB_ENTITY_TYPES.join(', ')} have a label`
    problems.push(`'list.group-by: ${groupBy}' does not apply to ${unsupported.join(', ')}: ${which}`)
  }
  return groupBy
}

/** The checks that depend on the locales' case keys. */
class TemplateReader {
  constructor(
    private readonly itemForm: TemplateCheckOptions,
    private readonly listText: TemplateCheckOptions,
  ) {}

  readDisplayTemplate(name: string, raw: unknown, problems: string[]): DisplayTemplate | undefined {
    if (!KEBAB_CASE.test(name)) problems.push('the name is not kebab-case')
    if (!isMapping(raw)) {
      problems.push("a template must be a mapping with 'targets' and 'template' or 'list'")
      return undefined
    }
    rejectUnknownKeys(raw, TEMPLATE_KEYS, '', problems)
    const targets = readTargets(raw.targets, problems)

    const hasTemplate = raw.template !== undefined
    const hasList = raw.list !== undefined
    if (hasTemplate === hasList) {
      problems.push("a template has exactly one of 'template' and 'list'")
      return undefined
    }
    if (hasTemplate) {
      const template = this.readForm(raw.template, 'template', targets, this.itemForm, problems)
      return template === undefined ? undefined : { kind: 'single', name, targets, template }
    }
    const list = this.readList(raw.list, targets, problems)
    return list && { kind: 'list', name, targets, list }
  }

  private readForm(
    raw: unknown,
    where: string,
    targets: DisplayTemplateTargetType[],
    options: TemplateCheckOptions,
    problems: string[],
  ): string | undefined {
    if (typeof raw !== 'string') {
      problems.push(`'${where}' must be a string`)
      return undefined
    }
    for (const error of checkTemplate(raw, targets, options)) problems.push(`${where}: ${error}`)
    return raw
  }

  private readOptionalForm(
    raw: unknown,
    where: string,
    targets: DisplayTemplateTargetType[],
    options: TemplateCheckOptions,
    problems: string[],
  ): string | undefined {
    return raw === undefined ? undefined : this.readForm(raw, where, targets, options, problems)
  }

  private readSeparators(raw: Record<string, unknown>, where: string, problems: string[]): DisplayTemplateSeparators | undefined {
    const separator = this.readForm(raw.separator, `${where}.separator`, [], this.listText, problems)
    const lastSeparator = this.readOptionalForm(raw['last-separator'], `${where}.last-separator`, [], this.listText, problems)
    return separator === undefined ? undefined : { separator, lastSeparator: lastSeparator ?? separator }
  }

  private readItem(
    raw: unknown,
    targets: DisplayTemplateTargetType[],
    problems: string[],
  ): DisplayTemplateItemForms | undefined {
    if (!isMapping(raw)) {
      problems.push("'list.item' must be a mapping with at least 'first' and 'separator'")
      return undefined
    }
    rejectUnknownKeys(raw, ITEM_KEYS, 'list.item.', problems)
    const first = this.readForm(raw.first, 'list.item.first', targets, this.itemForm, problems)
    const middle = this.readOptionalForm(raw.middle, 'list.item.middle', targets, this.itemForm, problems)
    const last = this.readOptionalForm(raw.last, 'list.item.last', targets, this.itemForm, problems)
    const only = this.readOptionalForm(raw.only, 'list.item.only', targets, this.itemForm, problems)
    const separators = this.readSeparators(raw, 'list.item', problems)
    if (first === undefined || separators === undefined) return undefined
    const resolvedMiddle = middle ?? first
    return {
      first,
      middle: resolvedMiddle,
      last: last ?? resolvedMiddle,
      ...(only === undefined ? {} : { only }),
      ...separators,
    }
  }

  private readList(
    raw: unknown,
    targets: DisplayTemplateTargetType[],
    problems: string[],
  ): DisplayTemplateList | undefined {
    if (!isMapping(raw)) {
      problems.push("'list' must be a mapping with 'count' and 'item'")
      return undefined
    }
    rejectUnknownKeys(raw, LIST_KEYS, 'list.', problems)
    let count: DisplayTemplateList['count'] | undefined
    if (raw.count === undefined) problems.push("'list.count' is required")
    else count = readCount(raw.count, problems)
    const groupBy = readGroupBy(raw['group-by'], targets, problems)
    if (raw.order !== undefined && raw.order !== 'authored') {
      problems.push("'list.order' is either absent, for the targets' order in the content, or 'authored'")
    }
    const item = this.readItem(raw.item, targets, problems)
    let group: DisplayTemplateSeparators | undefined
    if (groupBy !== undefined) {
      if (isMapping(raw.group)) {
        rejectUnknownKeys(raw.group, SEPARATOR_KEYS, 'list.group.', problems)
        group = this.readSeparators(raw.group, 'list.group', problems)
      } else {
        problems.push("'list.group' with a 'separator' is required with 'group-by'")
      }
    } else if (raw.group !== undefined) {
      problems.push("'list.group' only applies with 'group-by'")
    }
    const before = this.readOptionalForm(raw.before, 'list.before', [], this.listText, problems) ?? ''
    const after = this.readOptionalForm(raw.after, 'list.after', [], this.listText, problems) ?? ''

    if (item && count && item.only === undefined && (groupBy !== undefined || count.min === 1)) {
      problems.push(
        groupBy !== undefined
          ? "'list.item.only' is required with 'group-by', since a group can have one member"
          : "'list.item.only' is required when 'list.count' allows one target",
      )
    }
    if (!count || !item || (groupBy !== undefined && !group)) return undefined
    return {
      count,
      ...(groupBy === undefined ? {} : { groupBy, group }),
      order: raw.order === 'authored' ? 'authored' : 'sorted',
      item,
      before,
      after,
    }
  }
}
