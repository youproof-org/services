import 'server-only'
import fs from 'fs'
import path from 'path'
import type {
  ContentBlock,
  RefMap,
  TermMap,
  ThumbnailImage,
  MetaInfo,
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
  StandaloneKind,
  StandaloneNode,
  StandaloneSection,
  RemarkNode,
  RefEntry,
  RefTarget,
  KbNode,
  KbBacklink,
  EmbeddingContext,
  GlossaryEntry,
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
  loadStandalone,
  resolveFigurePaths,
  ContentFormatError,
} from './loader'

// Standalone content kind → content-repo directory name.
const STANDALONE_DIRS: Record<StandaloneKind, string> = {
  article: 'articles',
  newsletter: 'newsletter',
  page: 'pages',
  landing: 'landing',
}
import { buildContext, resolveTemplate, ENTITY_LABEL_HU } from './display-template'
import { buildLocalizedUrl } from '@/lib/i18n/url'
import { resolveContainerKey } from '@/lib/i18n/config'
import {
  urlForBook,
  urlForStandalone,
  urlForKbNode,
  claimAnchorId,
  termAnchorId,
  entityAnchorId,
} from './urls'
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

// Key for the per-kind standalone Maps (graph.articles/newsletters/pages/landings).
// Keyed on the language-independent `name`, which is also how a StandaloneRefTarget
// addresses an item — so a reference is a direct Map lookup.
function standaloneKey(kind: StandaloneKind, name: string): string {
  return `/${STANDALONE_DIRS[kind]}/${name}`
}

/** The graph Map holding a given standalone kind. */
function standaloneMapFor(graph: ContentGraph, kind: StandaloneKind): Map<string, StandaloneNode> {
  switch (kind) {
    case 'article': return graph.articles
    case 'newsletter': return graph.newsletters
    case 'page': return graph.pages
    case 'landing': return graph.landings
  }
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
  slug: string
  locale: string
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
  slug: string
  locale: string
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
  slug: string
  locale: string
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
  slug: string
  locale: string
  namespace: string
  title?: string
  labels?: EntityLabels
  terms?: TermMap
  references: RefMap
  body: ContentBlock[]
}

export interface RawSectionEntry {
  name: string
  slug: string
  locale: string
  title: string
  body: ContentBlock[]
  references: RefMap
}

export interface RawChapterEntry {
  name: string
  slug: string
  locale: string
  title: string
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  abstract: ContentBlock[]
  prerequisiteWarning?: ContentBlock[]
  prologue: ContentBlock[]
  sections: RawSectionEntry[]
  epilogue: ContentBlock[]
  references: RefMap
  thumbnail?: ThumbnailImage
  meta?: MetaInfo
}

export interface RawPartEntry {
  name: string
  slug: string
  locale: string
  title: string
  chapters: RawChapterEntry[]
}

export interface RawBookEntry {
  name: string
  slug: string
  locale: string
  title: string
  parts: RawPartEntry[]
  thumbnail?: ThumbnailImage
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  abstract: ContentBlock[]
  teaser?: { items: string[] }
  bibliography?: { items: string[] }
  meta?: MetaInfo
}

export interface RawStandaloneEntry {
  kind: StandaloneKind
  name: string
  slug: string
  locale: string
  title: string
  publishedAt?: string
  legacyPath?: string
  excerpt?: string
  abstract: ContentBlock[]
  prologue: ContentBlock[]
  sections: StandaloneSection[]
  epilogue: ContentBlock[]
  thumbnail?: ThumbnailImage
  meta?: MetaInfo
  references: RefMap
}

/**
 * Shape version of the cached raw graph. Bump whenever a Raw*Entry field is added
 * or removed: the dev-mode cache (graph-cache.ts) is a plain JSON dump with no
 * schema, so a cache written by an older build would otherwise rehydrate nodes
 * that silently lack the new fields.
 */
export const RAW_GRAPH_VERSION = 3

export interface RawGraphData {
  version: number
  episodeOrder: string[]
  definitions: RawDefinitionEntry[]
  theorems: RawTheoremEntry[]
  proofs: RawProofEntry[]
  remarks: RawRemarkEntry[]
  books: RawBookEntry[]
  standalones: RawStandaloneEntry[]
}

// ---------------------------------------------------------------------------
// Pass 1+3: Load raw data from YAML files (I/O-heavy)
// ---------------------------------------------------------------------------

