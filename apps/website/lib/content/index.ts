import 'server-only'
import { loadRawGraphData, buildGraphFromRaw } from './graph'
import { readRawCache, writeRawCache, deleteRawCache } from './graph-cache'
import type { ContentGraph, StandaloneNode } from './types'

// Use a Node.js global so the singleton survives across module re-evaluations
// within the same webpack context (e.g. the (instrument) context).
const g = global as typeof global & {
  __contentGraph?: ContentGraph
  __reloadListeners?: Set<() => void>
}

function getReloadListeners(): Set<() => void> {
  if (!g.__reloadListeners) g.__reloadListeners = new Set()
  return g.__reloadListeners
}

export function onGraphReload(listener: () => void): () => void {
  const listeners = getReloadListeners()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyGraphReload(): void {
  for (const listener of getReloadListeners()) listener()
}

export async function initContentGraph(): Promise<void> {
  if (g.__contentGraph) return

  const isDev = process.env.NODE_ENV === 'development'

  // In dev mode: try to restore from the file cache written by a previous
  // build. This lets the (rsc) webpack context skip the 530+ YAML file reads
  // that the (instrument) context already performed at startup.
  if (isDev) {
    const cached = readRawCache()
    if (cached) {
      g.__contentGraph = buildGraphFromRaw(cached)
      return
    }
  }

  console.log('[youproof] Building content graph...')
  const start = Date.now()
  const raw = await loadRawGraphData()
  if (isDev) writeRawCache(raw)
  g.__contentGraph = buildGraphFromRaw(raw)
  const elapsed = Date.now() - start
  console.log(
    `[youproof] Content graph ready in ${elapsed}ms — ` +
      `${g.__contentGraph.definitions.size} definitions, ` +
      `${g.__contentGraph.theorems.size} theorems, ` +
      `${g.__contentGraph.proofs.size} proofs, ` +
      `${g.__contentGraph.remarks.size} remarks, ` +
      `${g.__contentGraph.chapters.size} chapters`
  )
}

export function invalidateContentGraph(): void {
  delete g.__contentGraph
  if (process.env.NODE_ENV === 'development') deleteRawCache()
}

export function getContentGraph(): ContentGraph {
  if (!g.__contentGraph) throw new Error('Content graph has not been initialised. Check instrumentation.ts.')
  return g.__contentGraph
}

// Published standalone items (article/newsletter/page/landing) sorted by
// publish datetime, most-recent first. Use for anything that must NOT surface
// unmigrated content (e.g. the sitemap).
export function listPublished(map: Map<string, StandaloneNode>): StandaloneNode[] {
  return Array.from(map.values())
    .filter((n) => n.published)
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
}

// All standalone items, published first (most-recent), then the unmigrated ones
// (no publishedAt) last. Use for listings that should still show unmigrated
// items — they link to a not-migrated stub, mirroring how the book table of
// contents lists unmigrated chapters.
export function listAll(map: Map<string, StandaloneNode>): StandaloneNode[] {
  return Array.from(map.values())
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
}

export type { ContentGraph }
export type {
  ThumbnailImage,
  BookNode,
  PartNode,
  ChapterNode,
  SectionNode,
  StandaloneNode,
  StandaloneKind,
  StandaloneSection,
  ItemList,
  DefinitionNode,
  TheoremNode,
  ProofNode,
  RemarkNode,
  ContentBlock,
  NarrativeBlock,
  FormulaBlock,
  FigureBlock,
  EmbedBlock,
  RecallBlock,
  ListBlock,
  TypewriterBlock,
  RefMap,
  RefTarget,
} from './types'
