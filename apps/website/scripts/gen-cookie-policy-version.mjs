#!/usr/bin/env node
/**
 * Build-time generator for the consent-policy data the cookie banner needs:
 * the policy version that drives re-prompting, and the pages to link as "read
 * more".
 *
 * Both come from the content repo, not from a constant here. A page declares
 * itself consent-relevant by carrying `cookie-policy-version` in its front
 * matter; this script collects those pages, checks they agree on the version,
 * and writes .generated/consent-policy.json.
 *
 * Output goes to the gitignored .generated/ directory. It is imported by client
 * code, so every entry point that needs it runs this first — `predev`,
 * `prebuild`, and the `typecheck` script. Deliberately NOT a committed stub: a
 * tracked file that every dev run rewrites shows up as a permanent spurious diff
 * and eventually gets committed by accident.
 *
 * With no content checkout this still writes a valid file with version 0, so a
 * fresh clone works and CI can typecheck without cloning the content repo.
 *
 * No published-at gate: app/[locale]/[[...path]]/page.tsx enumerates every page
 * in the graph regardless of publish state, so a linked policy page cannot 404
 * for being unpublished.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'
// Populates CONTENT_DIR from .env.local when not already exported (local dev);
// must be imported before it is read below. CI exports it, so this is a no-op there.
import './lib/load-env.mjs'
import { reduceCookiePolicyPages } from './lib/cookie-policy-version.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const websiteRoot = path.resolve(__dirname, '..')
const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')
const pagesDir = path.join(contentDir, 'pages')
const outFile = path.join(websiteRoot, '.generated', 'consent-policy.json')

const entries = []
if (existsSync(pagesDir)) {
  for (const dir of readdirSync(pagesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    const file = path.join(pagesDir, dir.name, 'page.yaml')
    if (!existsSync(file)) continue
    entries.push({
      relPath: path.relative(contentDir, file),
      doc: yaml.load(readFileSync(file, 'utf8')),
    })
  }
}

// Malformed or contradictory input throws: a wrong consent version is a
// compliance bug, so fail the build rather than ship a guess.
const result = reduceCookiePolicyPages(entries)

mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`)

const summary =
  result.cookiePolicyVersion === 0
    ? 'no cookie-policy-version found in content — consent UI stays OFF in this build'
    : `version ${result.cookiePolicyVersion}, ${result.pages.length} policy page(s): ` +
      result.pages.map((p) => `${p.locale}/${p.slug}`).join(', ')
console.log(`[gen-cookie-policy-version] ${summary} -> ${path.relative(websiteRoot, outFile)}`)
