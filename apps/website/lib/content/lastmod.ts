import { readFileSync } from 'fs'
import path from 'path'
import type { KbNode } from './types'

/**
 * When each piece of content was last edited, as the prebuild step recorded it.
 *
 * `scripts/gen-content-lastmod.mjs` walks the content checkout and writes the last
 * git-commit date of every source file into `.generated/content-lastmod.json`,
 * keyed `{type}:{name}`. That is the "content last modified" hint — distinct from
 * `published-at`, which is when a chapter first went out and never moves again.
 *
 * Missing or unreadable (a content directory that is not a git checkout, a build
 * that skipped the generator) is not an error: every consumer treats "no date" as
 * "say nothing", which is what a sitemap and a structured-data block both want
 * rather than a guessed one.
 *
 * Read once, at module load, because the file is written before the build starts
 * and cannot change during it.
 *
 * Two consumers read this map — `app/sitemap.ts` and `lib/content/structured-data.ts`
 * — and they must key it the same way or one of them silently emits nothing. Hence
 * the key builders live here beside the map rather than in either caller.
 */
const LASTMOD: Record<string, string> = (() => {
  try {
    return JSON.parse(
      readFileSync(path.join(process.cwd(), '.generated', 'content-lastmod.json'), 'utf8'),
    )
  } catch {
    return {}
  }
})()

/** The raw recorded timestamp for one key, or undefined when there is none. */
export function contentLastmod(key: string): string | undefined {
  return LASTMOD[key] || undefined
}

/** The same, as a Date — what `MetadataRoute.Sitemap` expects. */
export function lastmodDate(key: string): Date | undefined {
  const value = contentLastmod(key)
  return value ? new Date(value) : undefined
}

/**
 * The most recent timestamp across a set of keys, as a Date.
 *
 * For a page that has no source file of its own — an index over items that do — so
 * it reports the freshest thing it lists.
 */
export function latestOf(keys: string[]): Date | undefined {
  const dates = keys.map((key) => LASTMOD[key]).filter(Boolean).sort()
  return dates.length ? new Date(dates[dates.length - 1]) : undefined
}

/**
 * A knowledge-base entity's key: its own source file is the one carrying its `type`
 * and `name`, which is exactly the pair the generator keys by.
 */
export function kbLastmodKey(node: KbNode): string {
  return `${node.type}:${node.name}`
}
