import 'server-only'
import type { RefTarget, ContentGraph, StandaloneNode } from './types'
import { getChapterIndex } from '../utils/index-helpers'

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

// ---------------------------------------------------------------------------
// Entity label fallbacks (lowercase — capitalize at render time when needed)
// ---------------------------------------------------------------------------

export const ENTITY_LABEL_HU: Record<string, string> = {
  definition: 'definíció',
  theorem:    'tétel',
  proof:      'bizonyítás',
  remark:     'megjegyzés',
}

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

// Looks up labels.cases[inflCase] as a ContextObject (the { base, suffix } object)
function getCaseObj(inflCase: ContextValue, labels: ContextValue): ContextObject | null {
  const key = typeof inflCase === 'string' ? inflCase : ''
  if (typeof labels !== 'object' || labels === null) return null
  const casesVal = (labels as ContextObject).cases
  if (typeof casesVal !== 'object' || casesVal === null) return null
  const caseVal = (casesVal as ContextObject)[key]
  if (typeof caseVal === 'object' && caseVal !== null) return caseVal as ContextObject
  return null
}

// Note: parameter named 'inflCase' since 'case' is a reserved keyword in JS/TS
function base(inflCase: ContextValue, labels: ContextValue): string {
  const caseObj = getCaseObj(inflCase, labels)
  if (caseObj) {
    const b = caseObj.base
    if (typeof b === 'string') return b
  }
  // Fall back to canonical
  if (typeof labels === 'object' && labels !== null) {
    const canonical = (labels as ContextObject).canonical
    return typeof canonical === 'string' ? canonical : ''
  }
  return ''
}

function suffix(inflCase: ContextValue, labels: ContextValue): string {
  const caseObj = getCaseObj(inflCase, labels)
  if (caseObj) {
    const s = caseObj.suffix
    if (typeof s === 'string') return s
  }
  return ''
}

function inflect(inflCase: ContextValue, labels: ContextValue): string {
  return base(inflCase, labels) + suffix(inflCase, labels)
}

const BUILTINS: Record<string, BuiltInFn> = {
  the,
  capital,
  base,
  suffix,
  inflect,
}

// ---------------------------------------------------------------------------
// Recursive-descent parser
// ---------------------------------------------------------------------------
//
// Grammar:
//   template  ::= (literal | '{' expr '}')*
//   expr      ::= fn_call | path
//   fn_call   ::= identifier '(' arg_list ')'
//   arg_list  ::= expr (',' expr)*
//   path      ::= identifier ('.' identifier)*
//
// A parsed expr is a thunk: (ctx: TemplateContext) => ContextValue

type Thunk = (ctx: TemplateContext) => ContextValue
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

function parseExpr(s: string): ParseResult<Thunk> {
  s = skipWs(s)

  // String literal: 'value'
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1)
    if (end !== -1) {
      const literal = s.slice(1, end)
      return { value: () => literal, rest: s.slice(end + 1) }
    }
  }

  // Peek: identifier followed by '(' → function call
  const id = parseIdentifier(s)
  if (id && skipWs(id.rest).startsWith('(')) {
    const fnName = id.value
    let rest = skipWs(id.rest).slice(1) // consume '('
    const args: Thunk[] = []

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
    rest = rest.slice(1) // consume ')'

    const fn = BUILTINS[fnName]
    if (!fn) throw new Error(`[display-template] Unknown built-in: "${fnName}"`)

    return { value: (ctx) => fn(...args.map(a => a(ctx))), rest }
  }

  // Path
  const path = parsePath(s)
  if (path) {
    const segments = path.value
    return { value: (ctx) => resolvePath(segments, ctx), rest: path.rest }
  }

  return null
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
// Public API
// ---------------------------------------------------------------------------

// $...$ inline math — same token as InlineText's renderChunkWithMath (/\$([^$]+)\$/g).
// Braces inside math (e.g. \frac{m}{d}) must NOT be treated as template expressions.
const MATH_RE = /\$[^$]+\$/g

/**
 * Resolve all `{expr}` placeholders in a single (math-free) segment against `ctx`.
 * Returns the segment unchanged if it contains no `{`.
 */
function resolveSegment(segment: string, ctx: TemplateContext): string {
  if (!segment.includes('{')) return segment

  const parts: string[] = []
  let i = 0

  while (i < segment.length) {
    const open = segment.indexOf('{', i)
    if (open === -1) { parts.push(segment.slice(i)); break }
    if (open > i) parts.push(segment.slice(i, open))

    const close = segment.indexOf('}', open + 1)
    if (close === -1) { parts.push(segment.slice(open)); break }

    const exprStr = segment.slice(open + 1, close)
    const parsed = parseExpr(exprStr)
    if (parsed) {
      const val = parsed.value(ctx)
      parts.push(typeof val === 'string' ? val : '')
    } else {
      parts.push(`{${exprStr}}`)
    }
    i = close + 1
  }

  return parts.join('')
}

