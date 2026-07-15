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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')
const outFile = path.join(websiteRoot, '.generated', 'content-lastmod.json')

const STRUCT = {
  'book.yaml': 'book', 'chapter.yaml': 'chapter', 'article.yaml': 'article',
  'newsletter.yaml': 'newsletter', 'page.yaml': 'page', 'landing.yaml': 'landing',
}

function isGitRepo() {
  try { execFileSync('git', ['-C', contentDir, 'rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' }); return true }
  catch { return false }
}
function gitDate(relPath) {
  try {
    const d = execFileSync('git', ['-C', contentDir, 'log', '-1', '--format=%cI', '--', relPath], { encoding: 'utf8' }).trim()
    return d || null
  } catch { return null }
}

const map = {}
const git = existsSync(contentDir) && isGitRepo()
if (git) {
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      const type = STRUCT[e.name]
      if (!type) continue
      let name
      try { name = yaml.load(readFileSync(p, 'utf8'))?.name } catch { /* skip malformed */ }
      if (!name) continue
      const d = gitDate(path.relative(contentDir, p))
      if (d) map[`${type}:${name}`] = d
    }
  }
  walk(contentDir)
}

mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify(map))
console.log(
  `[gen-content-lastmod] ${Object.keys(map).length} entries -> ${path.relative(websiteRoot, outFile)}` +
    (git ? '' : ' (content dir is not a git checkout — empty map, sitemap omits lastmod)'),
)
