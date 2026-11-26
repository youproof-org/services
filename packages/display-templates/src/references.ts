import { parseRefTarget, refTargetKey, type RefTarget } from '@youproof.org/content-model'
import { checkLinkText } from './check'
import { isMapping } from './collection'
import { referenceTokens } from './inline-tokens'
import { targetCountError } from './resolve'
import type { DisplayTemplateCollection } from './types'

/** One item of a file's `references` list, cited in the text as `[i]`, its index. Exactly one of `display` and `text` is set. */
export interface ReferenceItem {
  /** A template name in the display template collection of the file's locale. */
  display?: string
  /** Literal link text, with `[...]` marking the link. */
  text?: string
  /** One or more. A single `target` in the YAML reads as a list of one. */
  targets: RefTarget[]
}

/** What the checks of a file's `references` need to know about the file. */
export interface ReferenceScope {
  locale: string
  /** Locale -> that locale's display template collection. */
  templates: Readonly<Record<string, DisplayTemplateCollection>>
  /** The text fields that can hold `[i]` tokens, in the order the site renders them. */
  texts: readonly string[]
}

export interface ReferencesReadResult {
  /** One entry per list item, in list order. An item that can't be read is `undefined`, so indexes still match the tokens. */
  references: (ReferenceItem | undefined)[]
  /** Every problem with the list and with how the text uses it. Empty when the file's references are valid. */
  errors: string[]
}

const REFERENCE_KEYS = ['display', 'text', 'target', 'targets']

/**
 * The fields of each kind of content file whose blocks hold reference tokens, in
 * the order the site renders them.
 */
export const REFERENCE_TEXT_FIELDS = {
  entity: ['body'],
  section: ['body'],
  chapter: ['abstract', 'prerequisite-warning', 'prologue', 'epilogue'],
  standalone: ['abstract', 'prologue', 'epilogue'],
} as const satisfies Record<string, readonly string[]>

export type ReferenceFileKind = keyof typeof REFERENCE_TEXT_FIELDS

/** The text fields of a parsed content file that can hold `[i]` tokens, in the order the site renders them. */
export function fileReferenceTexts(file: Readonly<Record<string, unknown>>, kind: ReferenceFileKind): string[] {
  return REFERENCE_TEXT_FIELDS[kind].flatMap((field) => referenceTexts(file[field]))
}

/**
 * The text fields of a parsed list of blocks that the site renders with the
 * references, in the order it renders them. The blocks are as the YAML has them,
 * with kebab-case keys. A block's `context` doesn't matter: a `latex` block is not
 * on the web page, but its tokens are part of the file all the same.
 */
export function referenceTexts(blocks: unknown): string[] {
  const texts: string[] = []
  if (!Array.isArray(blocks)) return texts
  const add = (...fields: unknown[]) => {
    for (const field of fields) if (typeof field === 'string') texts.push(field)
  }
  for (const block of blocks) {
    if (!isMapping(block)) continue
    switch (block.type) {
      case 'narrative':
      case 'claim':
        add(block.content)
        break
      case 'formula':
        add(block['lead-in'], block['lead-out'])
        break
      case 'figure':
        add(block['lead-in'], block.caption)
        break
      case 'unordered-list':
      case 'ordered-list':
        add(block['lead-in'], ...(Array.isArray(block.items) ? block.items : []))
        break
      case 'typewriter':
        add(block['lead-in'])
        break
      case 'quote':
        add(block['lead-in'], block.quote)
        break
      case 'details':
        add(block.title)
        texts.push(...referenceTexts(block.blocks))
        break
      case 'subsection':
        texts.push(...referenceTexts(block.blocks))
        break
    }
  }
  return texts
}

function readItemTargets(raw: Record<string, unknown>, where: string, problems: string[]): RefTarget[] {
  const hasTarget = raw.target !== undefined
  const hasTargets = raw.targets !== undefined
  if (hasTarget === hasTargets) {
    problems.push(`${where}: an item has exactly one of 'target' and 'targets'`)
    return []
  }
  const authored = hasTarget ? [raw.target] : raw.targets
  if (!Array.isArray(authored) || authored.length === 0) {
    problems.push(`${where}: 'targets' must be a non-empty list`)
    return []
  }
  const targets: RefTarget[] = []
  const seen = new Set<string>()
  for (const value of authored) {
    let target: RefTarget
    try {
      target = parseRefTarget(value, where)
    } catch (err) {
      problems.push(err instanceof Error ? err.message : String(err))
      continue
    }
    const key = refTargetKey(target)
    if (seen.has(key)) problems.push(`${where}: lists '${key}' twice`)
    seen.add(key)
    targets.push(target)
  }
  return targets
}

