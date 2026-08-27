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
  EmbeddingContext,
  GlossaryEntry,
  KbBacklinkSource,
  KbBacklinks,
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
  kbAnchorPath,
  sectionAnchorId,
  partAnchorId,
  ownPageScope,
  embeddedScope,
} from './urls'
import { compareHu } from './collate'
import {
  bookKey,
  partKey,
  chapterKey,
  sectionKey,
  standaloneKey,
  definitionKey,
  theoremKey,
  proofKey,
  remarkKey,
  keyForKbNode,
  keyForChapter,
  keyForSection,
} from './keys'
import { fqnJoin } from './fqn'
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
    glossary:    [],
    backlinks:   new Map(),
  }

  // Pass 0: resolve ownership, because a key needs it.
  //
  // A proof's key is `theorems.{t}.proofs.{p}` and a remark's nests under whatever
  // owns it, so neither can be keyed without knowing its owner — and ownership is
  // declared on the PARENT (a theorem lists its `proofs`, a definition its
  // `remarks`), not on the child. So the parent lists are indexed first, and in
  // dependency order: a remark's owner may be a proof, whose own key needs its
  // theorem.
  const theoremOfProof = new Map<string, string>()   // proof name -> theorem name
  for (const t of raw.theorems) {
    for (const proofName of t.proofSlugs) theoremOfProof.set(proofName, t.name)
  }
  const keyOfRemarkOwner = new Map<string, string>() // remark name -> owner's key
  for (const d of raw.definitions) {
    for (const r of d.remarkSlugs) keyOfRemarkOwner.set(r, definitionKey(d.name))
  }
  for (const t of raw.theorems) {
    for (const r of t.remarkSlugs) keyOfRemarkOwner.set(r, theoremKey(t.name))
  }
  for (const pf of raw.proofs) {
    const theoremName = theoremOfProof.get(pf.name)
    if (!theoremName) continue
    for (const r of pf.remarkSlugs) {
      keyOfRemarkOwner.set(r, proofKey(theoremName, pf.name))
    }
  }

  /** A proof's key, or null when no theorem claims it (an orphan; none in content). */
  const keyForRawProof = (name: string): string | null => {
    const theoremName = theoremOfProof.get(name)
    return theoremName ? proofKey(theoremName, name) : null
  }

  // Pass 1: Populate Maps
  for (const e of raw.definitions) {
    graph.definitions.set(definitionKey(e.name), {
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
    graph.theorems.set(theoremKey(e.name), {
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
    const key = keyForRawProof(e.name)
    if (!key) {
      console.warn(`Proof "${e.name}" is listed by no theorem, so it has no address; skipping.`)
      continue
    }
    graph.proofs.set(key, {
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
    const ownerKey = keyOfRemarkOwner.get(e.name)
    graph.remarks.set(ownerKey ? remarkKey(ownerKey, e.name) : fqnJoin('', 'remark', e.name), {
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
    const theorem = graph.theorems.get(theoremKey(theoremEntry.name))!
    for (const slug of theoremEntry.proofSlugs) {
      const proof = graph.proofs.get(proofKey(theoremEntry.name, slug))
      if (proof) {
        proof.proves = theorem
        theorem.proofs.push(proof)
      }
    }
  }

  const allRemarkParents: Array<{ key: string; remarkSlugs: string[] }> = [
    ...raw.definitions.map(e => ({ key: definitionKey(e.name), remarkSlugs: e.remarkSlugs })),
    ...raw.theorems.map(e => ({ key: theoremKey(e.name), remarkSlugs: e.remarkSlugs })),
    ...raw.proofs.flatMap(e => {
      const key = keyForRawProof(e.name)
      return key ? [{ key, remarkSlugs: e.remarkSlugs }] : []
    }),
  ]

  for (const { key, remarkSlugs } of allRemarkParents) {
    const parent = (graph.definitions.get(key) ?? graph.theorems.get(key) ?? graph.proofs.get(key)) as
      | DefinitionNode
      | TheoremNode
      | ProofNode
      | undefined
    if (!parent) continue
    for (const slug of remarkSlugs) {
      const remark = graph.remarks.get(remarkKey(key, slug))
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
        graph.chapters.set(chapterKey(book.name, chapter.name), chapter)

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
          graph.sections.set(sectionKey(book.name, chapter.name, section.name), section)
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
  // which chapter a node lives in. Then hrefs, since the glossary links to term
  // anchors and the validators check the hrefs those produce.
  graph.embedding = buildEmbedding(graph)
  validateIdentifiers(graph)
  resolveDisplayTemplates(graph)
  resolveSelfReferenceDisplayTemplates(graph)
  resolveRefHrefs(graph)
  graph.glossary = buildGlossary(graph)
  graph.backlinks = buildBacklinkIndex(graph)
  validateReferences(graph)
  validateTermInsertions(graph)
  validateKbLinks(graph)
  validateAnchors(graph)

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
// Knowledge-base derivation: embedding, page existence, glossary
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
    const key = block.target.fqn
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
    const { type, fqn } = block.target
    if (type === 'definition' || type === 'theorem') return true
    if (type === 'remark') {
      const remark = graph.remarks.get(fqn)
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
        const entry = info.get(block.target.fqn)
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
  const embedding = graph.embedding.get(keyForKbNode(node))
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
 * The anchors a claim/term reference resolves to, in BOTH contexts.
 *
 * An anchor is page-relative, so one claim has two of them: on its node's own page
 * the node drops out of the path (`allitasok.{slug}`), and inside the chapter that
 * embeds the node it does not (`definiciok.{d}.allitasok.{slug}`). That is the same
 * split `href`/`kbHref` already makes for the path half of the URL.
 *
 * `onPage` is what the glossary links to, and what a knowledge-base page renders
 * for its own claims and terms.
 */
interface AnchorPair {
  onPage: string
  inChapter: string
}

function claimAnchorsForName(parent: KbNode, claimName: string): AnchorPair | null {
  for (const block of parent.body) {
    if (block.type === 'claim' && block.name === claimName) {
      return {
        onPage: claimAnchorId(ownPageScope(parent), block),
        inChapter: claimAnchorId(embeddedScope(parent), block),
      }
    }
  }
  return null
}

function termAnchorsForKey(parent: KbNode, termKey: string): AnchorPair | null {
  const term = parent.terms?.[termKey]
  if (!term) return null
  return {
    onPage: termAnchorId(ownPageScope(parent), termKey, term),
    inChapter: termAnchorId(embeddedScope(parent), termKey, term),
  }
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

  const index = graph.embedding.get(keyForKbNode(node))?.index
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
 *
 * Each row carries the term's authored synonyms verbatim; the row itself stays one
 * per (defining node, term key), so a synonym is data on a row rather than a row of
 * its own. The glossary PAGE is an index of names and does want one row per synonym:
 * that expansion is `glossaryRows` in glossary-rows.ts, over these entries.
 */
function buildGlossary(graph: ContentGraph): GlossaryEntry[] {
  const entries: GlossaryEntry[] = []
  for (const node of kbNodes(graph)) {
    if (!node.terms || !kbPageExists(graph, node)) continue
    const pageUrl = urlForKbNode(node)
    if (!pageUrl) continue
    for (const [termKey, term] of Object.entries(node.terms)) {
      const anchor = termAnchorId(ownPageScope(node), termKey, term)
      entries.push({
        termKey,
        canonical: term.canonical ?? termKey,
        ownerName: node.name,
        ownerTitle: kbNodeTitle(graph, node),
        href: `${pageUrl}#${anchor}`,
        synonyms: term.synonyms ?? [],
      })
    }
  }
  return entries.sort(
    (a, b) => compareHu(a.canonical, b.canonical) || compareHu(a.ownerTitle, b.ownerTitle),
  )
}

/** A backlink row before its count is known - the source's identity and label. */
type BacklinkRow = Omit<KbBacklinkSource, 'count'>

/**
 * Does this build render the chapter's body, or only a stub in its place?
 *
 * The same environment rule `kbPageExists` applies to an embedded node, one level
 * up: on staging/production an unpublished chapter's route returns
 * `NotMigratedStub`/`UnavailableStub` instead of the chapter's content, while
 * locally it renders normally so drafts are previewable (see
 * app/[locale]/[[...path]]/page.tsx). The chapter URL resolves either way, so this
 * is not a question of whether a link is dead - it is whether there is anything
 * there to arrive at.
 */
function chapterBodyIsRendered(chapter: ChapterNode): boolean {
  return isDeployedEnv ? chapter.published : true
}

/**
 * Which backlink row an owner of references produces, or null if it produces none.
 *
 * A row is a link, so a source only earns one when this build generates something
 * for the row to land on. That drops an entity whose `kbPageExists` is false - the
 * row would be a 404, exactly the class of link `validateKbLinks` exists to
 * prevent - and, for the same reason one step weaker, a chapter or section whose
 * chapter renders as a stub: the URL resolves, but the chapter's body is not
 * there, so neither is the section anchor, and the row answers "where is this
 * used?" with a stub.
 *
 * Standalone items (articles, newsletters, pages, landings) and their sections are
 * skipped: a source is a place in the book that leans on this entity. No
 * standalone content cites a knowledge-base node today, so nothing is lost by it -
 * revisit if any ever does.
 */
function backlinkRowFor(graph: ContentGraph, owner: RefOwner): BacklinkRow | null {
  switch (owner.kind) {
    case 'chapter':
      if (!chapterBodyIsRendered(owner.node)) return null
      return {
        kind: 'chapter',
        fqn: keyForChapter(owner.node),
        title: owner.node.title,
        href: chapterUrlOf(owner.node),
      }
    case 'section':
      if (!chapterBodyIsRendered(owner.parent)) return null
      return {
        kind: 'section',
        fqn: keyForSection(owner.node),
        title: owner.node.title,
        href: `${chapterUrlOf(owner.parent)}#${sectionAnchorId(owner.node)}`,
      }
    case 'definition':
    case 'theorem':
    case 'proof':
    case 'remark': {
      const node = owner.node
      if (!kbPageExists(graph, node)) return null
      const href = urlForKbNode(node)
      if (!href) return null
      return { kind: owner.kind, fqn: keyForKbNode(node), title: kbNodeTitle(graph, node), href }
    }
    default:
      return null
  }
}

/**
 * Incoming references, keyed by the entity that OWNS the target.
 *
 * A reference aimed at a claim or a term is a reference to the entity holding it:
 * claims and terms have no page, so the owning entity's page is the only place an
 * incoming reference to them can be shown. Hence one index, keyed by the owning
 * entity, with `byTarget` keyed by the full target name carrying the per-claim and
 * per-term narrowings - no second index, and no filtering at render time.
 *
 * A row is a (target, source) pair with a count rather than one row per reference:
 * a section citing an entity five times is one row saying five, because five rows
 * would bury every other source and one row without a count would throw away how
 * heavily that section leans on the entity.
 *
 * Ordering is by count descending, ties broken by title.
 */
function buildBacklinkIndex(graph: ContentGraph): Map<string, KbBacklinks> {
  // owning entity -> target -> source -> row+count. The unfiltered `all` list
  // accumulates under ALL_TARGETS, which cannot collide with a real target: every
  // fully qualified name is a series of `container.name` pairs, so it has a dot.
  const ALL_TARGETS = '*'
  const counted = new Map<string, Map<string, Map<string, KbBacklinkSource>>>()

  const bump = (entityFqn: string, targetFqn: string, row: BacklinkRow) => {
    let byTarget = counted.get(entityFqn)
    if (!byTarget) counted.set(entityFqn, (byTarget = new Map()))
    let bySource = byTarget.get(targetFqn)
    if (!bySource) byTarget.set(targetFqn, (bySource = new Map()))
    const existing = bySource.get(row.fqn)
    if (existing) existing.count += 1
    else bySource.set(row.fqn, { ...row, count: 1 })
  }

  for (const owner of refOwners(graph)) {
    const refs = Object.values(owner.node.references)
    if (refs.length === 0) continue
    const row = backlinkRowFor(graph, owner)
    if (!row) continue

    for (const { target } of refs) {
      if (target.type === 'external') continue
      // The owning entity is the target itself when the target IS an entity, and
      // the target minus its trailing `.claims.{c}` / `.terms.{t}` step otherwise
      // - which is exactly `parentFqn`, already parsed. Everything else (a book, a
      // chapter, a section, a standalone item) is not a knowledge-base target.
      const entity = kbNodeByKey(graph, target.fqn)
        ?? (target.type === 'claim' || target.type === 'term'
          ? kbNodeByKey(graph, target.parentFqn)
          : undefined)
      if (!entity) continue
      const entityFqn = keyForKbNode(entity)
      bump(entityFqn, ALL_TARGETS, row)
      bump(entityFqn, target.fqn, row)
    }
  }

  // The site's one Hungarian collation (compareHu), so two lists of the same titles
  // cannot disagree about their order.
  const order = (a: KbBacklinkSource, b: KbBacklinkSource) =>
    b.count - a.count || compareHu(a.title, b.title)

  const index = new Map<string, KbBacklinks>()
  for (const [entityFqn, byTargetCounts] of counted) {
    let all: KbBacklinkSource[] = []
    const byTarget = new Map<string, KbBacklinkSource[]>()
    for (const [targetFqn, bySource] of byTargetCounts) {
      const rows = Array.from(bySource.values()).sort(order)
      if (targetFqn === ALL_TARGETS) all = rows
      else byTarget.set(targetFqn, rows)
    }
    index.set(entityFqn, { all, byTarget })
  }
  return index
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

/**
 * Every internal fragment must be an anchor some page actually renders.
 *
 * What this catches: a fragment that names something the target page has no
 * business rendering — a claim that does not exist on that node, a stale anchor
 * left behind by a rename, a claim/term anchor resolved in the wrong context (the
 * two contexts disagree by design: a chapter page renders
 * `definiciok.{d}.fogalmak.{f}`, the definition's own page renders `fogalmak.{f}`).
 *
 * What this CANNOT catch: a component rendering a different `id` than the builder
 * put in the href. Both sides here derive from the same builder, so on that
 * question the check agrees with itself by construction. That gap is closed by
 * `scripts/check-anchors.mjs`, which reads the built HTML — ids on one side, hrefs
 * on the other, nothing from the graph — as a postbuild step.
 */
function validateAnchors(graph: ContentGraph): void {
  // page URL -> the ids that page renders
  const rendered = new Map<string, Set<string>>()
  const add = (url: string, anchor: string) => {
    const set = rendered.get(url)
    if (set) set.add(anchor)
    else rendered.set(url, new Set([anchor]))
  }

  // A book index page renders one anchor per part.
  for (const book of graph.books.values()) {
    const url = urlForBook(book)
    rendered.set(url, rendered.get(url) ?? new Set())
    for (const part of book.parts) add(url, partAnchorId(part))
  }

  // A chapter page renders its sections, plus every entity embedded in it and
  // that entity's claims and terms, in chapter context.
  for (const chapter of graph.chapters.values()) {
    const url = chapterUrlOf(chapter)
    rendered.set(url, rendered.get(url) ?? new Set())
    for (const section of chapter.sections) add(url, sectionAnchorId(section))
  }
  for (const node of kbNodes(graph)) {
    const embedding = graph.embedding.get(keyForKbNode(node))
    if (!embedding) continue
    const url = chapterUrlOf(embedding.chapter)
    add(url, kbAnchorPath(node))
    for (const [a, scope] of [
      [url, embeddedScope(node)] as const,
    ]) {
      for (const block of node.body) {
        if (block.type === 'claim') add(a, claimAnchorId(scope, block))
      }
      for (const [termKey, term] of Object.entries(node.terms ?? {})) {
        add(a, termAnchorId(scope, termKey, term))
      }
    }
  }

  // A knowledge-base page renders its own claims and terms, page-relative.
  for (const node of kbNodes(graph)) {
    if (!kbPageExists(graph, node)) continue
    const url = urlForKbNode(node)
    if (!url) continue
    rendered.set(url, rendered.get(url) ?? new Set())
    const scope = ownPageScope(node)
    for (const block of node.body) {
      if (block.type === 'claim') add(url, claimAnchorId(scope, block))
    }
    for (const [termKey, term] of Object.entries(node.terms ?? {})) {
      add(url, termAnchorId(scope, termKey, term))
    }
  }

  // Standalone items render their sections, using the item's locale.
  for (const kind of ['article', 'newsletter', 'page', 'landing'] as const) {
    for (const node of standaloneMapFor(graph, kind).values()) {
      const url = urlForStandalone(node)
      rendered.set(url, rendered.get(url) ?? new Set())
      for (const section of node.sections) {
        add(url, sectionAnchorId({ slug: section.slug, locale: node.locale }))
      }
    }
  }

  const check = (href: string | undefined, what: string) => {
    if (!href) return
    const hash = href.indexOf('#')
    if (hash === -1) return
    const [pathname, anchor] = [href.slice(0, hash), href.slice(hash + 1)]
    const set = rendered.get(pathname)
    // A page this build does not generate is validateKbLinks' business, not ours.
    if (!set) return
    if (!set.has(anchor)) {
      throw new Error(
        `A ${what} resolves to '${href}', but '${pathname}' renders no element with ` +
          `id '${anchor}'. Anchors known on that page: ${[...set].sort().slice(0, 8).join(', ')}` +
          `${set.size > 8 ? ` (+${set.size - 8} more)` : ''}.`,
      )
    }
  }

  for (const entry of allRefEntries(graph)) {
    check(entry.href, `'${entry.target.type}' reference (chapter context)`)
    check(entry.kbHref, `'${entry.target.type}' reference (knowledge-base context)`)
  }
  for (const row of graph.glossary) check(row.href, `glossary row for term "${row.termKey}"`)
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
      // The parent's key IS the path minus the leaf, so no reconstruction.
      const parent = kbNodeByKey(graph, target.parentFqn)
      const embedding = graph.embedding.get(target.parentFqn)
      if (!parent || !embedding) {
        throw new Error(
          `Cannot resolve ${target.type} reference '${target.fqn}' - its parent ` +
            `'${target.parentFqn}' is not in the graph, or is embedded nowhere.`,
        )
      }
      const anchors = target.type === 'claim'
        ? claimAnchorsForName(parent, target.name)
        : termAnchorsForKey(parent, target.name)
      if (!anchors) {
        throw new Error(
          `Cannot resolve ${target.type} reference '${target.fqn}' - '${target.parentFqn}' ` +
            `has no ${target.type} named "${target.name}".`,
        )
      }
      // Two contexts, two anchors: the chapter page renders the node embedded, so
      // the path carries the node; its own page does not.
      entry.href = `${chapterUrlOf(embedding.chapter)}#${anchors.inChapter}`
      const kbPage = kbUrlOrFallback(parent, entry.href)
      entry.kbHref = kbPage === entry.href
        // Fell back to the chapter anchor, which already carries its own fragment.
        ? entry.href
        : `${kbPage}#${anchors.onPage}`
    } else if (
      entry.target.type === 'definition' || entry.target.type === 'theorem' ||
      entry.target.type === 'proof'       || entry.target.type === 'remark'
    ) {
      const target = entry.target
      const node = kbNodeByKey(graph, target.fqn)
      const embedding = graph.embedding.get(target.fqn)
      if (!node || !embedding) {
        throw new Error(
          `Cannot resolve entity reference '${target.fqn}' - not in the graph, or embedded ` +
            `in no chapter (so it is rendered nowhere).`,
        )
      }
      entry.href = `${chapterUrlOf(embedding.chapter)}#${kbAnchorPath(node)}`
      entry.kbHref = kbUrlOrFallback(node, entry.href)
    } else if (entry.target.type === 'book') {
      const target = entry.target
      const book = graph.books.get(target.fqn)
      if (!book) {
        throw new Error(`Cannot resolve book reference to "${target.name}" - no such book in the content graph`)
      }
      // No published-gate here (unlike standalone targets): every book gets a
      // static index page and BookIndex renders regardless of `published`, so
      // the link is live either way.
      entry.href = urlForBook(book)
    } else if (entry.target.type === 'chapter') {
      const target = entry.target
      const chapter = graph.chapters.get(target.fqn)
      if (!chapter) {
        throw new Error(`Cannot resolve chapter reference '${target.fqn}' - no such chapter.`)
      }
      entry.href = chapterUrlOf(chapter)
    } else if (entry.target.type === 'section') {
      const target = entry.target
      const section = graph.sections.get(target.fqn)
      if (!section) {
        throw new Error(`Cannot resolve section reference '${target.fqn}' - no such section.`)
      }
      entry.href = `${chapterUrlOf(section.chapter)}#${sectionAnchorId(section)}`
    } else if (
      entry.target.type === 'article'  || entry.target.type === 'newsletter' ||
      entry.target.type === 'page'     || entry.target.type === 'landing'
    ) {
      const target = entry.target
      const node = standaloneMapFor(graph, target.type as StandaloneKind).get(target.fqn)
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
