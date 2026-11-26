import 'server-only'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { DEFAULT_LOCALE, LOCALES } from '@/lib/i18n/config'
import { entityLabelCases, entityLabelVariants, KB_ENTITY_TYPES, KEBAB_CASE } from '@/lib/i18n/entity-labels'
import {
  checkLinkText,
  checkTemplate,
  targetCountError,
  TEMPLATE_TARGET_TYPES,
  type TemplateCheckOptions,
} from '@youproof.org/display-templates'
import type {
  RefTarget,
  ContentBlock,
  RefEntry,
  RefList,
  TermMap,
  ThumbnailImage,
  MetaInfo,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  BookNode,
  PartNode,
  ChapterNode,
  SectionNode,
  DisplayTemplate,
  DisplayTemplateCollection,
  DisplayTemplateCollections,
  DisplayTemplateGroupBy,
  DisplayTemplateItemForms,
  DisplayTemplateList,
  DisplayTemplateSeparators,
  DisplayTemplateTargetType,
} from './types'
import { parseRefTarget } from '@youproof.org/content-model'
import { referenceTokens } from './inline-tokens'

// ---------------------------------------------------------------------------
// Content directory
// ---------------------------------------------------------------------------

export function getContentDir(): string {
  const dir = process.env.CONTENT_DIR
  if (!dir) throw new Error('CONTENT_DIR environment variable is not set')
  return path.resolve(process.cwd(), dir)
}

// ---------------------------------------------------------------------------
// Namespace resolution from namespace.yaml name fields
// ---------------------------------------------------------------------------

/**
 * Reads the `name` fields from all namespace.yaml files between
 * `knowledgeBaseDir` and `entityDir` (exclusive), builds a namespace path.
 * Example: .../knowledge-base/absztrakt-algebra/csoportelmelet/definitions/
 *          → "/absztrakt-algebra/csopotelmelet"
 */
export function resolveNamespace(knowledgeBaseDir: string, entityDir: string): string {
  const relPath = path.relative(knowledgeBaseDir, entityDir)
  // entityDir is like "absztrakt-algebra/csoportelmelet/definitions"
  // We want namespace segments from the dirs that have namespace.yaml,
  // i.e. all segments except the last one (the entity-type dir: definitions/theorems/...)
  const segments = relPath.split(path.sep)
  // Drop the last segment (entity-type folder)
  const namespaceDirs = segments.slice(0, -1)

  const parts: string[] = []
  let current = knowledgeBaseDir
  for (const seg of namespaceDirs) {
    current = path.join(current, seg)
    const nsFile = path.join(current, 'namespace.yaml')
    if (fs.existsSync(nsFile)) {
      const raw = yaml.load(fs.readFileSync(nsFile, 'utf-8')) as Record<string, unknown>
      if (typeof raw?.name === 'string') {
        parts.push(raw.name)
      }
    }
  }
  return '/' + parts.join('/')
}

// ---------------------------------------------------------------------------
// Raw YAML loading helpers
// ---------------------------------------------------------------------------

