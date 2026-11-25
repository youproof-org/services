import 'server-only'
import type { RefTarget, ContentGraph, StandaloneNode, DisplayTemplateTargetType } from './types'
import { getChapterIndexLabel, getSectionIndexLabel } from '../utils/index-helpers'
import { entityLabels, entityLabelCases } from '../i18n/entity-labels'
import { LOCALES } from '../i18n/config'

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface ContextObject extends Record<string, ContextValue> {}
export type ContextValue = string | ContextObject
export type TemplateContext = Record<string, ContextObject>

// ---------------------------------------------------------------------------
// Built-in function registry
// ---------------------------------------------------------------------------

export type BuiltInFn = (...args: ContextValue[]) => string

/**
 * Returns the Hungarian definite article ("a" or "az") for the given string.
 * Reads the leading integer and checks whether its Hungarian spoken form
 * starts with a vowel sound.
 * Examples: the("2.3.") → "a",  the("5.1.") → "az"
 */
function the(val: ContextValue): string {
  const str = typeof val === 'string' ? val : ''
  const match = str.match(/^(\d+)/)
  if (!match) return 'a'
  const n = parseInt(match[1], 10)
  // Hungarian numbers whose spoken form starts with a vowel (e/ö)
  // in the range that realistically appears as chapter/section indices:
  //   1 → "egy"    (e → vowel)
  //   5 → "öt"     (ö → vowel)
  //  50 → "ötven"  (ö → vowel)
  const vowelStarting = new Set([1, 5, 50])
  return vowelStarting.has(n) ? 'az' : 'a'
}

function capital(val: ContextValue): string {
  const str = typeof val === 'string' ? val : ''
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''
}

/**
 * A `base` or `suffix` call whose case the label doesn't have, or whose second
 * argument isn't a label. Every variant in a locale defines every case the locale
 * declares, so a missing case is one the target's locale doesn't declare. Falling
 * back to the bare word would render an uninflected word where the author wrote an
 * inflected one, so this fails the build instead.
 */
export class TemplateCaseError extends Error {
  constructor(readonly caseKey: string, message: string) {
    super(message)
    this.name = 'TemplateCaseError'
  }
}

function getCaseObj(inflCase: ContextValue, labels: ContextValue): ContextObject {
  const key = typeof inflCase === 'string' ? inflCase : ''
  const cases = typeof labels === 'object' ? labels.cases : undefined
  if (typeof cases !== 'object') {
    throw new TemplateCaseError(key, `case '${key}' is applied to something that is not a label`)
  }
  const caseVal = cases[key]
  if (typeof caseVal !== 'object') {
    throw new TemplateCaseError(key, `case '${key}' is not declared`)
  }
  return caseVal
}

// Note: parameter named 'inflCase' since 'case' is a reserved keyword in JS/TS
function base(inflCase: ContextValue, labels: ContextValue): string {
  const b = getCaseObj(inflCase, labels).base
  return typeof b === 'string' ? b : ''
}

function suffix(inflCase: ContextValue, labels: ContextValue): string {
  const s = getCaseObj(inflCase, labels).suffix
  return typeof s === 'string' ? s : ''
}

function inflect(inflCase: ContextValue, labels: ContextValue): string {
  return base(inflCase, labels) + suffix(inflCase, labels)
}

type ParamKind = 'text' | 'case' | 'label'

interface BuiltIn {
  fn: BuiltInFn
  params: readonly ParamKind[]
}

const BUILTINS: Record<string, BuiltIn> = {
  the:     { fn: the,     params: ['text'] },
  capital: { fn: capital, params: ['text'] },
  base:    { fn: base,    params: ['case', 'label'] },
  suffix:  { fn: suffix,  params: ['case', 'label'] },
  inflect: { fn: inflect, params: ['case', 'label'] },
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------
//
// Grammar:
//   template  ::= (literal | '{' expr '}')*
//   expr      ::= string | fn_call | path
//   string    ::= "'" [^']* "'"
//   fn_call   ::= identifier '(' arg_list ')'
//   arg_list  ::= expr (',' expr)*
//   path      ::= identifier ('.' identifier)*

export type TemplateExpr =
  | { kind: 'string'; value: string }
  | { kind: 'call'; name: string; args: TemplateExpr[] }
  | { kind: 'path'; segments: string[] }

type ParseResult<T> = { value: T; rest: string } | null

function skipWs(s: string): string {
  return s.replace(/^\s+/, '')
}

function parseIdentifier(s: string): ParseResult<string> {
  const m = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)(.*)$/s)
  if (!m) return null
  return { value: m[1], rest: m[2] }
}

function parsePath(s: string): ParseResult<string[]> {
  const first = parseIdentifier(s)
  if (!first) return null
  const parts = [first.value]
  let rest = first.rest
  while (rest.startsWith('.')) {
    const next = parseIdentifier(rest.slice(1))
    if (!next) break
    parts.push(next.value)
    rest = next.rest
  }
  return { value: parts, rest }
}

