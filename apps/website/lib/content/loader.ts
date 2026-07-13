import 'server-only'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { DEFAULT_LOCALE } from '@/lib/i18n/config'
import type {
  ContentBlock,
  RefMap,
  TermMap,
  ThumbnailImage,
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
  return out as unknown as ContentBlock
}

function toBlocks(raw: unknown): ContentBlock[] {
  if (!Array.isArray(raw)) return []
  return (raw as Record<string, unknown>[]).map(normalizeBlock)
}

function toRefMap(raw: unknown): RefMap {
  if (!raw || typeof raw !== 'object') return {}
  return raw as RefMap
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
      return { ...block, src: `${figureUrlPrefix}/${src}` }
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
  const raw = readYaml(filePath)
  return {
    node: {
      type: 'definition',
      name: raw.name as string,
      namespace,
      title: raw.title as string | undefined,
      labels: raw.labels as EntityLabels | undefined,
      terms: toTermMap(raw.terms),
      references: toRefMap(raw.references),
      body: toBlocks(raw.body),
    },
    rawRemarks: toStringArray(raw.remarks),
  }
}

export function loadTheorem(filePath: string, namespace: string): RawTheorem {
  const raw = readYaml(filePath)
  return {
    node: {
      type: 'theorem',
      name: raw.name as string,
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
}

export function loadProof(filePath: string, namespace: string): RawProof {
  const raw = readYaml(filePath)
  return {
    node: {
      type: 'proof',
      name: raw.name as string,
      namespace,
      title: raw.title as string | undefined,
      labels: raw.labels as EntityLabels | undefined,
      terms: toTermMap(raw.terms),
      references: toRefMap(raw.references),
      body: toBlocks(raw.body),
    },
    rawRemarks: toStringArray(raw.remarks),
  }
}

export function loadRemark(filePath: string, namespace: string): RawRemark {
  const raw = readYaml(filePath)
  return {
    node: {
      type: 'remark',
      name: raw.name as string,
      namespace,
      title: raw.title as string | undefined,
      labels: raw.labels as EntityLabels | undefined,
      terms: toTermMap(raw.terms),
      references: toRefMap(raw.references),
      body: toBlocks(raw.body),
    },
  }
}

// ---------------------------------------------------------------------------
// Book content loaders (Pass 3)
// ---------------------------------------------------------------------------

export function loadSection(
  filePath: string,
  figureUrlPrefix: string,
  figuresDir?: string
): { name: string; slug: string; locale: string; title: string; body: ContentBlock[]; references: RefMap } {
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
export class ContentFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ContentFormatError'
  }
}

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
}

export function loadChapter(filePath: string): RawChapter {
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
  }
}

export interface RawPart {
  name: string
  title: string
  chapterNames: string[]
}

export function loadPart(filePath: string): RawPart {
  const raw = readYaml(filePath)
  return {
    name: raw.name as string,
    title: raw.title as string,
    chapterNames: toStringArray(raw.chapters),
  }
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
  abstract: ContentBlock[]
  teaser?: { items: string[] }
  bibliography?: { items: string[] }
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
    abstract: toBlocks(raw.abstract),
    teaser: toItemList(raw.teaser),
    bibliography: toItemList(raw.bibliography),
  }
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
}

// Structure mirrors a chapter (minus book relationship / prerequisite-warning).
// Inline cross-references are out of scope, so `references` is intentionally
// not read here.
export function loadStandalone(filePath: string): RawStandalone {
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
  }
}