function readYaml(filePath: string): Record<string, unknown> {
  const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid YAML at ${filePath}`)
  }
  return raw as Record<string, unknown>
}

function kebabToCamel(key: string): string {
  return key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

function normalizeBlock(raw: Record<string, unknown>): ContentBlock {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(raw)) {
    out[kebabToCamel(key)] = value
  }
  if (out.type === 'subsection' && Array.isArray(out.blocks)) {
    out.blocks = toBlocks(out.blocks)
  }
  if (out.type === 'details' && Array.isArray(out.blocks)) {
    out.blocks = toBlocks(out.blocks)
  }
  // `embed` carries a target in the same form as a reference, always pointing at a
  // knowledge-base entity.
  if (out.type === 'embed') {
    const target = toRefTarget(out.target, `${out.type} block target`)
    if (target.type === 'external') {
      formatError(`${out.type} block target must be a knowledge-base entity, not a URL.`)
    }
    out.target = { type: target.type, name: target.name, fqn: target.fqn }
  }
  return out as unknown as ContentBlock
}

function toBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map(normalizeBlock)
}

export class ContentFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentFormatError'
  }
}

/**
 * A malformed reference target is a FORMAT violation, not a missing file.
 *
 * The distinction matters: the per-entity loader downgrades a plain Error to a
 * warning and drops that entity, which for a bad target would mean a build that
 * passes with a node silently absent. ContentFormatError is rethrown as fatal, so
 * an unparseable or illegal target stops the build.
 */
function formatError(message: string): never {
  throw new ContentFormatError(message)
}

/**
 * Exported for tests, which build a raw graph directly and so would otherwise have
 * to hand-write parsed targets — and would then be asserting against their own
 * idea of the shape rather than the parser's.
 */
export function toRefTarget(raw: unknown, where: string): RefTarget {
  try {
    return parseRefTarget(raw, where)
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err))
  }
}

// ---------------------------------------------------------------------------
// References list
// ---------------------------------------------------------------------------

/** What the checks of a file's `references` need to know about the file. */
interface ReferenceScope {
  locale: string
  templates: DisplayTemplateCollections
  /** The text fields that can hold `[i]` tokens, in the order the site renders them. */
  texts: string[]
}

const REFERENCE_KEYS = ['display', 'text', 'target', 'targets']

/**
 * The text fields of `blocks` that InlineText renders with the references, in the
 * order the site renders them. A block's `context` doesn't matter: a `latex` block
 * is not on the web page, but its tokens are part of the file all the same.
 */
export function referenceTexts(blocks: readonly ContentBlock[] | undefined): string[] {
  const texts: string[] = []
  const add = (...fields: (string | undefined)[]) => {
    for (const field of fields) if (typeof field === 'string') texts.push(field)
  }
  for (const block of blocks ?? []) {
    switch (block.type) {
      case 'narrative':
      case 'claim':
        add(block.content)
        break
      case 'formula':
        add(block.leadIn, block.leadOut)
        break
      case 'figure':
        add(block.leadIn, block.caption)
        break
      case 'unordered-list':
      case 'ordered-list':
        add(block.leadIn, ...(Array.isArray(block.items) ? block.items : []))
        break
      case 'typewriter':
        add(block.leadIn)
        break
      case 'quote':
        add(block.leadIn, block.quote)
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

function targetKey(target: RefTarget): string {
  return target.type === 'external' ? target.url : target.fqn
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
      target = toRefTarget(value, where)
    } catch (err) {
      if (!(err instanceof ContentFormatError)) throw err
      problems.push(err.message)
      continue
    }
    const key = targetKey(target)
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
          `not ${target.type === 'external' ? 'a URL' : `a ${target.type}`} ('${targetKey(target)}')`,
      )
    }
  }
  const countError = targetCountError(template, targets.length)
  if (countError && targets.length > 0) problems.push(`${where}: template '${display}' ${countError}`)
}

function readReferenceItem(raw: unknown, index: number, scope: ReferenceScope, problems: string[]): RefEntry | undefined {
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
    return { display: raw.display, targets, segments: [] }
  }
  if (typeof raw.text !== 'string' || raw.text === '') {
    problems.push(`${where}: 'text' must be non-empty link text`)
    return undefined
  }
  for (const error of checkLinkText(raw.text)) problems.push(`${where}: text: ${error}`)
  if (targets.length > 1) {
    problems.push(`${where}: a 'text' item has one target. Several targets need a list template in 'display'`)
  }
  return { text: raw.text, targets, segments: [] }
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
 * Parse a `references` list and check it against the file's text and the display
 * template collection of the file's locale, reporting every problem in it at once.
 * The dictionary keyed by name that the list replaced is rejected.
 */
function readReferences(raw: unknown, scope: ReferenceScope): RefList {
  if (raw === undefined || raw === null) raw = []
  if (isMapping(raw)) {
    formatError(
      "'references' is a dictionary of named references, which is no longer supported. It is now a list: " +
        "each item has a 'target' (or 'targets') and a 'display' template name or literal 'text', " +
        'and the text cites the item by its zero-based index, [0], [1] and so on.',
    )
  }
  if (!Array.isArray(raw)) formatError("'references' must be a list of items")
  const problems: string[] = []
  const entries = raw.map((item, index) => readReferenceItem(item, index, scope, problems))
  checkTokens(raw.length, scope.texts, problems)
  if (problems.length > 0) formatError(problems.join('\n  '))
  return entries as RefEntry[]
}

/**
 * Attach the file to anything thrown while loading it.
 *
 * A bad reference target is authored in a YAML file, and the file is what the
 * author needs to open — but the parse happens several helpers deep, inside block
 * normalization that recurses through subsections. Wrapping the load is one edit
 * per loader instead of a `where` parameter threaded through all 24 call sites, and
 * it covers everything nested inside for free.
 */
function inFile<T>(filePath: string, load: () => T): T {
  try {
    return load()
  } catch (err) {
    const rel = path.relative(process.cwd(), filePath)
    const message = err instanceof Error ? err.message : String(err)
    // Preserve the class: a ContentFormatError is fatal to the build, a plain one
    // is downgraded to a warning by the caller, and re-wrapping would flip that.
    if (err instanceof ContentFormatError) throw new ContentFormatError(`${rel} — ${message}`)
    throw new Error(`${rel} — ${message}`, { cause: err })
  }
}

function toTermMap(raw: unknown): TermMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  return raw as TermMap
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x) => typeof x === 'string') as string[]
}

// Localization fields. `locale` defaults to the default locale if a file predates
// the migration; `slug` falls back to a lowercased `name` (its pre-split value).
function readLocale(raw: Record<string, unknown>): string {
  return typeof raw.locale === 'string' && raw.locale.trim() !== '' ? raw.locale.trim() : DEFAULT_LOCALE
}

function readLabel(raw: Record<string, unknown>, type: string, locale: string): string | undefined {
  if ('labels' in raw) {
    formatError(`'labels' is no longer supported. Name a variant with 'label', or omit it for the ${type} default.`)
  }
  if (raw.label === undefined) return undefined
  const variants = entityLabelVariants(locale, type)
  if (typeof raw.label !== 'string' || !variants.includes(raw.label)) {
    formatError(`label '${String(raw.label)}' is not a ${type} label in '${locale}'. Known: ${variants.join(', ')}`)
  }
  return raw.label
}

function readSlug(raw: Record<string, unknown>, name: string): string {
  return typeof raw.slug === 'string' && raw.slug.trim() !== '' ? raw.slug.trim() : name.toLowerCase()
}

// ---------------------------------------------------------------------------
// Resolve figure src paths in content blocks
// ---------------------------------------------------------------------------

// Intrinsic figure dimensions ({ "/content/.../foo.svg": [width, height] }),
// produced by the prebuild `sync-figures.mjs` step. Loaded once, lazily. Missing
// (e.g. figures weren't synced) → no dimensions, same as before. Mirrors the
// sitemap's lastmod-map pattern (app/sitemap.ts).
let figureDimsCache: Record<string, [number, number]> | undefined
function figureDims(): Record<string, [number, number]> {
  if (figureDimsCache === undefined) {
    try {
      figureDimsCache = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), '.generated', 'figure-dimensions.json'), 'utf8')
      ) as Record<string, [number, number]>
    } catch {
      figureDimsCache = {}
    }
  }
  return figureDimsCache ?? {}
}

export function resolveFigurePaths(
  blocks: ContentBlock[],
  figureUrlPrefix: string,
  figuresDir?: string
): ContentBlock[] {
  return blocks.map((block) => {
    if (block.type === 'figure' && block.src && !block.src.startsWith('/')) {
      let src = block.src
      if (path.extname(src) === '' && figuresDir && fs.existsSync(figuresDir)) {
        const match = fs.readdirSync(figuresDir).find(
          (entry) => path.basename(entry, path.extname(entry)) === src
        )
        if (match) src = match
      }
      const resolvedSrc = `${figureUrlPrefix}/${src}`
      const dims = figureDims()[resolvedSrc]
      return dims
        ? { ...block, src: resolvedSrc, width: dims[0], height: dims[1] }
        : { ...block, src: resolvedSrc }
    }
    if (block.type === 'subsection') {
      return { ...block, blocks: resolveFigurePaths(block.blocks, figureUrlPrefix, figuresDir) }
    }
    if (block.type === 'details') {
      return { ...block, blocks: resolveFigurePaths(block.blocks, figureUrlPrefix, figuresDir) }
    }
    return block
  })
}

function resolveBlocksFigures(blocks: ContentBlock[], prefix: string, figuresDir?: string): ContentBlock[] {
  return resolveFigurePaths(blocks, prefix, figuresDir)
}

// ---------------------------------------------------------------------------
// Entity stub loaders (Pass 1)
// Return partial nodes; backward associations wired in graph.ts Pass 2
// ---------------------------------------------------------------------------

export interface RawDefinition {
  node: Omit<DefinitionNode, 'remarks'>
  rawRemarks: string[]
}

export interface RawTheorem {
  node: Omit<TheoremNode, 'proofs' | 'remarks'>
  rawProofs: string[]
  rawRemarks: string[]
}

export interface RawProof {
  node: Omit<ProofNode, 'proves' | 'remarks'>
  rawRemarks: string[]
}

export interface RawRemark {
  node: Omit<RemarkNode, 'attachedTo'>
}

/** A knowledge-base entity's body, and the references its body cites. */
function bodyWithReferences(raw: Record<string, unknown>, templates: DisplayTemplateCollections): { body: ContentBlock[]; references: RefList } {
  const body = toBlocks(raw.body)
  return { body, references: readReferences(raw.references, { locale: readLocale(raw), templates, texts: referenceTexts(body) }) }
}

export function loadDefinition(filePath: string, namespace: string, templates: DisplayTemplateCollections): RawDefinition {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'definition',
        name: raw.name as string,
        // `slug` falls back to a lowercased `name` (readSlug), so a knowledge-base
        // file authored before the slug backfill still loads and still gets a URL.
        slug: readSlug(raw, raw.name as string),
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        label: readLabel(raw, 'definition', readLocale(raw)),
        terms: toTermMap(raw.terms),
        ...bodyWithReferences(raw, templates),
      },
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadTheorem(filePath: string, namespace: string, templates: DisplayTemplateCollections): RawTheorem {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'theorem',
        name: raw.name as string,
        // `slug` falls back to a lowercased `name` (readSlug), so a knowledge-base
        // file authored before the slug backfill still loads and still gets a URL.
        slug: readSlug(raw, raw.name as string),
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        label: readLabel(raw, 'theorem', readLocale(raw)),
        terms: toTermMap(raw.terms),
        ...bodyWithReferences(raw, templates),
      },
      rawProofs: toStringArray(raw.proofs),
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadProof(filePath: string, namespace: string, templates: DisplayTemplateCollections): RawProof {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'proof',
        name: raw.name as string,
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        label: readLabel(raw, 'proof', readLocale(raw)),
        terms: toTermMap(raw.terms),
        ...bodyWithReferences(raw, templates),
      },
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadRemark(filePath: string, namespace: string, templates: DisplayTemplateCollections): RawRemark {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'remark',
        name: raw.name as string,
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        label: readLabel(raw, 'remark', readLocale(raw)),
        terms: toTermMap(raw.terms),
        ...bodyWithReferences(raw, templates),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Book content loaders (Pass 3)
// ---------------------------------------------------------------------------

export function loadSection(
  filePath: string,
  templates: DisplayTemplateCollections,
  figureUrlPrefix: string,
  figuresDir?: string
): { name: string; slug: string; locale: string; title: string; body: ContentBlock[]; references: RefList } {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    const locale = readLocale(raw)
    const body = resolveBlocksFigures(toBlocks(raw.body), figureUrlPrefix, figuresDir)
    return {
      name,
      slug: readSlug(raw, name),
      locale,
      title: raw.title as string,
      body,
      references: readReferences(raw.references, { locale, templates, texts: referenceTexts(body) }),
    }
  })
}

// `published-at` in the model: the canonical string `'YYYY-MM-DD HH:MM:SS'`,
// always interpreted as **UTC**. Every content YAML MUST store it as a QUOTED
// string in exactly this form. The loader is STRICT with no fallback: a present
// value that isn't a canonical string throws — in particular an UNQUOTED
// timestamp, which js-yaml parses into a `Date`, is rejected (not silently
// accepted), forcing the file to be fixed. A missing value ⇒ unpublished (not an
// error). Treat the string as UTC anywhere it becomes a Date — never
// `new Date(publishedAt)`, since a timezone-less string is parsed as LOCAL time.
// A content file that violates a required format. Thrown by the strict field
// validators; the graph builder re-throws it past its per-item resilience
// try/catch (which otherwise skips a broken file), so a format violation is a
// hard, fatal build error rather than a silently-skipped item.
const PUBLISHED_AT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function toPublishedAt(raw: unknown, filePath: string): string | undefined {
  if (raw === undefined || raw === null) return undefined // legitimately unpublished
  if (typeof raw !== 'string' || !PUBLISHED_AT_RE.test(raw.trim())) {
    throw new ContentFormatError(
      `${filePath}: 'published-at' must be a quoted 'YYYY-MM-DD HH:MM:SS' (UTC) string; ` +
        `got ${JSON.stringify(raw)}. Quote the value in the YAML.`,
    )
  }
  return raw.trim()
}

function toThumbnail(raw: unknown): ThumbnailImage | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const t = raw as Record<string, unknown>
  return { src: t.src as string, alt: t.alt as string }
}

// Optional `meta:` block → MetaInfo. `open-graph` (kebab) nests into `openGraph`.
// Every field is optional; returns undefined when absent so the fallback chain
// (buildPageMeta) applies. A string helper keeps empty/non-string values out.
function toMeta(raw: unknown): MetaInfo | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as Record<string, unknown>
  const s = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
  const og = (m['open-graph'] && typeof m['open-graph'] === 'object')
    ? (m['open-graph'] as Record<string, unknown>)
    : undefined
  const openGraph = og
    ? { title: s(og.title), description: s(og.description) }
    : undefined
  const meta: MetaInfo = {
    title: s(m.title),
    description: s(m.description),
    ...(openGraph && (openGraph.title || openGraph.description) ? { openGraph } : {}),
  }
  // Drop the block entirely if nothing usable was set.
  return meta.title || meta.description || meta.openGraph ? meta : undefined
}

export interface RawChapter {
  name: string
  slug: string
  locale: string
  title: string
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  sectionNames: string[]
  abstract: ContentBlock[]
  prerequisiteWarning?: ContentBlock[]
  prologue: ContentBlock[]
  epilogue: ContentBlock[]
  references: RefList
  thumbnail?: ThumbnailImage
  meta?: MetaInfo
}

export function loadChapter(filePath: string, templates: DisplayTemplateCollections): RawChapter {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    const locale = readLocale(raw)
    const abstract = toBlocks(raw.abstract)
    const prerequisiteWarning = raw['prerequisite-warning'] ? toBlocks(raw['prerequisite-warning']) : undefined
    const prologue = toBlocks(raw.prologue)
    const epilogue = toBlocks(raw.epilogue)
    // The order ChapterPage renders them in; the sections are files of their own.
    const texts = [abstract, prerequisiteWarning, prologue, epilogue].flatMap(referenceTexts)
    return {
      name,
      slug: readSlug(raw, name),
      locale,
      title: raw.title as string,
      publishedAt: toPublishedAt(raw['published-at'], filePath),
      legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
      excerpt: typeof raw.excerpt === 'string' ? (raw.excerpt as string) : undefined,
      sectionNames: toStringArray(raw.sections),
      abstract,
      prerequisiteWarning,
      prologue,
      epilogue,
      references: readReferences(raw.references, { locale, templates, texts }),
      thumbnail: toThumbnail(raw.thumbnail),
      meta: toMeta(raw.meta),
    }
  })
}

export interface RawPart {
  name: string
  slug: string
  locale: string
  title: string
  chapterNames: string[]
}

export function loadPart(filePath: string): RawPart {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      name: raw.name as string,
      slug: readSlug(raw, raw.name as string),
      locale: readLocale(raw),
      title: raw.title as string,
      chapterNames: toStringArray(raw.chapters),
    }
  })
}

export interface RawBook {
  name: string
  slug: string
  locale: string
  title: string
  partNames: string[]
  thumbnail?: ThumbnailImage
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  abstract: ContentBlock[]
  teaser?: { items: string[] }
  bibliography?: { items: string[] }
  meta?: MetaInfo
}

export function loadEpisodes(filePath: string): string[] {
  const raw = readYaml(filePath)
  return toStringArray(raw as unknown as unknown[])
}

// A `{ items: [...] }` object field, tolerant of a bare list for convenience.
function toItemList(raw: unknown): { items: string[] } | undefined {
  if (Array.isArray(raw)) return { items: toStringArray(raw) }
  if (raw && typeof raw === 'object') {
    const items = toStringArray((raw as Record<string, unknown>).items)
    if (items.length > 0) return { items }
  }
  return undefined
}

export function loadBook(filePath: string): RawBook {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    return {
      name,
      slug: readSlug(raw, name),
      locale: readLocale(raw),
      title: raw.title as string,
      partNames: toStringArray(raw.parts),
      thumbnail: toThumbnail(raw.thumbnail),
      publishedAt: toPublishedAt(raw['published-at'], filePath),
      legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
      excerpt: typeof raw.excerpt === 'string' ? (raw.excerpt as string) : undefined,
      abstract: toBlocks(raw.abstract),
      teaser: toItemList(raw.teaser),
      bibliography: toItemList(raw.bibliography),
      meta: toMeta(raw.meta),
    }
  })
}

// ---------------------------------------------------------------------------
// Standalone content loader (article, newsletter, page, landing)
// ---------------------------------------------------------------------------

export interface RawStandalone {
  name: string
  slug: string
  locale: string
  title: string
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  sectionNames: string[]
  abstract: ContentBlock[]
  prologue: ContentBlock[]
  epilogue: ContentBlock[]
  thumbnail?: ThumbnailImage
  meta?: MetaInfo
  references: RefList
}

// Structure mirrors a chapter (minus book relationship / prerequisite-warning),
// `references` included — which target types a standalone item may actually point
// at is enforced later, by validateReferences in graph.ts.
export function loadStandalone(filePath: string, templates: DisplayTemplateCollections): RawStandalone {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    const locale = readLocale(raw)
    const abstract = toBlocks(raw.abstract)
    const prologue = toBlocks(raw.prologue)
    const epilogue = toBlocks(raw.epilogue)
    // The order StandalonePage renders them in; the sections are files of their own.
    const texts = [abstract, prologue, epilogue].flatMap(referenceTexts)
    return {
      name,
      slug: readSlug(raw, name),
      locale,
      title: raw.title as string,
      publishedAt: toPublishedAt(raw['published-at'], filePath),
      legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
      excerpt: typeof raw.excerpt === 'string' ? (raw.excerpt as string) : undefined,
      sectionNames: toStringArray(raw.sections),
      abstract,
      prologue,
      epilogue,
      thumbnail: toThumbnail(raw.thumbnail),
      meta: toMeta(raw.meta),
      references: readReferences(raw.references, { locale, templates, texts }),
    }
  })
}

// ---------------------------------------------------------------------------
// Display template collection
// ---------------------------------------------------------------------------

export function displayTemplatesPath(contentDir: string, locale: string): string {
  return path.join(contentDir, 'display-templates', `display-templates.${locale}.yaml`)
}

/** Every configured locale's collection. A locale without a file has no templates. */
export function loadDisplayTemplateCollections(contentDir: string): Record<string, DisplayTemplateCollection> {
  const collections: Record<string, DisplayTemplateCollection> = {}
  for (const locale of LOCALES) {
    const file = displayTemplatesPath(contentDir, locale)
    collections[locale] = fs.existsSync(file) ? loadDisplayTemplates(file) : {}
  }
  return collections
}

/** Reads one locale's collection and reports every invalid template in it at once. */
export function loadDisplayTemplates(filePath: string): DisplayTemplateCollection {
  return inFile(filePath, () => {
    const raw = yaml.load(fs.readFileSync(filePath, 'utf-8'))
    if (raw === undefined || raw === null) return {}
    if (!isMapping(raw)) formatError('the file must map template names to templates.')
    const collection: DisplayTemplateCollection = {}
    const errors: string[] = []
    for (const [name, entry] of Object.entries(raw)) {
      const problems: string[] = []
      const template = readDisplayTemplate(name, entry, problems)
      if (problems.length > 0) errors.push(...problems.map((problem) => `template '${name}': ${problem}`))
      else if (template) collection[name] = template
    }
    if (errors.length > 0) formatError(errors.join('\n  '))
    return collection
  })
}

const TEMPLATE_KEYS = ['targets', 'template', 'list']
const LIST_KEYS = ['count', 'group-by', 'order', 'item', 'group', 'before', 'after']
const ITEM_KEYS = ['first', 'middle', 'last', 'only', 'separator', 'last-separator']
const SEPARATOR_KEYS = ['separator', 'last-separator']
const COUNT_KEYS = ['min', 'max']
const GROUP_BY: readonly DisplayTemplateGroupBy[] = ['label', 'parent', 'type']

const LOCALE_CASES = Object.fromEntries(LOCALES.map((locale) => [locale, entityLabelCases(locale)]))
const ITEM_FORM: TemplateCheckOptions = { links: 'at-most-one', cases: LOCALE_CASES }
const LIST_TEXT: TemplateCheckOptions = { links: 'none', expressions: false, cases: LOCALE_CASES }

function isMapping(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function rejectUnknownKeys(raw: Record<string, unknown>, known: string[], where: string, problems: string[]): void {
  for (const key of Object.keys(raw)) {
    if (!known.includes(key)) problems.push(`unknown key '${where}${key}'. Known: ${known.join(', ')}`)
  }
}

function readDisplayTemplate(name: string, raw: unknown, problems: string[]): DisplayTemplate | undefined {
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
    const template = readForm(raw.template, 'template', targets, ITEM_FORM, problems)
    return template === undefined ? undefined : { kind: 'single', name, targets, template }
  }
  const list = readList(raw.list, targets, problems)
  return list && { kind: 'list', name, targets, list }
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

function readForm(
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

function readOptionalForm(
  raw: unknown,
  where: string,
  targets: DisplayTemplateTargetType[],
  options: TemplateCheckOptions,
  problems: string[],
): string | undefined {
  return raw === undefined ? undefined : readForm(raw, where, targets, options, problems)
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

function readSeparators(raw: Record<string, unknown>, where: string, problems: string[]): DisplayTemplateSeparators | undefined {
  const separator = readForm(raw.separator, `${where}.separator`, [], LIST_TEXT, problems)
  const lastSeparator = readOptionalForm(raw['last-separator'], `${where}.last-separator`, [], LIST_TEXT, problems)
  return separator === undefined ? undefined : { separator, lastSeparator: lastSeparator ?? separator }
}

function readItem(
  raw: unknown,
  targets: DisplayTemplateTargetType[],
  problems: string[],
): DisplayTemplateItemForms | undefined {
  if (!isMapping(raw)) {
    problems.push("'list.item' must be a mapping with at least 'first' and 'separator'")
    return undefined
  }
  rejectUnknownKeys(raw, ITEM_KEYS, 'list.item.', problems)
  const first = readForm(raw.first, 'list.item.first', targets, ITEM_FORM, problems)
  const middle = readOptionalForm(raw.middle, 'list.item.middle', targets, ITEM_FORM, problems)
  const last = readOptionalForm(raw.last, 'list.item.last', targets, ITEM_FORM, problems)
  const only = readOptionalForm(raw.only, 'list.item.only', targets, ITEM_FORM, problems)
  const separators = readSeparators(raw, 'list.item', problems)
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

function readList(
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
  const item = readItem(raw.item, targets, problems)
  let group: DisplayTemplateSeparators | undefined
  if (groupBy !== undefined) {
    if (isMapping(raw.group)) {
      rejectUnknownKeys(raw.group, SEPARATOR_KEYS, 'list.group.', problems)
      group = readSeparators(raw.group, 'list.group', problems)
    } else {
      problems.push("'list.group' with a 'separator' is required with 'group-by'")
    }
  } else if (raw.group !== undefined) {
    problems.push("'list.group' only applies with 'group-by'")
  }
  const before = readOptionalForm(raw.before, 'list.before', [], LIST_TEXT, problems) ?? ''
  const after = readOptionalForm(raw.after, 'list.after', [], LIST_TEXT, problems) ?? ''

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