function parseExpr(s: string): ParseResult<TemplateExpr> {
  s = skipWs(s)

  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1)
    if (end !== -1) {
      return { value: { kind: 'string', value: s.slice(1, end) }, rest: s.slice(end + 1) }
    }
  }

  const id = parseIdentifier(s)
  if (id && skipWs(id.rest).startsWith('(')) {
    let rest = skipWs(id.rest).slice(1)
    const args: TemplateExpr[] = []

    rest = skipWs(rest)
    if (!rest.startsWith(')')) {
      const first = parseExpr(rest)
      if (!first) return null
      args.push(first.value)
      rest = skipWs(first.rest)

      while (rest.startsWith(',')) {
        rest = skipWs(rest.slice(1))
        const arg = parseExpr(rest)
        if (!arg) return null
        args.push(arg.value)
        rest = skipWs(arg.rest)
      }
    }

    if (!rest.startsWith(')')) return null
    return { value: { kind: 'call', name: id.value, args }, rest: rest.slice(1) }
  }

  const path = parsePath(s)
  if (path) return { value: { kind: 'path', segments: path.value }, rest: path.rest }

  return null
}

function evaluate(expr: TemplateExpr, ctx: TemplateContext): ContextValue {
  if (expr.kind === 'string') return expr.value
  if (expr.kind === 'path') return resolvePath(expr.segments, ctx)
  const builtIn = Object.prototype.hasOwnProperty.call(BUILTINS, expr.name) ? BUILTINS[expr.name] : undefined
  if (!builtIn) throw new Error(`[display-template] Unknown built-in: "${expr.name}"`)
  return builtIn.fn(...expr.args.map((arg) => evaluate(arg, ctx)))
}

function resolvePath(parts: string[], ctx: TemplateContext): ContextValue {
  let node: unknown = ctx
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return ''
    node = (node as Record<string, unknown>)[part]
  }
  if (typeof node === 'string') return node
  if (typeof node === 'object' && node !== null) return node as ContextObject
  return ''
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

// $...$ inline math — same token as InlineText's renderChunkWithMath (/\$([^$]+)\$/g).
// Braces inside math (e.g. \frac{m}{d}) must NOT be treated as template expressions.
const MATH_RE = /\$[^$]+\$/g

type TemplatePart =
  | { kind: 'text'; text: string }
  | { kind: 'math'; text: string }
  | { kind: 'expr'; source: string }

/** A `{` with no closing `}` stays in its text part, as the resolver prints it. */
function splitSegment(segment: string, out: TemplatePart[]): void {
  let i = 0
  while (i < segment.length) {
    const open = segment.indexOf('{', i)
    if (open === -1) { out.push({ kind: 'text', text: segment.slice(i) }); return }
    if (open > i) out.push({ kind: 'text', text: segment.slice(i, open) })

    const close = segment.indexOf('}', open + 1)
    if (close === -1) { out.push({ kind: 'text', text: segment.slice(open) }); return }

    out.push({ kind: 'expr', source: segment.slice(open + 1, close) })
    i = close + 1
  }
}

function tokenize(template: string): TemplatePart[] {
  const parts: TemplatePart[] = []
  let pos = 0
  let m: RegExpExecArray | null
  MATH_RE.lastIndex = 0
  while ((m = MATH_RE.exec(template)) !== null) {
    splitSegment(template.slice(pos, m.index), parts)
    parts.push({ kind: 'math', text: m[0] })
    pos = m.index + m[0].length
  }
  splitSegment(template.slice(pos), parts)
  return parts
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve all `{expr}` fields in `template` against `ctx`.
 * Returns the template unchanged if it contains no `{`.
 * `$...$` inline-math spans are passed through verbatim so LaTeX braces
 * (e.g. \frac{m}{d}) are never mistaken for template expressions.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  if (!template.includes('{')) return template

  return tokenize(template)
    .map((part) => {
      if (part.kind !== 'expr') return part.text
      const parsed = parseExpr(part.source)
      if (!parsed) return `{${part.source}}`
      const val = evaluate(parsed.value, ctx)
      return typeof val === 'string' ? val : ''
    })
    .join('')
}

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

// ---------------------------------------------------------------------------
// Template checks
// ---------------------------------------------------------------------------

type ContextShape = 'text' | 'label' | { readonly [field: string]: ContextShape }

const STANDALONE_SHAPE = { name: 'text', title: 'text', type: 'text' } as const
const NUMBERED_SHAPE = { index: 'text', name: 'text', title: 'text', type: 'text' } as const
const ENTITY_SHAPE = { index: 'text', name: 'text', title: 'text', type: 'text', label: 'label' } as const
const LABELLED_PARENT_SHAPE = { index: 'text', label: 'label' } as const

/**
 * The `target` fields `buildContext` gives each target type it supports, so a
 * template can be checked before any reference uses it. A unit test builds the
 * context of every type and compares it with this, so the two can't drift apart.
 */