/**
 * Resolve all `{expr}` fields in `template` against `ctx`.
 * Returns the template unchanged if it contains no `{`.
 * `$...$` inline-math spans are passed through verbatim so LaTeX braces
 * (e.g. \frac{m}{d}) are never mistaken for template expressions.
 */
export function resolveTemplate(template: string, ctx: TemplateContext): string {
  if (!template.includes('{')) return template

  const out: string[] = []
  let pos = 0
  let m: RegExpExecArray | null
  MATH_RE.lastIndex = 0
  while ((m = MATH_RE.exec(template)) !== null) {
    out.push(resolveSegment(template.slice(pos, m.index), ctx))
    out.push(m[0])                       // math span passes through untouched
    pos = m.index + m[0].length
  }
  out.push(resolveSegment(template.slice(pos), ctx))

  return out.join('')
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
    const book = graph.books.get(`/books/${target.name}`)
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
    const key = `/books/${target.book}/${target.part}/${target.name}`
    const chapter = graph.chapters.get(key)
    if (!chapter) return null
    const chapterIdx = getChapterIndex(chapter)
    return {
      target: {
        index: `${chapterIdx}.`,
        name: chapter.name,
        title: chapter.title,
        type: 'chapter',
      },
    }
  }

  if (target.type === 'claim') {
    const ns = target.parent.namespace.startsWith('/') ? target.parent.namespace.slice(1) : target.parent.namespace
    const parentKey = `/entities/${ns}/${target.parent.name}`
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
    const parentInfo = graph.embedding.get(`/entities${target.parent.namespace}/${target.parent.name}`)
    const parentFallbackLabel = ENTITY_LABEL_HU[parentEntity.type] ?? parentEntity.type
    return {
      target: {
        index: `${claimIdx}.`,
        name:  target.name,
        type:  'claim',
        parent: {
          index: parentInfo?.index ?? '',
          label: (parentEntity.labels ?? { canonical: parentFallbackLabel }) as unknown as ContextObject,
        },
      },
    }
  }

  if (target.type === 'term') {
    const ns = target.parent.namespace.startsWith('/') ? target.parent.namespace.slice(1) : target.parent.namespace
    const parentKey = `/entities/${ns}/${target.parent.name}`
    const parentEntity =
      graph.definitions.get(parentKey) ??
      graph.theorems.get(parentKey)   ??
      graph.proofs.get(parentKey)     ??
      graph.remarks.get(parentKey)
    if (!parentEntity) return null
    const parentInfo = graph.embedding.get(`/entities${target.parent.namespace}/${target.parent.name}`)
    const parentFallbackLabel = ENTITY_LABEL_HU[parentEntity.type] ?? parentEntity.type
    return {
      target: {
        type: 'term',
        name: target.name,
        parent: {
          index: parentInfo?.index ?? '',
          label: (parentEntity.labels ?? { canonical: parentFallbackLabel }) as unknown as ContextObject,
        },
      },
    }
  }

  if (target.type === 'section') {
    const key = `/books/${target.book}/${target.part}/${target.chapter}/${target.name}`
    const section = graph.sections.get(key)
    if (!section) return null
    const chapterIdx = getChapterIndex(section.chapter)
    const sectionIdx = section.chapter.sections.indexOf(section) + 1
    return {
      target: {
        index: `${chapterIdx}.${sectionIdx}.`,
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
    const ns = target.namespace.startsWith('/') ? target.namespace.slice(1) : target.namespace
    const entityKey = `/entities/${ns}/${target.name}`
    const entity =
      graph.definitions.get(entityKey) ?? graph.theorems.get(entityKey) ??
      graph.proofs.get(entityKey)     ?? graph.remarks.get(entityKey)
    if (!entity) return null
    const info = graph.embedding.get(`/entities${target.namespace}/${target.name}`)
    const fallbackLabel = ENTITY_LABEL_HU[target.type] ?? target.type
    return {
      target: {
        type:  target.type,
        name:  target.name,
        title: entity.title ?? '',
        label: (entity.labels ?? { canonical: fallbackLabel }) as unknown as ContextObject,
        index: info?.index ?? '',
      },
    }
  }

  return null
}
