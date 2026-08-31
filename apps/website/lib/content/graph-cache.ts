import 'server-only'
import fs from 'fs'
import path from 'path'
import { RAW_GRAPH_VERSION, type RawGraphData } from './graph'

function getCachePath(): string {
  return path.join(process.cwd(), '.next', 'cache', 'content-graph.json')
}

export function writeRawCache(raw: RawGraphData): void {
  try {
    const file = getCachePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(raw))
  } catch {
    // Non-fatal: .next/cache may not exist yet on the very first cold start
  }
}

export function readRawCache(): RawGraphData | null {
  try {
    const cached = JSON.parse(fs.readFileSync(getCachePath(), 'utf8')) as RawGraphData
    // A cache written before a Raw*Entry field was added would rehydrate nodes
    // missing that field — e.g. a KB node with no `slug`, which then has no URL.
    // Treat a version mismatch as a cache miss and re-read the YAML.
    if (cached?.version !== RAW_GRAPH_VERSION) return null
    return cached
  } catch {
    return null
  }
}

export function deleteRawCache(): void {
  try {
    fs.unlinkSync(getCachePath())
  } catch {
    // Ignore ENOENT
  }
}