export const TEMPLATE_CONTEXT_SHAPES = {
  book: STANDALONE_SHAPE,
  article: STANDALONE_SHAPE,
  newsletter: STANDALONE_SHAPE,
  page: STANDALONE_SHAPE,
  landing: STANDALONE_SHAPE,
  chapter: NUMBERED_SHAPE,
  section: NUMBERED_SHAPE,
  definition: ENTITY_SHAPE,
  theorem: ENTITY_SHAPE,
  proof: ENTITY_SHAPE,
  remark: ENTITY_SHAPE,
  claim: { index: 'text', name: 'text', type: 'text', parent: LABELLED_PARENT_SHAPE },
  term: { name: 'text', type: 'text', parent: LABELLED_PARENT_SHAPE },
} as const satisfies Record<DisplayTemplateTargetType, ContextShape>

export const TEMPLATE_TARGET_TYPES = Object.keys(TEMPLATE_CONTEXT_SHAPES) as DisplayTemplateTargetType[]

type ExprKind = 'text' | 'label' | 'object' | 'invalid'

function pathKind(segments: string[], type: DisplayTemplateTargetType, errors: Set<string>): ExprKind {
  let shape: ContextShape = { target: TEMPLATE_CONTEXT_SHAPES[type] }
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (shape === 'label' && segment === 'canonical' && i === segments.length - 1) return 'text'
    const next: ContextShape | undefined =
      typeof shape === 'object' && Object.prototype.hasOwnProperty.call(shape, segment) ? shape[segment] : undefined
    if (next === undefined) {
      errors.add(`a ${type} target has no '${segments.slice(0, i + 1).join('.')}'`)
      return 'invalid'
    }
    shape = next
  }
  return typeof shape === 'object' ? 'object' : shape
}

function describeCases(): string {
  return LOCALES.map((locale) => `'${locale}' declares: ${entityLabelCases(locale).join(', ')}`).join('; ')
}

function exprKind(expr: TemplateExpr, type: DisplayTemplateTargetType, errors: Set<string>): ExprKind {
  if (expr.kind === 'string') return 'text'
  if (expr.kind === 'path') return pathKind(expr.segments, type, errors)

  const builtIn = Object.prototype.hasOwnProperty.call(BUILTINS, expr.name) ? BUILTINS[expr.name] : undefined
  if (!builtIn) {
    errors.add(`unknown built-in '${expr.name}'. Known: ${Object.keys(BUILTINS).join(', ')}`)
    return 'invalid'
  }
  if (expr.args.length !== builtIn.params.length) {
    errors.add(`${expr.name}() takes ${builtIn.params.length} argument(s), not ${expr.args.length}`)
    return 'invalid'
  }
  builtIn.params.forEach((param, i) => {
    const arg = expr.args[i]
    if (param === 'case') {
      if (arg.kind !== 'string') {
        errors.add(`the case of ${expr.name}() must be a quoted case key`)
      } else if (!LOCALES.some((locale) => entityLabelCases(locale).includes(arg.value))) {
        errors.add(`case '${arg.value}' is not declared. ${describeCases()}`)
      }
      return
    }
    const kind = exprKind(arg, type, errors)
    if (kind === 'invalid' || kind === param) return
    errors.add(
      param === 'label'
        ? `${expr.name}() inflects a label, such as target.label`
        : `${expr.name}() takes text, not ${kind === 'label' ? 'a label' : 'an object'}`,
    )
  })
  return 'text'
}

export interface TemplateCheckOptions {
  /** `at-most-one` for a form that renders one target, `none` for text around or between items. */
  links: 'at-most-one' | 'none'
  /** False for text that has no target of its own, such as a list's separators. */
  expressions?: boolean
}

/**
 * The problems with `template` as a display for any of `targets`, without a
 * reference to resolve it against: expressions the parser can't read, built-ins
 * that don't exist or get the wrong arguments, fields the target types don't have,
 * case keys no locale declares, and link brackets. Empty when the template is valid.
 */
export function checkTemplate(
  template: string,
  targets: readonly DisplayTemplateTargetType[],
  { links, expressions = true }: TemplateCheckOptions,
): string[] {
  const errors = new Set<string>()
  let opens = 0
  let closes = 0
  for (const part of tokenize(template)) {
    if (part.kind === 'math') continue
    if (part.kind === 'text') {
      if (part.text.includes('{')) errors.add(`'{' is never closed`)
      for (const ch of part.text) {
        if (ch === '[') opens++
        else if (ch === ']' && ++closes > opens) errors.add(`']' comes before its '['`)
      }
      continue
    }
    const where = `{${part.source}}`
    if (!expressions) {
      errors.add(`${where}: there is no target here to read`)
      continue
    }
    const parsed = parseExpr(part.source)
    if (!parsed || skipWs(parsed.rest) !== '') {
      errors.add(`${where} is not an expression`)
      continue
    }
    for (const type of targets) {
      const found = new Set<string>()
      const kind = exprKind(parsed.value, type, found)
      if (kind === 'label' || kind === 'object') {
        found.add(kind === 'label' ? 'a label is not text: read its canonical word or inflect it' : 'it names an object, not text')
      }
      for (const error of found) errors.add(`${where}: ${error}`)
    }
  }
  if (opens !== closes) errors.add(`'[' and ']' don't pair up`)
  else if (links === 'none' && opens > 0) errors.add('it may not hold a link [...]')
  else if (opens > 1) errors.add('it may hold one link [...], not several')
  return [...errors]
}
