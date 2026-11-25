import { builtIn, BUILTINS, parseExpr, skipWs, tokenize, type TemplateExpr } from './expression'
import type { DisplayTemplateTargetType, LocaleCases } from './types'

type ContextShape = 'text' | 'label' | { readonly [field: string]: ContextShape }

const STANDALONE_SHAPE = { name: 'text', title: 'text', type: 'text' } as const
const NUMBERED_SHAPE = { index: 'text', name: 'text', title: 'text', type: 'text' } as const
const ENTITY_SHAPE = { index: 'text', name: 'text', title: 'text', type: 'text', label: 'label' } as const
const LABELLED_PARENT_SHAPE = { index: 'text', label: 'label' } as const

/**
 * The `target` fields a context gives each target type, so a template can be
 * checked before any reference uses it. Whoever builds contexts must build these
 * shapes: the website has a unit test that builds the context of every type and
 * compares it with this, so the two can't drift apart.
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

function describeCases(cases: LocaleCases): string {
  return Object.entries(cases).map(([locale, keys]) => `'${locale}' declares: ${keys.join(', ')}`).join('; ')
}

function exprKind(
  expr: TemplateExpr,
  type: DisplayTemplateTargetType,
  cases: LocaleCases,
  errors: Set<string>,
): ExprKind {
  if (expr.kind === 'string') return 'text'
  if (expr.kind === 'path') return pathKind(expr.segments, type, errors)

  const found = builtIn(expr.name)
  if (!found) {
    errors.add(`unknown built-in '${expr.name}'. Known: ${Object.keys(BUILTINS).join(', ')}`)
    return 'invalid'
  }
  if (expr.args.length !== found.params.length) {
    errors.add(`${expr.name}() takes ${found.params.length} argument(s), not ${expr.args.length}`)
    return 'invalid'
  }
  found.params.forEach((param, i) => {
    const arg = expr.args[i]
    if (param === 'case') {
      if (arg.kind !== 'string') {
        errors.add(`the case of ${expr.name}() must be a quoted case key`)
      } else if (!Object.values(cases).some((keys) => keys.includes(arg.value))) {
        errors.add(`case '${arg.value}' is not declared. ${describeCases(cases)}`)
      }
      return
    }
    const kind = exprKind(arg, type, cases, errors)
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
  /** The case keys each locale declares; a case key is valid when any locale declares it. */
  cases: LocaleCases
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
  { links, expressions = true, cases }: TemplateCheckOptions,
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
      const kind = exprKind(parsed.value, type, cases, found)
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
