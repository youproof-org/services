import type { ContextObject, ContextValue, TemplateContext } from './types'

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
  readonly caseKey: string

  constructor(caseKey: string, message: string) {
    super(message)
    this.name = 'TemplateCaseError'
    this.caseKey = caseKey
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

export type ParamKind = 'text' | 'case' | 'label'

export interface BuiltIn {
  fn: BuiltInFn
  params: readonly ParamKind[]
}

export const BUILTINS: Readonly<Record<string, BuiltIn>> = {
  the:     { fn: the,     params: ['text'] },
  capital: { fn: capital, params: ['text'] },
  base:    { fn: base,    params: ['case', 'label'] },
  suffix:  { fn: suffix,  params: ['case', 'label'] },
  inflect: { fn: inflect, params: ['case', 'label'] },
}

export function builtIn(name: string): BuiltIn | undefined {
  return Object.prototype.hasOwnProperty.call(BUILTINS, name) ? BUILTINS[name] : undefined
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

export function skipWs(s: string): string {
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

export function parseExpr(s: string): ParseResult<TemplateExpr> {
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
  const found = builtIn(expr.name)
  if (!found) throw new Error(`[display-template] Unknown built-in: "${expr.name}"`)
  return found.fn(...expr.args.map((arg) => evaluate(arg, ctx)))
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

// $...$ inline math — the same token as the website's InlineText (/\$([^$]+)\$/g).
// Braces inside math (e.g. \frac{m}{d}) must NOT be treated as template expressions.
const MATH_RE = /\$[^$]+\$/g

export type TemplatePart =
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

export function tokenize(template: string): TemplatePart[] {
  const parts: TemplatePart[] = []
  let pos = 0
  let m: RegExpExecArray | null
  const mathRe = new RegExp(MATH_RE.source, 'g')
  while ((m = mathRe.exec(template)) !== null) {
    splitSegment(template.slice(pos, m.index), parts)
    parts.push({ kind: 'math', text: m[0] })
    pos = m.index + m[0].length
  }
  splitSegment(template.slice(pos), parts)
  return parts
}

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
