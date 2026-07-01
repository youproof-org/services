import 'server-only'
import fs from 'fs'
import path from 'path'
import type {
  ContentBlock,
  RefMap,
  TermMap,
  ThumbnailImage,
  ContentGraph,
  EntityLabels,
  EmbedBlock,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  BookNode,
  PartNode,
  ChapterNode,
  SectionNode,
} from './types'
import {
  getContentDir,
  resolveNamespace,
  loadDefinition,
  loadTheorem,
  loadProof,
  loadRemark,
  loadEpisodes,
  loadBook,
  loadPart,
  loadChapter,
  loadSection,
  resolveFigurePaths,
} from './loader'
import { buildContext, resolveTemplate } from './display-template'
import { claimId } from '@/lib/utils/claim-id'
import { termId } from '@/lib/utils/term-id'
import { entityId } from '@/lib/utils/entity-id'
import { getChapterIndex, walkFigureBlocks } from '@/lib/utils/index-helpers'

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function resolveImageSrc(src: string, dir: string, urlPrefix: string): string {
  if (src.startsWith('/')) return src
  let resolved = src
  if (path.extname(resolved) === '') {
    const match = fs.readdirSync(dir).find(
      (entry) => path.basename(entry, path.extname(entry)) === resolved
    )
    if (match) resolved = match
  }
  return `${urlPrefix}/${resolved}`
}

function entityKey(namespace: string, name: string): string {
  return `/entities${namespace}/${name}`
}

function bookKey(bookName: string): string {
  return `/books/${bookName}`
}

function partKey(bookName: string, partName: string): string {
  return `/books/${bookName}/${partName}`
}

function chapterKey(bookName: string, partName: string, chapterName: string): string {
  return `/books/${bookName}/${partName}/${chapterName}`
}

function sectionKey(
  bookName: string,
  partName: string,
  chapterName: string,
  sectionName: string
): string {
  return `/books/${bookName}/${partName}/${chapterName}/${sectionName}`
}

function scanFiles(dir: string, ext = '.yaml'): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => path.join(dir, f))
}

// ---------------------------------------------------------------------------
// Raw graph data — plain serialisable objects, no circular references
// ---------------------------------------------------------------------------

export interface RawDefinitionEntry {
  name: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  body: ContentBlock[]
  references: RefMap
  remarkSlugs: string[]
}

export interface RawTheoremEntry {
  name: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  body: ContentBlock[]
  references: RefMap
  proofSlugs: string[]
  remarkSlugs: string[]
}

export interface RawProofEntry {
  name: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  body: ContentBlock[]
  references: RefMap
  remarkSlugs: string[]
}

export interface RawRemarkEntry {
  name: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  references: RefMap
  body: ContentBlock[]
}

export interface RawSectionEntry {
  name: string
  title: string
  body: ContentBlock[]
  references: RefMap
}

export interface RawChapterEntry {
  name: string
  title: string
  abstract: ContentBlock[]
  prerequisiteWarning?: ContentBlock[]
  prologue: ContentBlock[]
  sections: RawSectionEntry[]
  epilogue: ContentBlock[]
  references: RefMap
  thumbnail?: ThumbnailImage
}

export interface RawPartEntry {
  name: string
  title: string
  chapters: RawChapterEntry[]
}

export interface RawBookEntry {
  name: string
  title: string
  parts: RawPartEntry[]
  logo?: ThumbnailImage
}

export interface RawGraphData {
  episodeOrder: string[]
  definitions: RawDefinitionEntry[]
  theorems: RawTheoremEntry[]
  proofs: RawProofEntry[]
  remarks: RawRemarkEntry[]
  books: RawBookEntry[]
}

// ---------------------------------------------------------------------------
// Pass 1+3: Load raw data from YAML files (I/O-heavy)
// ---------------------------------------------------------------------------

