#!/usr/bin/env node
/**
 * Build-time generator for sitemap `lastmod`. For every content object, records
 * the last-commit date of its source YAML in the content repo (the deploy checks
 * out the content ref — draft on staging, stable/released on production — as a
 * FULL clone, so per-file history is available). Emits a small map keyed by
 * `type:name` that app/sitemap.ts reads.
 *
 * `lastmod` = "content last modified" (git), deliberately NOT `published-at`
 * (which is the ORIGINAL publish date, kept for article:published_time / the
 * published gate). Using the git date reflects the actual last edit / migration,
 * which is the honest crawl-scheduling hint for freshly (re)published URLs.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
// Populates CONTENT_DIR from .env.local when not already exported (local dev);
// must be imported before it is read below. CI exports it, so this is a no-op there.
import './lib/load-env.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')
const outFile = path.join(websiteRoot, '.generated', 'content-lastmod.json')

function gitRoot() {
  try {
    return execFileSync('git', ['-C', contentDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  } catch { return null }
}

/**
 * `path relative to the git root` -> its last commit date, from ONE walk of the
 * history. A per-file `git log` would be a subprocess per content object, and the
 * knowledge base alone is 537 of them.
 *
 * The commit date is prefixed with a NUL so a date line cannot be confused with a
 * file name, and the first date seen for a path is the newest one because git logs
 * newest-first.
 */
function lastCommitDates(root) {
  const log = execFileSync(
    'git',
    ['-C', root, 'log', '--name-only', '--format=%x00%cI'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  )
  const dates = new Map()
  let commitDate = null
  for (const line of log.split('\n')) {
    if (line === '') continue
    if (line.startsWith('\0')) { commitDate = line.slice(1); continue }
    if (!dates.has(line)) dates.set(line, commitDate)
  }
  return dates
}

const map = {}
const root = existsSync(contentDir) ? gitRoot() : null
if (root) {
  // The type comes from the object's own `type` field rather than from its file
  // name: a knowledge-base entity's file is named after the entity, so a filename
  // map would see none of them. Every typed, named YAML document is recorded —
  // anything with no page of its own (a namespace) just yields a key nobody reads.
  const dates = lastCommitDates(root)
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.yaml')) continue
      let doc
      try { doc = yaml.load(readFileSync(p, 'utf8')) } catch { /* skip malformed */ }
      if (typeof doc?.type !== 'string' || typeof doc?.name !== 'string') continue
      const d = dates.get(path.relative(root, p))
      if (d) map[`${doc.type}:${doc.name}`] = d
    }
  }
  walk(contentDir)
}

mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(map))
console.log(
  `[gen-content-lastmod] ${Object.keys(map).length} entries -> ${path.relative(websiteRoot, outFile)}` +
    (root ? '' : ' (content dir is not a git checkout — empty map, sitemap omits lastmod)'),
)