function checkDisplay(display: string, targets: RefTarget[], where: string, scope: ReferenceScope, problems: string[]): void {
  const template = scope.templates[scope.locale]?.[display]
  if (!template) {
    problems.push(`${where}: '${display}' is not a display template in '${scope.locale}'`)
    return
  }
  for (const target of targets) {
    if (!(template.targets as readonly string[]).includes(target.type)) {
      problems.push(
        `${where}: template '${display}' takes ${template.targets.join(', ')} targets, ` +
          `not ${target.type === 'external' ? 'a URL' : `a ${target.type}`} ('${refTargetKey(target)}')`,
      )
    }
  }
  const countError = targetCountError(template, targets.length)
  if (countError && targets.length > 0) problems.push(`${where}: template '${display}' ${countError}`)
}

function readReferenceItem(raw: unknown, index: number, scope: ReferenceScope, problems: string[]): ReferenceItem | undefined {
  const where = `reference [${index}]`
  if (!isMapping(raw)) {
    problems.push(`${where}: an item is a mapping with a 'target' and a 'display' or 'text'`)
    return undefined
  }
  for (const key of Object.keys(raw)) {
    if (!REFERENCE_KEYS.includes(key)) problems.push(`${where}: unknown key '${key}'. Known: ${REFERENCE_KEYS.join(', ')}`)
  }
  const targets = readItemTargets(raw, where, problems)
  const hasDisplay = raw.display !== undefined
  const hasText = raw.text !== undefined
  if (hasDisplay === hasText) {
    problems.push(`${where}: an item has exactly one of 'display' and 'text'`)
    return undefined
  }
  if (hasDisplay) {
    if (typeof raw.display !== 'string' || raw.display === '') {
      problems.push(`${where}: 'display' must name a display template`)
      return undefined
    }
    checkDisplay(raw.display, targets, where, scope, problems)
    return { display: raw.display, targets }
  }
  if (typeof raw.text !== 'string' || raw.text === '') {
    problems.push(`${where}: 'text' must be non-empty link text`)
    return undefined
  }
  for (const error of checkLinkText(raw.text)) problems.push(`${where}: text: ${error}`)
  if (targets.length > 1) {
    problems.push(`${where}: a 'text' item has one target. Several targets need a list template in 'display'`)
  }
  return { text: raw.text, targets }
}

/**
 * The problems with how the text uses the list: a token with no item, an item
 * used never or more than once, a list that isn't in the order the text uses it,
 * and a `[key]` token, which names a reference the way the old dictionary did.
 */
function checkTokens(count: number, texts: readonly string[], problems: string[]): void {
  const uses = new Array<number>(count).fill(0)
  const order: number[] = []
  const legacy = new Set<string>()
  const unknown = new Set<number>()
  for (const text of texts) {
    for (const token of referenceTokens(text)) {
      if (token.kind === 'legacy-ref') {
        legacy.add(token.key)
      } else if (token.index >= count) {
        unknown.add(token.index)
      } else if (uses[token.index]++ === 0) {
        order.push(token.index)
      }
    }
  }
  for (const key of legacy) {
    problems.push(`[${key}] names a reference, which the text no longer does: use the index of a 'references' item, as in [0]`)
  }
  for (const index of unknown) {
    problems.push(`[${index}] has no item: the 'references' list has ${count === 1 ? '1 item' : `${count} items`}`)
  }
  uses.forEach((n, index) => {
    if (n === 0) problems.push(`reference [${index}] is not used in the text`)
    else if (n > 1) problems.push(`reference [${index}] is used ${n} times: each item is used once`)
  })
  const inversion = order.findIndex((index, i) => i > 0 && index < order[i - 1])
  if (inversion > 0) {
    problems.push(
      `the 'references' list is not in the order the text uses it: [${order[inversion - 1]}] comes before ` +
        `[${order[inversion]}]. Renumber the items in the order they appear`,
    )
  }
}

/**
 * Read a parsed `references` list and check it against the file's text and the
 * display template collection of the file's locale, reporting every problem in it
 * at once. The dictionary keyed by name that the list replaced is rejected.
 */
export function readReferences(raw: unknown, scope: ReferenceScope): ReferencesReadResult {
  if (raw === undefined || raw === null) raw = []
  if (isMapping(raw)) {
    return {
      references: [],
      errors: [
        "'references' is a dictionary of named references, which is no longer supported. It is now a list: " +
          "each item has a 'target' (or 'targets') and a 'display' template name or literal 'text', " +
          'and the text cites the item by its zero-based index, [0], [1] and so on.',
      ],
    }
  }
  if (!Array.isArray(raw)) return { references: [], errors: ["'references' must be a list of items"] }
  const errors: string[] = []
  const references = raw.map((item, index) => readReferenceItem(item, index, scope, errors))
  checkTokens(raw.length, scope.texts, errors)
  return { references, errors }
}