export async function loadRawGraphData(): Promise<RawGraphData> {
  const contentDir = getContentDir()
  const kbDir = path.join(contentDir, 'knowledge-base')
  const booksDir = path.join(contentDir, 'books')

  const raw: RawGraphData = {
    version: RAW_GRAPH_VERSION,
    episodeOrder: [],
    definitions: [],
    theorems: [],
    proofs: [],
    remarks: [],
    books: [],
    standalones: [],
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
          // Name-based served path: built from the namespace `name` chain
          // (resolveNamespace) + the entity-type dir, never the on-disk folder
          // basenames. See sync-figures.mjs, which mirrors to the same path.
          const figureUrlPrefix = `/content/knowledge-base${namespace}/${typeName}/figures`
          const figuresDir = path.join(process.cwd(), 'public', figureUrlPrefix)
          try {
            if (typeName === 'definitions') {
              const loaded = loadDefinition(file, namespace)
              raw.definitions.push({
                name: loaded.node.name,
                slug: loaded.node.slug,
                locale: loaded.node.locale,
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
                slug: loaded.node.slug,
                locale: loaded.node.locale,
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
                slug: loaded.node.slug,
                locale: loaded.node.locale,
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
                slug: loaded.node.slug,
                locale: loaded.node.locale,
                namespace,
                title: loaded.node.title,
                labels: loaded.node.labels,
                terms: loaded.node.terms,
                references: loaded.node.references,
                body: resolveFigurePaths(loaded.node.body, figureUrlPrefix, figuresDir),
              })
            }
          } catch (err) {
            if (err instanceof ContentFormatError) throw err // format violations are fatal
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
    const bookUrlPrefix = `/content/books/${rawBook.name}`
    // Book-level figures (for abstract) live under the book dir's figures/.
    const bookFigureUrlPrefix = `${bookUrlPrefix}/figures`
    const bookFiguresDir = path.join(process.cwd(), 'public', bookFigureUrlPrefix)
    const bookEntry: RawBookEntry = {
      name: rawBook.name,
      slug: rawBook.slug,
      locale: rawBook.locale,
      title: rawBook.title,
      thumbnail: rawBook.thumbnail
        ? {
            src: resolveImageSrc(rawBook.thumbnail.src, bookDir, bookUrlPrefix),
            alt: rawBook.thumbnail.alt,
          }
        : undefined,
      publishedAt: rawBook.publishedAt,
      legacyPath: rawBook.legacyPath,
      excerpt: rawBook.excerpt,
      abstract: resolveFigurePaths(rawBook.abstract, bookFigureUrlPrefix, bookFiguresDir),
      teaser: rawBook.teaser,
      bibliography: rawBook.bibliography,
      meta: rawBook.meta,
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

      const partEntry: RawPartEntry = {
        name: rawPart.name,
        slug: rawPart.slug,
        locale: rawPart.locale,
        title: rawPart.title,
        chapters: [],
      }

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

        // Served path is built from YAML `name`s (book/part/chapter), not the
        // on-disk folder basenames (which carry NN- ordering prefixes). Keeps the
        // part segment. sync-figures.mjs mirrors assets to the same name-based path.
        const chapterUrlPrefix = `/content/books/${rawBook.name}/${rawPart.name}/${rawChapter.name}`
        const figureUrlPrefix = `${chapterUrlPrefix}/figures`
        const figuresDir = path.join(process.cwd(), 'public', figureUrlPrefix)

        const chapterEntry: RawChapterEntry = {
          name: rawChapter.name,
          slug: rawChapter.slug,
          locale: rawChapter.locale,
          title: rawChapter.title,
          publishedAt: rawChapter.publishedAt,
          legacyPath: rawChapter.legacyPath,
          excerpt: rawChapter.excerpt,
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
          meta: rawChapter.meta,
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
            slug: rawSection.slug,
            locale: rawSection.locale,
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

  // ---- Standalone content: articles, newsletter, pages, landing ----
  // Each kind lives under `{contentDir}/{dir}/{slug}/{kind}.yaml` (+ optional
  // section YAMLs + figures/). Discovered by directory scan (no ordering file).
  for (const kind of Object.keys(STANDALONE_DIRS) as StandaloneKind[]) {
    const kindDir = path.join(contentDir, STANDALONE_DIRS[kind])
    if (!fs.existsSync(kindDir)) continue

    for (const entry of fs.readdirSync(kindDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const itemDir = path.join(kindDir, entry.name)
      const itemYaml = path.join(itemDir, `${kind}.yaml`)
      if (!fs.existsSync(itemYaml)) continue

      try {
        const rawItem = loadStandalone(itemYaml)
        // Served path is built from the YAML `name`, not the on-disk folder name.
        const itemName = rawItem.name ?? entry.name
        const urlPrefix = `/content/${STANDALONE_DIRS[kind]}/${itemName}`
        const figureUrlPrefix = `${urlPrefix}/figures`
        const figuresDir = path.join(process.cwd(), 'public', figureUrlPrefix)

        // Build name → section map by scanning the item dir (mirrors chapters).
        const sectionByName = new Map<string, ReturnType<typeof loadSection>>()
        for (const file of fs.readdirSync(itemDir)) {
          if (!file.endsWith('.yaml') || file === `${kind}.yaml`) continue
          const s = loadSection(path.join(itemDir, file), figureUrlPrefix, figuresDir)
          sectionByName.set(s.name, s)
        }
        const sections = rawItem.sectionNames
          .map((n) => sectionByName.get(n))
          .filter((s): s is ReturnType<typeof loadSection> => s !== undefined)
          .map((s) => ({
            name: s.name,
            slug: s.slug,
            title: s.title,
            body: s.body,
            references: s.references,
          }))

        raw.standalones.push({
          kind,
          name: itemName,
          slug: rawItem.slug || itemName.toLowerCase(),
          locale: rawItem.locale,
          title: rawItem.title,
          publishedAt: rawItem.publishedAt,
          legacyPath: rawItem.legacyPath,
          excerpt: rawItem.excerpt,
          abstract: resolveFigurePaths(rawItem.abstract, figureUrlPrefix, figuresDir),
          prologue: resolveFigurePaths(rawItem.prologue, figureUrlPrefix, figuresDir),
          sections,
          epilogue: resolveFigurePaths(rawItem.epilogue, figureUrlPrefix, figuresDir),
          thumbnail: rawItem.thumbnail
            ? { src: resolveImageSrc(rawItem.thumbnail.src, itemDir, urlPrefix), alt: rawItem.thumbnail.alt }
            : undefined,
          meta: rawItem.meta,
          references: rawItem.references,
        })
      } catch (err) {
        if (err instanceof ContentFormatError) throw err // format violations are fatal
        console.warn(`Failed to load ${kind} ${itemYaml}:`, err)
      }
    }
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
    articles:    new Map(),
    newsletters: new Map(),
    pages:       new Map(),
    landings:    new Map(),
    embedding:   new Map(),
    backlinks:   new Map(),
    glossary:    [],
  }

  // Pass 1: Populate Maps
  for (const e of raw.definitions) {
    graph.definitions.set(entityKey(e.namespace, e.name), {
      type: 'definition',
      name: e.name,
      slug: e.slug,
      locale: e.locale,
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
      slug: e.slug,
      locale: e.locale,
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
      slug: e.slug,
      locale: e.locale,
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
      slug: e.slug,
      locale: e.locale,
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
      slug: bookEntry.slug,
      locale: bookEntry.locale,
      title: bookEntry.title,
      thumbnail: bookEntry.thumbnail,
      publishedAt: bookEntry.publishedAt,
      published: bookEntry.publishedAt != null,
      legacyPath: bookEntry.legacyPath,
      excerpt: bookEntry.excerpt,
      abstract: bookEntry.abstract,
      teaser: bookEntry.teaser,
      bibliography: bookEntry.bibliography,
      meta: bookEntry.meta,
      parts: [],
    }
    graph.books.set(bookKey(book.name), book)

    for (const partEntry of bookEntry.parts) {
      const part: PartNode = {
        name: partEntry.name,
        slug: partEntry.slug,
        locale: partEntry.locale,
        title: partEntry.title,
        book,
        chapters: [],
      }
      book.parts.push(part)
      graph.parts.set(partKey(book.name, part.name), part)

      for (const chapterEntry of partEntry.chapters) {
        const chapter: ChapterNode = {
          name: chapterEntry.name,
          slug: chapterEntry.slug,
          locale: chapterEntry.locale,
          title: chapterEntry.title,
          part,
          publishedAt: chapterEntry.publishedAt,
          published: chapterEntry.publishedAt != null,
          legacyPath: chapterEntry.legacyPath,
          excerpt: chapterEntry.excerpt,
          abstract: chapterEntry.abstract,
          prerequisiteWarning: chapterEntry.prerequisiteWarning,
          prologue: chapterEntry.prologue,
          epilogue: chapterEntry.epilogue,
          sections: [],
          references: chapterEntry.references,
          thumbnail: chapterEntry.thumbnail,
          meta: chapterEntry.meta,
        }
        part.chapters.push(chapter)
        graph.chapters.set(chapterKey(book.name, part.name, chapter.name), chapter)

        for (const sectionEntry of chapterEntry.sections) {
          const section: SectionNode = {
            name: sectionEntry.name,
            slug: sectionEntry.slug,
            locale: sectionEntry.locale,
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

  // Pass 3b: Standalone content (article/newsletter/page/landing). No parent
  // wiring; `references` ride along and are resolved/validated with everything
  // else below (see refOwners + validateReferences).
  for (const e of raw.standalones) {
    const node: StandaloneNode = {
      kind: e.kind,
      name: e.name,
      slug: e.slug,
      locale: e.locale,
      title: e.title,
      publishedAt: e.publishedAt,
      published: e.publishedAt != null,
      legacyPath: e.legacyPath,
      excerpt: e.excerpt,
      abstract: e.abstract,
      prologue: e.prologue,
      sections: e.sections,
      epilogue: e.epilogue,
      thumbnail: e.thumbnail,
      meta: e.meta,
      references: e.references,
    }
    standaloneMapFor(graph, e.kind).set(standaloneKey(e.kind, e.name), node)
  }

  // Order matters. Embedding first: every URL and title below depends on knowing
  // which chapter a node lives in. Then hrefs, since the glossary counts inbound
  // references and needs the backlink index, which needs the anchors hrefs use.
  graph.embedding = buildEmbedding(graph)
  validateIdentifiers(graph)
  resolveDisplayTemplates(graph)
  resolveSelfReferenceDisplayTemplates(graph)
  resolveRefHrefs(graph)
  graph.backlinks = buildBacklinkIndex(graph)
  graph.glossary = buildGlossary(graph)
  validateReferences(graph)
  validateTermInsertions(graph)
  validateKbLinks(graph)

  return graph
}

// ---------------------------------------------------------------------------
// Reference owners
// ---------------------------------------------------------------------------

/**
 * Every node in the graph that can carry a `references` map, together with what
 * kind of node it is and (for a section) its parent.
 *
 * This is the single place that enumerates reference owners. Everything that walks
 * references — href resolution, display-template resolution, validation — goes
 * through `refOwners`, so adding a node kind means touching one function instead of
 * every walker.
 *
 * The owner is carried, not just its RefMap, because reference *rules* are
 * statements about an owner and its target together ("a chapter may only reference
 * chapters of the same book"). Handing walkers a bare RefMap would make such rules
 * inexpressible.
 */
type RefOwner =
  | { kind: 'chapter'; node: ChapterNode }
  | { kind: 'section'; node: SectionNode; parent: ChapterNode }
  | { kind: 'definition'; node: DefinitionNode }
  | { kind: 'theorem'; node: TheoremNode }
  | { kind: 'proof'; node: ProofNode }
  | { kind: 'remark'; node: RemarkNode }
  | { kind: StandaloneKind; node: StandaloneNode }
  | { kind: 'standalone-section'; node: StandaloneSection; parent: StandaloneNode }

/**
 * Yields the LIVE node objects, not copies: resolution mutates `RefEntry.href` and
 * `RefEntry.display` in place, and the renderer reads the same objects back off the
 * graph.
 */
function* refOwners(graph: ContentGraph): Generator<RefOwner> {
  for (const node of graph.chapters.values()) {
    yield { kind: 'chapter', node }
    for (const section of node.sections) yield { kind: 'section', node: section, parent: node }
  }
  for (const node of graph.definitions.values()) yield { kind: 'definition', node }
  for (const node of graph.theorems.values()) yield { kind: 'theorem', node }
  for (const node of graph.proofs.values()) yield { kind: 'proof', node }
  for (const node of graph.remarks.values()) yield { kind: 'remark', node }
  for (const map of [graph.articles, graph.newsletters, graph.pages, graph.landings]) {
    for (const node of map.values()) {
      yield { kind: node.kind, node }
      for (const section of node.sections) {
        yield { kind: 'standalone-section', node: section, parent: node }
      }
    }
  }
}

/** Every reference map in the graph, for walkers that don't need owner context. */
function* allRefEntries(graph: ContentGraph): Generator<RefEntry> {
  for (const owner of refOwners(graph)) yield* Object.values(owner.node.references)
}

/**
 * Which `target.type`s each owner kind may reference.
 *
 * Only kinds listed here are constrained; anything absent keeps the historical
 * permissive behaviour. The standalone kinds are restricted because a legal page
 * linking into the middle of a book's entity graph is not something the standalone
 * renderer supports (it has no entity/embed indices) — better a build error than a
 * silently broken link.
 *
 * This table is the seam for the richer rules still to come (a chapter referencing
 * only chapters of its own book; an embedded entity referencing only entities
 * embedded in the same book). Those need the owner's parentage, which `refOwners`
 * already supplies — add the rule here rather than in the walkers.
 */
const ALLOWED_REF_TARGETS: Partial<Record<RefOwner['kind'], readonly RefTarget['type'][]>> = {
  page: ['external', 'page'],
}

function validateReferences(graph: ContentGraph): void {
  for (const owner of refOwners(graph)) {
    const allowed = ALLOWED_REF_TARGETS[owner.kind]
    if (!allowed) continue
    for (const [key, entry] of Object.entries(owner.node.references)) {
      if (!allowed.includes(entry.target.type)) {
        throw new Error(
          `Reference "${key}" in ${owner.kind} "${owner.node.name}" targets ` +
            `'${entry.target.type}', which a ${owner.kind} may not reference ` +
            `(allowed: ${allowed.join(', ')}).`
        )
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Knowledge-base derivation: embedding, page existence, backlinks, glossary
// ---------------------------------------------------------------------------

// A knowledge-base page is only generated on a deployed environment when the
// chapter embedding the node is published. Locally every embedded node gets a page
// so drafts are previewable - the same rule, and the same env switch, the chapter
// stub logic already uses (see app/[locale]/[[...path]]/page.tsx).
const isDeployedEnv =
  process.env.SITE_ENV === 'staging' || process.env.SITE_ENV === 'production'

/**
 * Where each knowledge-base node is introduced in the narrative: the chapter that
 * embeds it, the section within that chapter, and the chapter-scoped index label.
 *
 * Every node is embedded exactly once today. A node embedded in two chapters keeps
 * the first in iteration order, which is deterministic (driven by episodes.yaml).
 */
function buildEmbedding(graph: ContentGraph): Map<string, EmbeddingContext> {
  const info = new Map<string, EmbeddingContext>()

  const record = (block: EmbedBlock, chapter: ChapterNode, section?: SectionNode) => {
    const key = entityKey(block.target.namespace, block.target.name)
    if (!info.has(key)) info.set(key, { chapter, section })
  }
  const scan = (blocks: ContentBlock[], chapter: ChapterNode, section?: SectionNode) => {
    for (const block of blocks) {
      if (block.type === 'embed') record(block, chapter, section)
      if (block.type === 'subsection' || block.type === 'details') scan(block.blocks, chapter, section)
    }
  }

  for (const chapter of graph.chapters.values()) {
    scan(chapter.prologue, chapter)
    scan(chapter.epilogue, chapter)
    for (const section of chapter.sections) scan(section.body, chapter, section)
  }

  // Second pass: the "11.3." label, numbered in embed order within the chapter.
  // Only definitions, theorems and owner-less remarks are numbered.
  const isIndexed = (block: EmbedBlock): boolean => {
    const { type, name, namespace } = block.target
    if (type === 'definition' || type === 'theorem') return true
    if (type === 'remark') {
      const remark = graph.remarks.get(entityKey(namespace, name))
      return remark !== undefined && remark.attachedTo === undefined
    }
    return false
  }

  for (const chapter of graph.chapters.values()) {
    const chapterIdx = getChapterIndex(chapter)
    let k = 0
    const number = (blocks: ContentBlock[]) => {
      for (const block of blocks) {
        if (block.type !== 'embed' || !isIndexed(block)) continue
        const entry = info.get(entityKey(block.target.namespace, block.target.name))
        if (entry && !entry.index) entry.index = `${chapterIdx}.${++k}.`
      }
    }
    number(chapter.prologue)
    for (const section of chapter.sections) number(section.body)
  }

  return info
}

/** Localized URL of the chapter a node is embedded in. */
function chapterUrlOf(chapter: ChapterNode): string {
  return buildLocalizedUrl(chapter.locale, 'chapter', chapter.part.book.slug, chapter.slug)
}

/**
 * Does this node get a standalone knowledge-base page?
 *
 * Two conditions, and this is the ONE place they live - generateStaticParams, the
 * type indexes, the glossary, the sitemap and kbHref resolution must all agree, or
 * an internally-generated link 404s on staging while working locally.
 *
 *   1. the node is embedded in a chapter - a node rendered nowhere in the
 *      narrative has no "Appears in" context and nothing linking to it;
 *   2. on staging/production, that chapter is published.
 */
export function kbPageExists(graph: ContentGraph, node: KbNode): boolean {
  const embedding = graph.embedding.get(entityKey(node.namespace, node.name))
  if (!embedding) return false
  return isDeployedEnv ? embedding.chapter.published : true
}

/** Every knowledge-base node, in one iterable. */
function* kbNodes(graph: ContentGraph): Generator<KbNode> {
  yield* graph.definitions.values()
  yield* graph.theorems.values()
  yield* graph.proofs.values()
  yield* graph.remarks.values()
}

function kbNodeByKey(graph: ContentGraph, key: string): KbNode | undefined {
  return graph.definitions.get(key) ?? graph.theorems.get(key)
    ?? graph.proofs.get(key) ?? graph.remarks.get(key)
}

/**
 * Identifier rules for the whole content model: one character rule, and one
 * uniqueness scope per type for names and for slugs alike.
 *
 * Both identifiers are segments of a dotted grammar - a cross-reference target is
 * `theorems.{t}.claims.{c}`, an anchor is `tetelek.{t}.allitasok.{c}` - so a `.`
 * in either would split into two segments, and a duplicate in scope makes a
 * reference ambiguous or collapses two pages onto one URL. Both are hard build
 * errors rather than warnings.
 *
 * `name` and `slug` are separate namespaces with the SAME scopes, differing only
 * in that a slug is unique per locale (a future `en` file may reuse an `hu` slug)
 * while a name is unique across locales - it is the same id in every language.
 *
 * Each scope is the identifier's position in the reference grammar: what
 * disambiguates a reference is what disambiguates the identifier. Consequences
 * that look like gaps but are deliberate: a definition and a theorem may share
 * either identifier (different container segments); two sections in different
 * chapters may (the anchor is page-scoped); two proofs of different theorems may;
 * and a claim may share a slug with a term on the same node, since they sit under
 * distinct `allitasok.`/`fogalmak.` segments.
 *
 * See docs/i18n-design.md §9 and the content repo's docs/content-model.md.
 */
const IDENTIFIER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function validateIdentifiers(graph: ContentGraph): void {
  // Every (scope, identifier) may be claimed exactly ONCE. There is deliberately no
  // "same owner may re-claim" tolerance: every node below is visited once, so a
  // repeat claim is always a collision. Tolerating it by comparing owner labels
  // would silently pass the cases where two colliding nodes produce the SAME label
  // - two claims with one name, or two chapters with one name in different parts of
  // a book - which is the exact class of duplicate this function exists to catch.
  const seen = new Map<string, string>() // scope + identifier -> who claimed it
  const claim = (scope: string, value: string, owner: string) => {
    const key = `${scope}\u0000${value}`
    const prev = seen.get(key)
    if (prev !== undefined) {
      throw new Error(
        `Identifier collision: '${value}' is used by both "${prev}" and "${owner}" within ${scope}.`,
      )
    }
    seen.set(key, owner)
  }

  // `kind` is spelled out rather than derived, because the message is what an
  // author sees and "section name" beats "identifier".
  const shape = (kind: string, owner: string, value: string | undefined) => {
    if (!value) throw new Error(`${owner} has no ${kind}.`)
    if (!IDENTIFIER_RE.test(value)) {
      throw new Error(
        `Invalid ${kind} '${value}' on ${owner}: must be lowercase kebab-case ` +
          `(${IDENTIFIER_RE.source}). A '.' is the separator of the reference and ` +
          `anchor grammars, so it cannot appear in either identifier.`,
      )
    }
  }

  // A name is scoped without the locale, a slug with it. Everything below claims
  // both in one call so a new type cannot be added to one table and forgotten in
  // the other.
  const both = (scope: string, node: { name: string; slug: string; locale: string }, owner: string) => {
    shape('name', owner, node.name)
    shape('slug', owner, node.slug)
    claim(`${scope} names`, node.name, owner)
    claim(`${scope} slugs in locale '${node.locale}'`, node.slug, owner)
  }

  // ── Books, parts, chapters, sections ──
  for (const book of graph.books.values()) {
    both('all books', book, `book ${book.name}`)
    for (const part of book.parts) {
      both(`book '${book.name}' parts`, part, `part ${part.name}`)
      for (const chapter of part.chapters) {
        // Scoped to the BOOK, not the part: a chapter URL flattens the part out,
        // so two chapters in different parts of one book would collide.
        both(
          `book '${book.name}' chapters`,
          chapter,
          `chapter ${chapter.name} (in part ${part.name})`,
        )
        for (const section of chapter.sections) {
          both(`chapter '${chapter.name}' sections`, section, `section ${section.name}`)
        }
      }
    }
  }

  // ── Standalone items and their sections ──
  for (const kind of ['article', 'newsletter', 'page', 'landing'] as const) {
    for (const node of standaloneMapFor(graph, kind).values()) {
      both(`all ${kind}s`, node, `${kind} ${node.name}`)
      // A page sits at the locale root next to konyvek/cikkek/..., so its slug
      // must not be a container segment. Checked here rather than in
      // generateStaticParams so every consumer benefits, not just route
      // generation - and so the anchor-only segments (allitasok, szakaszok,
      // reszek) are covered by the same guard.
      if (node.kind === 'page' && resolveContainerKey(node.locale, node.slug) !== null) {
        throw new Error(
          `Custom page slug "${node.slug}" collides with a container segment in ` +
            `locale "${node.locale}". Rename the page.`,
        )
      }
      for (const section of node.sections) {
        // A standalone section carries no locale of its own; the item supplies it.
        shape('name', `section ${section.name} of ${kind} ${node.name}`, section.name)
        shape('slug', `section ${section.name} of ${kind} ${node.name}`, section.slug)
        claim(`${kind} '${node.name}' section names`, section.name, `section ${section.name}`)
        claim(
          `${kind} '${node.name}' section slugs in locale '${node.locale}'`,
          section.slug,
          `section ${section.name}`,
        )
      }
    }
  }

  // ── Namespace path segments ──
  // A namespace is neither addressed nor anchored and appears in no reference, so
  // it has no slug. Its name is still an identifier and still constrained.
  //
  // Only the SHAPE is checked, not per-parent uniqueness: namespaces are not graph
  // nodes (namespace.yaml is skipped by the scan) and exist here only as the path
  // string on each entity, assembled from the `name` in each namespace.yaml along
  // the directory chain. Two sibling directories declaring the same name would
  // collapse into one path, which this cannot see. No content does, and detecting
  // it would mean loading namespaces as nodes - a bigger change than the risk
  // warrants, since nothing addresses them.
  const checkedNamespaces = new Set<string>()
  for (const node of kbNodes(graph)) {
    if (checkedNamespaces.has(node.namespace)) continue
    checkedNamespaces.add(node.namespace)
    for (const segment of node.namespace.split('/')) {
      if (segment === '') continue
      shape('name', `namespace '${node.namespace}'`, segment)
    }
  }

  // ── Knowledge base ──
  for (const node of kbNodes(graph)) {
    const id = `${node.type} ${node.name}`

    if (node.type === 'definition' || node.type === 'theorem') {
      both(`all ${node.type}s`, node, id)
    } else if (node.type === 'proof') {
      both(`proofs of theorem '${node.proves.name}'`, node, id)
    } else if (node.type === 'remark' && node.attachedTo) {
      both(`remarks of ${node.attachedTo.type} '${node.attachedTo.name}'`, node, id)
    } else {
      // An owner-less remark: not addressable, but still validate its shape.
      shape('name', id, node.name)
      shape('slug', id, node.slug)
    }

    // Claims and terms sit under distinct anchor segments, so they get distinct
    // scopes - unlike the single shared anchor namespace this replaces.
    for (const [index, block] of node.body.entries()) {
      if (block.type !== 'claim') continue
      if (node.type === 'proof') {
        throw new Error(
          `Proof "${node.name}" contains a claim block ("${block.name}"). A proof is one ` +
            `argument, not a set of numbered assertions; the claims it establishes belong ` +
            `to the theorem being proved.`,
        )
      }
      // The index, not just the name: two claims sharing a name must read as two
      // distinct owners in the collision message.
      const owner = `claim ${block.name} (body block ${index}) of ${id}`
      shape('name', owner, block.name)
      if (block.slug !== undefined) shape('slug', owner, block.slug)
      claim(`claims of ${id}`, block.name, owner)
      claim(`claim slugs of ${id}`, block.slug ?? block.name, owner)
    }

    for (const [termKey, term] of Object.entries(node.terms ?? {})) {
      const owner = `term ${termKey} of ${id}`
      // The key is the term's name, and a map cannot repeat a key, so name
      // uniqueness is structural here - only the shape needs checking.
      shape('name', owner, termKey)
      if (term.slug !== undefined) shape('slug', owner, term.slug)
      claim(`term slugs of ${id}`, term.slug ?? termKey, owner)
    }
  }
}


/**
 * Inbound references to knowledge-base nodes, for the "Referenced by" block.
 *
 * Keyed by entity key for a whole-node citation, and by "{entityKey}#{anchor}" for
 * one that cites a specific claim or term - which is what lets a KB page
 * cross-highlight a backlink against the inline claim/term it points at.
 *
 * Built by walking `refOwners`, the single enumeration of everything in the graph
 * that can carry references, so chapters and sections are included alongside KB
 * nodes rather than needing their own pass.
 */
function buildBacklinkIndex(graph: ContentGraph): Map<string, KbBacklink[]> {
  const index = new Map<string, KbBacklink[]>()
  const add = (key: string, link: KbBacklink) => {
    const list = index.get(key)
    if (list) list.push(link)
    else index.set(key, [link])
  }

  for (const owner of refOwners(graph)) {
    const origin = backlinkOrigin(graph, owner)
    if (!origin) continue
    for (const [refKey, entry] of Object.entries(owner.node.references)) {
      const t = entry.target
      if (t.type === 'definition' || t.type === 'theorem' || t.type === 'proof' || t.type === 'remark') {
        add(entityKey(t.namespace, t.name), { ...origin, refKey })
      } else if (t.type === 'claim' || t.type === 'term') {
        const parentKey = entityKey(t.parent.namespace, t.parent.name)
        const parent = kbNodeByKey(graph, parentKey)
        if (!parent) continue
        const anchor = t.type === 'claim'
          ? claimAnchorForName(parent, t.name)
          : termAnchorForKey(parent, t.name)
        if (!anchor) continue
        add(`${parentKey}#${anchor}`, { ...origin, refKey, targetAnchor: anchor })
      }
    }
  }
  return index
}

/** The anchor a claim reference resolves to, or null if the parent has no such claim. */
function claimAnchorForName(parent: KbNode, claimName: string): string | null {
  for (const block of parent.body) {
    if (block.type === 'claim' && block.name === claimName) return claimAnchorId(parent, block)
  }
  return null
}

function termAnchorForKey(parent: KbNode, termKey: string): string | null {
  const term = parent.terms?.[termKey]
  return term ? termAnchorId(parent, termKey, term) : null
}

/** Identity of a citing node, or null when it is not something we can link to. */
function backlinkOrigin(
  graph: ContentGraph,
  owner: RefOwner,
): Omit<KbBacklink, 'refKey' | 'targetAnchor'> | null {
  if (owner.kind === 'definition' || owner.kind === 'theorem' || owner.kind === 'proof' || owner.kind === 'remark') {
    const node = owner.node
    const page = kbPageExists(graph, node) ? urlForKbNode(node) : null
    // Fall back to the embedding chapter when the citing node has no page in this
    // environment, so the backlink is still followable.
    const embedding = graph.embedding.get(entityKey(node.namespace, node.name))
    const href = page ?? (embedding ? `${chapterUrlOf(embedding.chapter)}#${entityAnchorId(node)}` : null)
    if (!href) return null
    return {
      ownerKind: owner.kind,
      ownerName: node.name,
      ownerTitle: kbNodeTitle(graph, node),
      ownerUrl: href,
    }
  }
  if (owner.kind === 'chapter') {
    return {
      ownerKind: 'chapter',
      ownerName: owner.node.name,
      ownerTitle: owner.node.title,
      ownerUrl: chapterUrlOf(owner.node),
    }
  }
  if (owner.kind === 'section') {
    return {
      ownerKind: 'section',
      ownerName: owner.node.name,
      ownerTitle: owner.node.title,
      ownerUrl: `${chapterUrlOf(owner.parent)}#${owner.node.slug}`,
    }
  }
  if (owner.kind === 'article' || owner.kind === 'newsletter' || owner.kind === 'page' || owner.kind === 'landing') {
    return {
      ownerKind: owner.kind,
      ownerName: owner.node.name,
      ownerTitle: owner.node.title,
      ownerUrl: urlForStandalone(owner.node),
    }
  }
  // standalone-section: the containing item is what has a URL, and it is yielded
  // separately by refOwners, so nothing is lost by skipping the section itself.
  return null
}

/**
 * Display title for a knowledge-base node.
 *
 * Definitions and theorems carry an authored `title`. Proofs and remarks normally
 * do not - they take one derived from their owner, which reads better than a bare
 * label and is why authoring 262 more titles was left out of the content
 * migration. Last resort is the chapter-scoped index plus the type label.
 */
export function kbNodeTitle(graph: ContentGraph, node: KbNode): string {
  if (node.title) return node.title
  const label = node.labels?.canonical ?? ENTITY_LABEL_HU[node.type] ?? node.type
  const capital = label.charAt(0).toUpperCase() + label.slice(1)

  if (node.type === 'proof') return `${capital}: ${kbNodeTitle(graph, node.proves)}`
  if (node.type === 'remark' && node.attachedTo) return `${capital}: ${kbNodeTitle(graph, node.attachedTo)}`

  const index = graph.embedding.get(entityKey(node.namespace, node.name))?.index
  return index ? `${index} ${capital}` : capital
}

/**
 * The glossary: one row per (defining node, term key).
 *
 * NOT one row per term key - 8 keys are defined by more than one node, and 9
 * canonical forms are duplicated, because the same word is genuinely introduced in
 * several contexts. Collapsing them would hide that. Terms are collected from all
 * four node types, proofs included: no content defines a term on a proof today,
 * but it is supported end to end and expected, so nothing here may assume
 * otherwise.
 */
function buildGlossary(graph: ContentGraph): GlossaryEntry[] {
  const entries: GlossaryEntry[] = []
  for (const node of kbNodes(graph)) {
    if (!node.terms || !kbPageExists(graph, node)) continue
    const pageUrl = urlForKbNode(node)
    if (!pageUrl) continue
    for (const [termKey, term] of Object.entries(node.terms)) {
      const anchor = termAnchorId(node, termKey, term)
      entries.push({
        termKey,
        canonical: term.canonical ?? termKey,
        ownerName: node.name,
        ownerTitle: kbNodeTitle(graph, node),
        href: `${pageUrl}#${anchor}`,
        referencedBy:
          graph.backlinks.get(`${entityKey(node.namespace, node.name)}#${anchor}`)?.length ?? 0,
      })
    }
  }
  return entries.sort(
    (a, b) =>
      a.canonical.localeCompare(b.canonical, 'hu') || a.ownerTitle.localeCompare(b.ownerTitle, 'hu'),
  )
}

/**
 * Every KB-context href must land on a page this build actually generates.
 *
 * The generated page set differs between a local and a deployed build (see
 * kbPageExists), so a link that works locally can 404 on staging. This turns that
 * class of mistake into a build failure instead of a post-deploy crawl finding.
 */
function validateKbLinks(graph: ContentGraph): void {
  const pages = new Set<string>()
  for (const node of kbNodes(graph)) {
    if (!kbPageExists(graph, node)) continue
    const url = urlForKbNode(node)
    if (url) pages.add(url)
  }
  for (const chapter of graph.chapters.values()) pages.add(chapterUrlOf(chapter))

  for (const entry of allRefEntries(graph)) {
    if (!entry.kbHref) continue
    const pathname = entry.kbHref.split('#')[0]
    if (!pages.has(pathname)) {
      throw new Error(
        `A '${entry.target.type}' reference resolves to '${entry.kbHref}', ` +
          `for which this build generates no page.`,
      )
    }
  }
}

function resolveRefHrefs(graph: ContentGraph): void {
  // A KB target with no page in this environment: its kbHref falls back to the
  // chapter anchor, which on a deployed build is the chapter's not-migrated stub.
  // Same policy as an unpublished standalone target - a stub, not a dead link.
  const warned = new Set<string>()
  const kbUrlOrFallback = (node: KbNode, chapterAnchorHref: string): string => {
    if (kbPageExists(graph, node)) {
      const url = urlForKbNode(node)
      if (url) return url
    }
    if (!warned.has(node.name)) {
      warned.add(node.name)
      console.warn(
        `Reference to ${node.type} "${node.name}" cannot use its knowledge-base page ` +
          `(embedded nowhere, or its chapter is unpublished); linking to the chapter instead.`,
      )
    }
    return chapterAnchorHref
  }

  for (const entry of allRefEntries(graph)) {
    if (entry.target.type === 'claim' || entry.target.type === 'term') {
      const target = entry.target
      const parentKey = entityKey(target.parent.namespace, target.parent.name)
      const parent = kbNodeByKey(graph, parentKey)
      const embedding = graph.embedding.get(parentKey)
      if (!parent || !embedding) {
        throw new Error(
          `Cannot resolve ${target.type} reference to "${target.name}" - its parent ` +
            `${target.parent.type} "${target.parent.name}" is not in the graph, or is embedded nowhere.`,
        )
      }
      const anchor = target.type === 'claim'
        ? claimAnchorForName(parent, target.name)
        : termAnchorForKey(parent, target.name)
      if (!anchor) {
        throw new Error(
          `Cannot resolve ${target.type} reference to "${target.name}" - no such ${target.type} ` +
            `on ${target.parent.type} "${target.parent.name}".`,
        )
      }
      entry.href = `${chapterUrlOf(embedding.chapter)}#${anchor}`
      entry.kbHref = `${kbUrlOrFallback(parent, entry.href)}#${anchor}`
    } else if (
      entry.target.type === 'definition' || entry.target.type === 'theorem' ||
      entry.target.type === 'proof'       || entry.target.type === 'remark'
    ) {
      const target = entry.target
      const key = entityKey(target.namespace, target.name)
      const node = kbNodeByKey(graph, key)
      const embedding = graph.embedding.get(key)
      if (!node || !embedding) {
        throw new Error(
          `Cannot resolve entity reference to ${target.type} "${target.name}" in ${target.namespace} - ` +
            `not in the graph, or embedded in no chapter (so it is rendered nowhere).`,
        )
      }
      entry.href = `${chapterUrlOf(embedding.chapter)}#${entityAnchorId(node)}`
      entry.kbHref = kbUrlOrFallback(node, entry.href)
    } else if (entry.target.type === 'book') {
      const target = entry.target
      const book = graph.books.get(bookKey(target.name))
      if (!book) {
        throw new Error(`Cannot resolve book reference to "${target.name}" - no such book in the content graph`)
      }
      // No published-gate here (unlike standalone targets): every book gets a
      // static index page and BookIndex renders regardless of `published`, so
      // the link is live either way.
      entry.href = urlForBook(book)
    } else if (entry.target.type === 'chapter') {
      const target = entry.target
      const chapter = graph.chapters.get(chapterKey(target.book, target.part, target.name))
      if (!chapter) {
        throw new Error(`Cannot resolve chapter reference to "${target.name}" in ${target.book}/${target.part}`)
      }
      entry.href = chapterUrlOf(chapter)
    } else if (entry.target.type === 'section') {
      const target = entry.target
      const section = graph.sections.get(sectionKey(target.book, target.part, target.chapter, target.name))
      if (!section) {
        throw new Error(`Cannot resolve section reference to "${target.name}" in ${target.book}/${target.part}/${target.chapter}`)
      }
      // Section slug is the localized in-page anchor id (see SectionView).
      entry.href = `${chapterUrlOf(section.chapter)}#${section.slug}`
    } else if (
      entry.target.type === 'article'  || entry.target.type === 'newsletter' ||
      entry.target.type === 'page'     || entry.target.type === 'landing'
    ) {
      const target = entry.target
      const node = standaloneMapFor(graph, target.type).get(standaloneKey(target.type, target.name))
      if (!node) {
        throw new Error(`Cannot resolve ${target.type} reference to "${target.name}" - no such ${target.type} in the content graph`)
      }
      // Unpublished targets resolve to the not-migrated stub rather than a dead
      // link, so this is a warning, not an error - the footer deliberately links
      // unpublished legal pages for the same reason.
      if (!node.published) {
        console.warn(
          `Reference to ${target.type} "${target.name}" points at an unpublished item; ` +
            `it will link to the not-migrated stub until 'published-at' is set.`,
        )
      }
      entry.href = urlForStandalone(node)
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

function resolveDisplayTemplates(graph: ContentGraph): void {
  for (const entry of allRefEntries(graph)) {
    if (!entry.display?.includes('{')) continue
    const ctx = buildContext(entry.target, graph)
    if (ctx) entry.display = resolveTemplate(entry.display, ctx).trim()
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