export async function loadRawGraphData(): Promise<RawGraphData> {
  const contentDir = getContentDir()
  const kbDir = path.join(contentDir, 'knowledge-base')
  const booksDir = path.join(contentDir, 'books')

  const raw: RawGraphData = {
    episodeOrder: [],
    definitions: [],
    theorems: [],
    proofs: [],
    remarks: [],
    books: [],
  }

  function scanNamespaceDir(dir: string) {
    const entries = fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true })
      : []

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (!entry.isDirectory()) continue
      const typeName = entry.name

      if (['definitions', 'theorems', 'proofs', 'remarks'].includes(typeName)) {
        const namespace = resolveNamespace(kbDir, fullPath)
        for (const file of scanFiles(fullPath)) {
          if (path.basename(file) === 'namespace.yaml') continue
          const figureUrlPrefix = `/content/${path.relative(contentDir, path.dirname(file)).replace(/\\/g, '/')}/figures`
          const figuresDir = path.join(process.cwd(), 'public', figureUrlPrefix)
          try {
            if (typeName === 'definitions') {
              const loaded = loadDefinition(file, namespace)
              raw.definitions.push({
                name: loaded.node.name,
                namespace,
                title: loaded.node.title,
                labels: loaded.node.labels,
                terms: loaded.node.terms,
                body: resolveFigurePaths(loaded.node.body, figureUrlPrefix, figuresDir),
                references: loaded.node.references,
                remarkSlugs: loaded.rawRemarks,
              })
            } else if (typeName === 'theorems') {
              const loaded = loadTheorem(file, namespace)
              raw.theorems.push({
                name: loaded.node.name,
                namespace,
                title: loaded.node.title,
                labels: loaded.node.labels,
                terms: loaded.node.terms,
                body: resolveFigurePaths(loaded.node.body, figureUrlPrefix, figuresDir),
                references: loaded.node.references,
                proofSlugs: loaded.rawProofs,
                remarkSlugs: loaded.rawRemarks,
              })
            } else if (typeName === 'proofs') {
              const loaded = loadProof(file, namespace)
              raw.proofs.push({
                name: loaded.node.name,
                namespace,
                title: loaded.node.title,
                labels: loaded.node.labels,
                terms: loaded.node.terms,
                body: resolveFigurePaths(loaded.node.body, figureUrlPrefix, figuresDir),
                references: loaded.node.references,
                remarkSlugs: loaded.rawRemarks,
              })
            } else if (typeName === 'remarks') {
              const loaded = loadRemark(file, namespace)
              raw.remarks.push({
                name: loaded.node.name,
                namespace,
                title: loaded.node.title,
                labels: loaded.node.labels,
                terms: loaded.node.terms,
                references: loaded.node.references,
                body: resolveFigurePaths(loaded.node.body, figureUrlPrefix, figuresDir),
              })
            }
          } catch (err) {
            console.warn(`Failed to load entity ${file}:`, err)
          }
        }
      } else {
        scanNamespaceDir(fullPath)
      }
    }
  }

  scanNamespaceDir(kbDir)

  if (!fs.existsSync(booksDir)) return raw

  const episodesYamlPath = path.join(booksDir, 'episodes.yaml')
  raw.episodeOrder = fs.existsSync(episodesYamlPath) ? loadEpisodes(episodesYamlPath) : []

  // Build name → {dir, raw} map for books by scanning subdirectories
  const bookByName = new Map<string, { dir: string; raw: ReturnType<typeof loadBook> }>()
  for (const entry of fs.readdirSync(booksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(booksDir, entry.name, 'book.yaml')
    if (!fs.existsSync(candidate)) continue
    const rawCandidate = loadBook(candidate)
    bookByName.set(rawCandidate.name, { dir: path.join(booksDir, entry.name), raw: rawCandidate })
  }

  for (const bookName of raw.episodeOrder) {
    const book = bookByName.get(bookName)
    if (!book) { console.warn(`No book.yaml found with name "${bookName}" under ${booksDir}`); continue }
    const { dir: bookDir, raw: rawBook } = book
    const bookUrlPrefix = `/content/books/${path.basename(bookDir)}`
    const bookEntry: RawBookEntry = {
      name: rawBook.name,
      title: rawBook.title,
      logo: rawBook.logo
        ? {
            src: resolveImageSrc(rawBook.logo.src, bookDir, bookUrlPrefix),
            alt: rawBook.logo.alt,
          }
        : undefined,
      parts: [],
    }

    // Build name → {dir, raw} map for parts by scanning subdirectories
    const partByName = new Map<string, { dir: string; raw: ReturnType<typeof loadPart> }>()
    for (const entry of fs.readdirSync(bookDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(bookDir, entry.name, 'part.yaml')
      if (!fs.existsSync(candidate)) continue
      const raw = loadPart(candidate)
      partByName.set(raw.name, { dir: path.join(bookDir, entry.name), raw })
    }

    for (const partName of rawBook.partNames) {
      const part = partByName.get(partName)
      if (!part) { console.warn(`No part.yaml found with name "${partName}" under ${bookDir}`); continue }
      const { dir: partDir, raw: rawPart } = part

      const partEntry: RawPartEntry = { name: rawPart.name, title: rawPart.title, chapters: [] }

      // Build name → {dir, raw} map for chapters by scanning subdirectories
      const chapterByName = new Map<string, { dir: string; raw: ReturnType<typeof loadChapter> }>()
      for (const entry of fs.readdirSync(partDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const candidate = path.join(partDir, entry.name, 'chapter.yaml')
        if (!fs.existsSync(candidate)) continue
        const raw = loadChapter(candidate)
        chapterByName.set(raw.name, { dir: path.join(partDir, entry.name), raw })
      }

      for (const chapterName of rawPart.chapterNames) {
        const chapter = chapterByName.get(chapterName)
        if (!chapter) { console.warn(`No chapter.yaml found with name "${chapterName}" under ${partDir}`); continue }
        const { dir: chapterDir, raw: rawChapter } = chapter

        const chapterUrlPrefix = `/content/books/${path.basename(bookDir)}/${path.basename(partDir)}/${path.basename(chapterDir)}`
        const figureUrlPrefix = `${chapterUrlPrefix}/figures`
        const figuresDir = path.join(process.cwd(), 'public', figureUrlPrefix)

        const chapterEntry: RawChapterEntry = {
          name: rawChapter.name,
          title: rawChapter.title,
          abstract: resolveFigurePaths(rawChapter.abstract, figureUrlPrefix, figuresDir),
          prerequisiteWarning: rawChapter.prerequisiteWarning
            ? resolveFigurePaths(rawChapter.prerequisiteWarning, figureUrlPrefix, figuresDir)
            : undefined,
          prologue: resolveFigurePaths(rawChapter.prologue, figureUrlPrefix, figuresDir),
          epilogue: resolveFigurePaths(rawChapter.epilogue, figureUrlPrefix, figuresDir),
          references: rawChapter.references,
          thumbnail: rawChapter.thumbnail
            ? {
                src: resolveImageSrc(rawChapter.thumbnail.src, chapterDir, chapterUrlPrefix),
                alt: rawChapter.thumbnail.alt,
              }
            : undefined,
          sections: [],
        }

        // Build name → {path, raw} map for sections by scanning chapter directory
        const sectionByName = new Map<string, { filePath: string; raw: ReturnType<typeof loadSection> }>()
        for (const file of fs.readdirSync(chapterDir)) {
          if (!file.endsWith('.yaml') || file === 'chapter.yaml') continue
          const candidate = path.join(chapterDir, file)
          const raw = loadSection(candidate, figureUrlPrefix, figuresDir)
          sectionByName.set(raw.name, { filePath: candidate, raw })
        }

        for (const sectionName of rawChapter.sectionNames) {
          const section = sectionByName.get(sectionName)
          if (!section) { console.warn(`No section YAML found with name "${sectionName}" under ${chapterDir}`); continue }
          const { raw: rawSection } = section
          chapterEntry.sections.push({
            name: rawSection.name,
            title: rawSection.title,
            body: rawSection.body,
            references: rawSection.references,
          })
        }

        partEntry.chapters.push(chapterEntry)
      }

      bookEntry.parts.push(partEntry)
    }

    raw.books.push(bookEntry)
  }

  return raw
}

// ---------------------------------------------------------------------------
// Pass 2+3: Build ContentGraph from raw data (no I/O, fast)
// ---------------------------------------------------------------------------

export function buildGraphFromRaw(raw: RawGraphData): ContentGraph {
  const graph: ContentGraph = {
    episodeOrder: raw.episodeOrder,
    books:        new Map(),
    parts:       new Map(),
    chapters:    new Map(),
    sections:    new Map(),
    definitions: new Map(),
    theorems:    new Map(),
    proofs:      new Map(),
    remarks:     new Map(),
  }

  // Pass 1: Populate Maps
  for (const e of raw.definitions) {
    graph.definitions.set(entityKey(e.namespace, e.name), {
      type: 'definition',
      name: e.name,
      namespace: e.namespace,
      title: e.title,
      labels: e.labels,
      terms: e.terms,
      body: e.body,
      references: e.references,
      remarks: [],
    })
  }

  for (const e of raw.theorems) {
    graph.theorems.set(entityKey(e.namespace, e.name), {
      type: 'theorem',
      name: e.name,
      namespace: e.namespace,
      title: e.title,
      labels: e.labels,
      terms: e.terms,
      body: e.body,
      references: e.references,
      proofs: [],
      remarks: [],
    })
  }

  for (const e of raw.proofs) {
    graph.proofs.set(entityKey(e.namespace, e.name), {
      type: 'proof',
      name: e.name,
      namespace: e.namespace,
      title: e.title,
      labels: e.labels,
      terms: e.terms,
      body: e.body,
      references: e.references,
      proves: undefined as unknown as TheoremNode,
      remarks: [],
    })
  }

  for (const e of raw.remarks) {
    graph.remarks.set(entityKey(e.namespace, e.name), {
      type: 'remark',
      name: e.name,
      namespace: e.namespace,
      title: e.title,
      labels: e.labels,
      terms: e.terms,
      references: e.references,
      body: e.body,
      attachedTo: undefined,
    })
  }

  // Pass 2: Wire associations
  for (const theoremEntry of raw.theorems) {
    const theorem = graph.theorems.get(entityKey(theoremEntry.namespace, theoremEntry.name))!
    for (const slug of theoremEntry.proofSlugs) {
      const proof = graph.proofs.get(entityKey(theorem.namespace, slug))
      if (proof) {
        proof.proves = theorem
        theorem.proofs.push(proof)
      }
    }
  }

  const allRemarkParents: Array<{
    namespace: string
    name: string
    remarkSlugs: string[]
  }> = [
    ...raw.definitions.map(e => ({ namespace: e.namespace, name: e.name, remarkSlugs: e.remarkSlugs })),
    ...raw.theorems.map(e => ({ namespace: e.namespace, name: e.name, remarkSlugs: e.remarkSlugs })),
    ...raw.proofs.map(e => ({ namespace: e.namespace, name: e.name, remarkSlugs: e.remarkSlugs })),
  ]

  for (const { namespace, name, remarkSlugs } of allRemarkParents) {
    const key = entityKey(namespace, name)
    const parent = (graph.definitions.get(key) ?? graph.theorems.get(key) ?? graph.proofs.get(key)) as
      | DefinitionNode
      | TheoremNode
      | ProofNode
      | undefined
    if (!parent) continue
    for (const slug of remarkSlugs) {
      const remark = graph.remarks.get(entityKey(namespace, slug))
      if (remark) {
        remark.attachedTo = parent
        parent.remarks.push(remark)
      }
    }
  }

  // Pass 3: Build book hierarchy
  for (const bookEntry of raw.books) {
    const book: BookNode = {
      name: bookEntry.name,
      title: bookEntry.title,
      logo: bookEntry.logo,
      parts: [],
    }
    graph.books.set(bookKey(book.name), book)

    for (const partEntry of bookEntry.parts) {
      const part: PartNode = { name: partEntry.name, title: partEntry.title, book, chapters: [] }
      book.parts.push(part)
      graph.parts.set(partKey(book.name, part.name), part)

      for (const chapterEntry of partEntry.chapters) {
        const chapter: ChapterNode = {
          name: chapterEntry.name,
          title: chapterEntry.title,
          part,
          abstract: chapterEntry.abstract,
          prerequisiteWarning: chapterEntry.prerequisiteWarning,
          prologue: chapterEntry.prologue,
          epilogue: chapterEntry.epilogue,
          sections: [],
          references: chapterEntry.references,
          thumbnail: chapterEntry.thumbnail,
        }
        part.chapters.push(chapter)
        graph.chapters.set(chapterKey(book.name, part.name, chapter.name), chapter)

        for (const sectionEntry of chapterEntry.sections) {
          const section: SectionNode = {
            name: sectionEntry.name,
            title: sectionEntry.title,
            chapter,
            body: sectionEntry.body,
            references: sectionEntry.references,
          }
          chapter.sections.push(section)
          graph.sections.set(sectionKey(book.name, part.name, chapter.name, section.name), section)
        }
      }
    }
  }

  const entityChapterInfo = buildEntityChapterInfo(graph)
  resolveDisplayTemplates(graph, entityChapterInfo)
  resolveSelfReferenceDisplayTemplates(graph)
  resolveClaimRefHrefs(graph, entityChapterInfo)
  validateTermInsertions(graph)

  return graph
}

type EntityChapterInfo = Map<string, { chapterUrl: string; index?: string }>

function buildEntityChapterInfo(graph: ContentGraph): EntityChapterInfo {
  const info: EntityChapterInfo = new Map()

  // First pass: record chapterUrl for every embedded entity
  function scanForUrl(blocks: ContentBlock[], chapterUrl: string) {
    for (const block of blocks) {
      if (block.type === 'embed') {
        const key = `${block.target.namespace}/${block.target.name}`
        if (!info.has(key)) info.set(key, { chapterUrl })
      }
      if (block.type === 'subsection') scanForUrl(block.blocks, chapterUrl)
    }
  }
  for (const [chKey, chapter] of graph.chapters) {
    const parts = chKey.split('/')  // ['', 'books', book, part, chapter]
    const chapterUrl = `/books/${parts[2]}/chapters/${parts[4]}`
    scanForUrl(chapter.prologue, chapterUrl)
    scanForUrl(chapter.epilogue, chapterUrl)
    for (const section of chapter.sections) scanForUrl(section.body, chapterUrl)
  }

  // Second pass: assign sequential indices to indexed embeds (definitions, theorems, independent remarks)
  function isIndexed(block: EmbedBlock): boolean {
    const { type: entityType, name, namespace } = block.target
    if (entityType === 'definition' || entityType === 'theorem') return true
    if (entityType === 'remark') {
      const ns = namespace.startsWith('/') ? namespace.slice(1) : namespace
      const remark = graph.remarks.get(`/entities/${ns}/${name}`)
      return remark !== undefined && remark.attachedTo === undefined
    }
    return false
  }

  for (const [, chapter] of graph.chapters) {
    const chapterIdx = getChapterIndex(chapter)
    let k = 0

    function processIndexed(blocks: ContentBlock[]) {
      for (const block of blocks) {
        if (block.type !== 'embed') continue
        const embed = block as EmbedBlock
        if (!isIndexed(embed)) continue
        const key = `${embed.target.namespace}/${embed.target.name}`
        const entry = info.get(key)
        if (entry && !entry.index) entry.index = `${chapterIdx}.${++k}.`
      }
    }

    processIndexed(chapter.prologue)
    for (const section of chapter.sections) processIndexed(section.body)
  }

  return info
}

function resolveClaimRefHrefs(graph: ContentGraph, entityChapterInfo: EntityChapterInfo): void {
  const refMaps: RefMap[] = [
    ...[...graph.chapters.values()].map(n => n.references),
    ...[...graph.sections.values()].map(n => n.references),
    ...[...graph.definitions.values()].map(n => n.references),
    ...[...graph.theorems.values()].map(n => n.references),
    ...[...graph.proofs.values()].map(n => n.references),
    ...[...graph.remarks.values()].map(n => n.references),
  ]
  for (const refMap of refMaps) {
    for (const entry of Object.values(refMap)) {
      if (entry.target.type === 'claim') {
        const target = entry.target
        const parentKey = `${target.parent.namespace}/${target.parent.name}`
        const chapterUrl = entityChapterInfo.get(parentKey)?.chapterUrl
        if (!chapterUrl) {
          throw new Error(`Cannot resolve chapter URL for claim reference to ${target.name} in ${parentKey}`)
        }
        entry.href = `${chapterUrl}#${claimId(target.name, target.parent)}`
      } else if (entry.target.type === 'term') {
        const target = entry.target
        const parentKey = `${target.parent.namespace}/${target.parent.name}`
        const chapterUrl = entityChapterInfo.get(parentKey)?.chapterUrl
        if (!chapterUrl) {
          throw new Error(`Cannot resolve chapter URL for term reference to "${target.name}" in ${parentKey}`)
        }
        entry.href = `${chapterUrl}#${termId(target.name, target.parent)}`
      } else if (
        entry.target.type === 'definition' || entry.target.type === 'theorem' ||
        entry.target.type === 'proof'       || entry.target.type === 'remark'
      ) {
        const target = entry.target
        const key = `${target.namespace}/${target.name}`
        const chapterUrl = entityChapterInfo.get(key)?.chapterUrl
        if (!chapterUrl) {
          throw new Error(`Cannot resolve chapter URL for entity reference to ${target.type} "${target.name}" in ${target.namespace}`)
        }
        entry.href = `${chapterUrl}#${entityId(target.type, target.namespace, target.name)}`
      }
    }
  }
}

function countTermOccurrences(termKey: string, blocks: ContentBlock[]): number {
  const pattern = `[[${termKey}]]`
  let count = 0
  for (const block of blocks) {
    if (block.type === 'narrative' || block.type === 'claim') {
      count += block.content.split(pattern).length - 1
    } else if (block.type === 'subsection') {
      count += countTermOccurrences(termKey, block.blocks)
    } else if ('leadIn' in block && typeof block.leadIn === 'string') {
      count += block.leadIn.split(pattern).length - 1
    }
    if ('leadOut' in block && typeof (block as unknown as Record<string, unknown>).leadOut === 'string') {
      count += ((block as unknown as Record<string, unknown>).leadOut as string).split(pattern).length - 1
    }
  }
  return count
}

function validateTermInsertions(graph: ContentGraph): void {
  const allEntities = [
    ...graph.definitions.values(),
    ...graph.theorems.values(),
    ...graph.proofs.values(),
    ...graph.remarks.values(),
  ]
  for (const entity of allEntities) {
    if (!entity.terms) continue
    for (const termKey of Object.keys(entity.terms)) {
      const count = countTermOccurrences(termKey, entity.body)
      if (count !== 1) {
        throw new Error(
          `Term "${termKey}" in ${entity.type} "${entity.name}" (${entity.namespace}) ` +
          `must be inserted exactly once but was found ${count} time(s).`
        )
      }
    }
  }
}

function resolveDisplayTemplates(graph: ContentGraph, entityChapterInfo: EntityChapterInfo): void {
  const refMaps: RefMap[] = [
    ...[...graph.chapters.values()].map(n => n.references),
    ...[...graph.sections.values()].map(n => n.references),
    ...[...graph.definitions.values()].map(n => n.references),
    ...[...graph.theorems.values()].map(n => n.references),
    ...[...graph.proofs.values()].map(n => n.references),
    ...[...graph.remarks.values()].map(n => n.references),
  ]
  for (const refMap of refMaps) {
    for (const entry of Object.values(refMap)) {
      if (!entry.display?.includes('{')) continue
      const ctx = buildContext(entry.target, graph, entityChapterInfo)
      if (ctx) entry.display = resolveTemplate(entry.display, ctx).trim()
    }
  }
}

function resolveSelfReferenceDisplayTemplates(graph: ContentGraph): void {
  for (const chapter of graph.chapters.values()) {
    const chapterIndex = getChapterIndex(chapter)
    walkFigureBlocks(graph, chapter, chapterIndex, (block, index) => {
      if (block.selfReference?.display?.includes('{')) {
        const ctx = { target: { index } }
        block.selfReference.display = resolveTemplate(block.selfReference.display, ctx).trim()
      }
    })
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function buildContentGraph(): Promise<ContentGraph> {
  const raw = await loadRawGraphData()
  return buildGraphFromRaw(raw)
}
