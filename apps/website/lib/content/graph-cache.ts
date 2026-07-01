import 'server-only'
import fs from 'fs'
import path from 'path'
import type { RawGraphData } from './graph'

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
    return JSON.parse(fs.readFileSync(getCachePath(), 'utf8')) as RawGraphData
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
