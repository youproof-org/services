import yaml from 'js-yaml'
import {
  entityLabelCases,
  isExternalTarget,
  isPathTarget,
  KB_ENTITY_TYPES,
  localeCodes,
  parseRefTarget,
  refTargetKey,
  type EntityLabelRegistry,
} from '@youproof.org/content-model'
import {
  fileReferenceTexts,
  readDisplayTemplateCollection,
  readReferences,
  referenceTokens,
  type CollectionReadResult,
  type DisplayTemplateCollection,
  type LocaleCases,
  type ReferenceFileKind,
  type ReferenceItem,
  type ReferenceProblem,
} from '@youproof.org/display-templates'
import localesData from '../../../apps/website/lib/i18n/locales.json'

export { isExternalTarget, isPathTarget, parseRefTarget, refTargetKey, referenceTokens }
export type { DisplayTemplateCollection, ReferenceFileKind, ReferenceItem, ReferenceProblem }

/** The configured locales, from the website's `lib/i18n/locales.json`. The build reads a display template collection for each. */
export const LOCALES: readonly string[] = localeCodes(localesData)

/**
 * The locale of a file without a `locale` field: the first configured locale, which
 * is the website's default when the build's `DEFAULT_LOCALE` variable is unset.
 */
export const DEFAULT_LOCALE: string = LOCALES[0]

export interface YamlProblem {
  /** 1-based. */
  line: number
  message: string
}

/** A content file parsed as the website parses it, with js-yaml's default schema, or the reason it can't be. */
export function parseYaml(source: string): { doc: unknown } | { error: YamlProblem } {
  try {
    return { doc: yaml.load(source) }
  } catch (err) {
    if (err instanceof yaml.YAMLException) {
      return { error: { line: (err.mark?.line ?? 0) + 1, message: `the file is not valid YAML: ${err.reason}` } }
    }
    throw err
  }
}

/** The case keys each configured locale declares in the parsed entity label registry, as the build reads them. Throws for a locale the registry lacks. */
export function localeCases(registry: EntityLabelRegistry): LocaleCases {
  return Object.fromEntries(LOCALES.map((locale) => [locale, entityLabelCases(registry, locale)]))
}

/** Read and check one locale's display template collection from its parsed YAML. */
export function readCollection(raw: unknown, cases: LocaleCases): CollectionReadResult {
  return readDisplayTemplateCollection(raw, { cases })
}

const STANDALONE_TYPES = ['article', 'newsletter', 'page', 'landing']

/** Which reference fields a content file of `type` has, or undefined for a file without references. */
export function referenceFileKind(type: unknown): ReferenceFileKind | undefined {
  if (typeof type !== 'string') return undefined
  if ((KB_ENTITY_TYPES as readonly string[]).includes(type)) return 'entity'
  if (type === 'section' || type === 'chapter') return type
  if (STANDALONE_TYPES.includes(type)) return 'standalone'
  return undefined
}

function isMapping(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

/** The file's locale, as the website reads it. */
export function fileLocale(doc: unknown): string {
  const locale = isMapping(doc) ? doc.locale : undefined
  return typeof locale === 'string' && locale.trim() !== '' ? locale.trim() : DEFAULT_LOCALE
}

export interface FileReferences {
  kind: ReferenceFileKind
  locale: string
  /** The text fields that can hold `[i]` tokens, in the order the site renders them. */
  texts: string[]
  references: (ReferenceItem | undefined)[]
  errors: string[]
  problems: ReferenceProblem[]
}

/**
 * Read and check a parsed content file's `references` list against its text and
 * the collections, as the build does. Null for a file that has no references.
 */
export function readFileReferences(
  doc: unknown,
  templates: Readonly<Record<string, DisplayTemplateCollection>>,
): FileReferences | null {
  if (!isMapping(doc)) return null
  const kind = referenceFileKind(doc.type)
  if (kind === undefined) return null
  const locale = fileLocale(doc)
  const texts = fileReferenceTexts(doc, kind)
  return { kind, locale, texts, ...readReferences(doc.references, { locale, templates, texts }) }
}

export interface TokenPosition {
  /** Offset of the token in the YAML source. */
  offset: number
  /** The token as written, such as `[12]`. */
  source: string
  index: number
}

const PLACEHOLDER_BASE = 9_000_000

/**
 * Where in the YAML `source` each `[i]` token the site reads sits, in reading order,
 * so entry k is the token a `ReferenceProblem`'s `token: k` is about. Every `[digits]`
 * in the source is swapped for a numbered placeholder of the same shape before
 * parsing, and the placeholders that come out of the file's text fields as reference
 * tokens are the real ones. The rest sit in math, in fields the site doesn't read,
 * or in comments. Empty for a file that has no references or doesn't parse.
 */
export function referenceTokenPositions(source: string): TokenPosition[] {
  const found: TokenPosition[] = []
  const placed = source.replace(/\[(\d+)\]/g, (whole: string, index: string, offset: number) => {
    found.push({ offset, source: whole, index: Number(index) })
    return `[${PLACEHOLDER_BASE + found.length - 1}]`
  })
  const parsed = parseYaml(placed)
  if (!('doc' in parsed) || !isMapping(parsed.doc)) return []
  const kind = referenceFileKind(parsed.doc.type)
  if (kind === undefined) return []
  const positions: TokenPosition[] = []
  for (const text of fileReferenceTexts(parsed.doc, kind)) {
    for (const token of referenceTokens(text)) {
      if (token.kind === 'ref' && token.index >= PLACEHOLDER_BASE) positions.push(found[token.index - PLACEHOLDER_BASE])
    }
  }
  return positions
}
