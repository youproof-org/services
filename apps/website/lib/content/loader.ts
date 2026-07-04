import 'server-only'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'
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
): { name: string; title: string; body: ContentBlock[]; references: RefMap } {
  const raw = readYaml(filePath)
  return {
    name: raw.name as string,
    title: raw.title as string,
    body: resolveBlocksFigures(toBlocks(raw.body), figureUrlPrefix, figuresDir),
    references: toRefMap(raw.references),
  }
}

export interface RawChapter {
  name: string
  title: string
  published: boolean
  legacyPath?: string
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
  return {
    name: raw.name as string,
    title: raw.title as string,
    // Default to unpublished when the field is absent or not strictly `true`.
    published: raw.published === true,
    legacyPath: typeof raw['legacy-path'] === 'string' ? (raw['legacy-path'] as string) : undefined,
    sectionNames: toStringArray(raw.sections),
    abstract: toBlocks(raw.abstract),
    prerequisiteWarning: raw['prerequisite-warning']
      ? toBlocks(raw['prerequisite-warning'])
      : undefined,
    prologue: toBlocks(raw.prologue),
    epilogue: toBlocks(raw.epilogue),
    references: toRefMap(raw.references),
    thumbnail: raw.thumbnail
      ? { src: (raw.thumbnail as Record<string, unknown>).src as string, alt: (raw.thumbnail as Record<string, unknown>).alt as string }
      : undefined,
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
  title: string
  partNames: string[]
  logo?: ThumbnailImage
}

export function loadEpisodes(filePath: string): string[] {
  const raw = readYaml(filePath)
  return toStringArray(raw as unknown as unknown[])
}

export function loadBook(filePath: string): RawBook {
  const raw = readYaml(filePath)
  return {
    name: raw.name as string,
    title: raw.title as string,
    partNames: toStringArray(raw.parts),
    logo: raw.logo
      ? { src: (raw.logo as Record<string, unknown>).src as string, alt: (raw.logo as Record<string, unknown>).alt as string }
      : undefined,
  }
}
