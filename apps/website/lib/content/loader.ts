import 'server-only'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import type {
  RefTarget,
  ContentBlock,
  RefMap,
  TermMap,
  ThumbnailImage,
  MetaInfo,
  EntityLabels,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  BookNode,
  PartNode,
  ChapterNode,
  SectionNode,
} from './types'
import { isExternalTarget, parseFqn } from './fqn'

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
  // `embed` and `recall` carry a target in the same form as a reference, always
  // pointing at a knowledge-base entity.
  if (out.type === 'embed' || out.type === 'recall') {
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

/**
 * Parse a `references` map: every `target` is a string, either a fully qualified
 * name or an external URL (see fqn.ts for the scheme test that tells them apart).
 *
 * The ref key is in the message because that is what the author sees at the
 * citation site (`[ref-key]`); the file comes from `inFile`, which wraps the whole
 * load, so neither has to be threaded through every helper.
 */
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

function toRefMap(raw: unknown): RefMap {
  if (!raw || typeof raw !== 'object') return {}
  const out: RefMap = {}
  for (const [refKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as { display?: string; target?: unknown }
    out[refKey] = {
      display: typeof entry.display === 'string' ? entry.display : '',
      target: toRefTarget(entry.target, `reference '${refKey}'`),
    }
  }
  return out
}

/**
 * Exported for tests, which build a raw graph directly and so would otherwise have
 * to hand-write parsed targets — and would then be asserting against their own
 * idea of the shape rather than the parser's.
 */
export function toRefTarget(raw: unknown, where: string): RefTarget {
  if (typeof raw !== 'string') {
    formatError(
      `${where}: 'target' must be a string — either a fully qualified name ` +
        `(e.g. theorems.gyuru-muveletei.claims.disztributiv) or a URL.`,
    )
  }
  const target = raw.trim()
  if (isExternalTarget(target)) return { type: 'external', url: target }
  let parsed
  try {
    parsed = parseFqn(target, where)
  } catch (err) {
    formatError(err instanceof Error ? err.message : String(err))
  }
  return {
    type: parsed.kind,
    name: parsed.name,
    fqn: parsed.fqn,
    parentFqn: parsed.parentFqn,
    parentKind: parsed.parentKind,
  }
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

export function loadDefinition(filePath: string, namespace: string): RawDefinition {
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
        labels: raw.labels as EntityLabels | undefined,
        terms: toTermMap(raw.terms),
        references: toRefMap(raw.references),
        body: toBlocks(raw.body),
      },
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadTheorem(filePath: string, namespace: string): RawTheorem {
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
        labels: raw.labels as EntityLabels | undefined,
        terms: toTermMap(raw.terms),
        references: toRefMap(raw.references),
        body: toBlocks(raw.body),
      },
      rawProofs: toStringArray(raw.proofs),
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadProof(filePath: string, namespace: string): RawProof {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'proof',
        name: raw.name as string,
        // `slug` falls back to a lowercased `name` (readSlug), so a knowledge-base
        // file authored before the slug backfill still loads and still gets a URL.
        slug: readSlug(raw, raw.name as string),
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        labels: raw.labels as EntityLabels | undefined,
        terms: toTermMap(raw.terms),
        references: toRefMap(raw.references),
        body: toBlocks(raw.body),
      },
      rawRemarks: toStringArray(raw.remarks),
    }
  })
}

export function loadRemark(filePath: string, namespace: string): RawRemark {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    return {
      node: {
        type: 'remark',
        name: raw.name as string,
        // `slug` falls back to a lowercased `name` (readSlug), so a knowledge-base
        // file authored before the slug backfill still loads and still gets a URL.
        slug: readSlug(raw, raw.name as string),
        locale: readLocale(raw),
        namespace,
        title: raw.title as string | undefined,
        labels: raw.labels as EntityLabels | undefined,
        terms: toTermMap(raw.terms),
        references: toRefMap(raw.references),
        body: toBlocks(raw.body),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Book content loaders (Pass 3)
// ---------------------------------------------------------------------------

export function loadSection(
  filePath: string,
  figureUrlPrefix: string,
  figuresDir?: string
): { name: string; slug: string; locale: string; title: string; body: ContentBlock[]; references: RefMap } {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    return {
      name,
      slug: readSlug(raw, name),
      locale: readLocale(raw),
      title: raw.title as string,
      body: resolveBlocksFigures(toBlocks(raw.body), figureUrlPrefix, figuresDir),
      references: toRefMap(raw.references),
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
  references: RefMap
  thumbnail?: ThumbnailImage
  meta?: MetaInfo
}

export function loadChapter(filePath: string): RawChapter {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    return {
      name,
      slug: readSlug(raw, name),
      locale: readLocale(raw),
      title: raw.title as string,
      publishedAt: toPublishedAt(raw['published-at'], filePath),
      legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
      excerpt: typeof raw.excerpt === 'string' ? (raw.excerpt as string) : undefined,
      sectionNames: toStringArray(raw.sections),
      abstract: toBlocks(raw.abstract),
      prerequisiteWarning: raw['prerequisite-warning']
        ? toBlocks(raw['prerequisite-warning'])
        : undefined,
      prologue: toBlocks(raw.prologue),
      epilogue: toBlocks(raw.epilogue),
      references: toRefMap(raw.references),
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
  references: RefMap
}

// Structure mirrors a chapter (minus book relationship / prerequisite-warning),
// `references` included — which target types a standalone item may actually point
// at is enforced later, by validateReferences in graph.ts.
export function loadStandalone(filePath: string): RawStandalone {
  return inFile(filePath, () => {
    const raw = readYaml(filePath)
    const name = raw.name as string
    return {
      name,
      slug: readSlug(raw, name),
      locale: readLocale(raw),
      title: raw.title as string,
      publishedAt: toPublishedAt(raw['published-at'], filePath),
      legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
      excerpt: typeof raw.excerpt === 'string' ? (raw.excerpt as string) : undefined,
      sectionNames: toStringArray(raw.sections),
      abstract: toBlocks(raw.abstract),
      prologue: toBlocks(raw.prologue),
      epilogue: toBlocks(raw.epilogue),
      thumbnail: toThumbnail(raw.thumbnail),
      meta: toMeta(raw.meta),
      references: toRefMap(raw.references),
    }
  })
}
