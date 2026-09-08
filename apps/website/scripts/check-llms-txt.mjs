/**
 * Postbuild: `/llms.txt` must be true.
 *
 * `scripts/gen-llms-txt.mjs` writes `public/llms.txt` from the content graph, so
 * the file is correct by construction — as long as the generator actually ran.
 * That is exactly what nothing else in the build would notice: `public/` is
 * gitignored but not cleaned, so a `public/llms.txt` left behind by an earlier
 * build is copied into the export whether or not the generator is still wired into
 * `prebuild`. The failure mode is a file that looks right and states last month's
 * numbers, which is the one thing a generated file was supposed to rule out.
 *
 * So this gate reads the built file and checks it against the two things it makes
 * claims about, neither of them the generator:
 *
 *   1. **Every link resolves in the export.** The URLs come from the `urlFor*`
 *      helpers, so a link cannot be mistyped — but a page can stop being built
 *      (an index gated off, a book unpublished) and the helper would go on
 *      producing its address. Resolved against `out/` rather than over the
 *      network, so it gates the artefact being uploaded.
 *   2. **Every count matches the graph.** Re-derived here from `kbPublishedCount`
 *      and `glossaryRows` — the functions the pages themselves count with — and
 *      compared against the digits the file actually serves. This is what catches
 *      a stale file: its numbers are last build's, the graph's are this build's.
 *
 * Plus two things that keep it from passing vacuously: the file has to have the
 * shape the convention asks for (a title, a summary, sections of linked bullets),
 * and the knowledge-base counts have to be non-zero — a graph that loaded nothing
 * would otherwise agree with a file that claims nothing.
 *
 * Every URL in the file must be one this script has an expectation for. A new
 * section in the generator is therefore a deliberate edit here as well, rather
 * than a set of links and numbers that quietly nothing checks.
 *
 * Run under `tsx` with the `server-only` shim, like the generator — it reads the
 * same graph.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import './lib/load-env.mjs'
import * as graphModule from '../lib/content/graph.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as kbSectionsModule from '../lib/content/kb-sections.ts'
import * as glossaryModule from '../lib/content/glossary-rows.ts'
import * as configModule from '../lib/i18n/config.ts'
import * as metadataModule from '../lib/i18n/metadata.ts'

const pick = (m) => m.default ?? m
const { buildContentGraph, kbNodes, kbPageExists } = pick(graphModule)
const {
  homeUrl,
  urlForBook,
  urlForKbRoot,
  urlForDefinitionsIndex,
  urlForTheoremsIndex,
  urlForGlossary,
} = pick(urlsModule)
const { kbPublishedCount } = pick(kbSectionsModule)
const { glossaryRows } = pick(glossaryModule)
const { DEFAULT_LOCALE } = pick(configModule)
const { SITE_URL } = pick(metadataModule)

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')
const LLMS_TXT = path.join(OUT, 'llms.txt')

if (!existsSync(OUT)) {
  console.error('[check-llms-txt] no out/ directory — run after `next build`.')
  process.exit(1)
}

if (!existsSync(LLMS_TXT)) {
  console.error(
    `[check-llms-txt] the export has no llms.txt. It is written to public/ by ` +
      `scripts/gen-llms-txt.mjs,\n  which runs in prebuild — check that it is still there and ` +
      `that it succeeded.`,
  )
  process.exit(1)
}

let failed = false
const fail = (...lines) => {
  failed = true
  console.error(...lines)
}

// ---------------------------------------------------------------------------
// What the graph says
// ---------------------------------------------------------------------------

const graph = await buildContentGraph()
const locale = DEFAULT_LOCALE

const kbPages = [...kbNodes(graph)].filter(
  (node) => node.locale === locale && kbPageExists(graph, node),
).length
const definitions = kbPublishedCount(graph, graph.definitions, locale)
const theorems = kbPublishedCount(graph, graph.theorems, locale)
const glossaryNames = glossaryRows(graph.glossary).length
const glossaryTerms = graph.glossary.length

/**
 * URL -> the numbers its line must state, in the order it states them. An empty
 * array means the line makes no numeric claim, which is itself checked: a count
 * appearing where none belongs is as wrong as a wrong count.
 */
const expected = new Map([
  [urlForKbRoot(locale), [kbPages]],
  [urlForDefinitionsIndex(locale), [definitions]],
  [urlForTheoremsIndex(locale), [theorems]],
  [urlForGlossary(locale), [glossaryNames, glossaryTerms]],
  [homeUrl(locale), []],
  ['/sitemap.xml', []],
])
for (const book of graph.books.values()) {
  if (book.locale !== locale) continue
  const chapters = book.parts.reduce(
    (total, part) => total + part.chapters.filter((chapter) => chapter.published).length,
    0,
  )
  expected.set(urlForBook(book), [chapters])
}

// ---------------------------------------------------------------------------
// What the file says
// ---------------------------------------------------------------------------

const text = readFileSync(LLMS_TXT, 'utf8')
const lines = text.split('\n')

const titles = lines.filter((line) => line.startsWith('# '))
const summaries = lines.filter((line) => line.startsWith('> '))
const headings = lines.filter((line) => line.startsWith('## '))
const bulletLines = lines.filter((line) => line.startsWith('- '))

if (titles.length !== 1 || summaries.length !== 1 || headings.length === 0 || bulletLines.length === 0) {
  fail(
    `[check-llms-txt] llms.txt does not have the shape the convention asks for: ` +
      `${titles.length} title(s),\n  ${summaries.length} summary blockquote(s), ` +
      `${headings.length} section(s), ${bulletLines.length} link(s). It should be one ` +
      `'# ' title,\n  one '> ' summary, then '## ' sections of '- [name](url): description' ` +
      `bullets.`,
  )
}

/** `- [name](url): description` — the only line shape a section may hold. */
const BULLET = /^- \[([^\]]+)\]\(([^)]+)\): (.+)$/

const entries = []
for (const line of bulletLines) {
  const match = BULLET.exec(line)
  if (!match) {
    fail(`[check-llms-txt] a link line is not '- [name](url): description':\n  ${line}`)
    continue
  }
  entries.push({ name: match[1], url: match[2], description: match[3] })
}

console.log(
  `[check-llms-txt] ${entries.length} link(s) across ${headings.length} section(s), ` +
    `${Buffer.byteLength(text)} B, checked against the graph: ${kbPages} knowledge-base page(s), ` +
    `${definitions} definition(s), ${theorems} theorem(s), ${glossaryNames} glossary row(s) of ` +
    `${glossaryTerms} term(s).`,
)

// ---------------------------------------------------------------------------
// 1. Every link resolves in the export
// ---------------------------------------------------------------------------

/**
 * The file a URL is served from, or null. Three spellings because the export holds
 * all three: a page is `<path>.html`, a route with children can be
 * `<path>/index.html`, and a generated file like the sitemap is itself. A
 * directory of the same name is not an answer — `out/hu` exists as a folder
 * whether or not `/hu` is a page.
 */
function exportedFile(pathname) {
  const base = path.join(OUT, pathname)
  for (const candidate of [`${base}.html`, path.join(base, 'index.html'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const seen = new Set()
for (const entry of entries) {
  if (!entry.url.startsWith(`${SITE_URL}/`)) {
    fail(
      `[check-llms-txt] '${entry.name}' links to ${entry.url}, which is not on ${SITE_URL}. ` +
        `Every\n  link here is a pointer into this export, and an absolute URL for another host ` +
        `cannot be one.`,
    )
    continue
  }
  const pathname = entry.url.slice(SITE_URL.length)
  seen.add(pathname)

  if (exportedFile(pathname) === null) {
    fail(
      `[check-llms-txt] '${entry.name}' links to ${pathname}, which is not in the export. ` +
        `The URL comes\n  from a urlFor* helper, so the page it addresses has stopped being ` +
        `built — either drop the\n  entry or restore the page.`,
    )
  }

  // ------------------------------------------------------------------------
  // 2. Every count matches the graph
  // ------------------------------------------------------------------------

  const claim = expected.get(pathname)
  if (claim === undefined) {
    fail(
      `[check-llms-txt] nothing here knows what ${pathname} should say. Give it an entry in ` +
        `'expected'\n  — a link whose numbers this gate has no opinion about is a link that ` +
        `can go stale unnoticed.`,
    )
    continue
  }
  const stated = [...entry.description.matchAll(/\d+/g)].map((m) => Number(m[0]))
  if (stated.length !== claim.length || stated.some((n, i) => n !== claim[i])) {
    fail(
      `[check-llms-txt] ${pathname} states [${stated.join(', ')}] where the graph says ` +
        `[${claim.join(', ')}]:\n  ${entry.description}\n  A stale public/llms.txt is copied ` +
        `into the export whether or not the generator ran — check that prebuild still runs\n  ` +
        `scripts/gen-llms-txt.mjs.`,
    )
  }
}

// ---------------------------------------------------------------------------
// 3. The gate must not pass on an empty graph or a file that claims nothing
// ---------------------------------------------------------------------------

const required = [
  urlForKbRoot(locale),
  urlForDefinitionsIndex(locale),
  urlForTheoremsIndex(locale),
  urlForGlossary(locale),
]
for (const pathname of required) {
  if (!seen.has(pathname)) {
    fail(
      `[check-llms-txt] llms.txt does not link ${pathname}. The knowledge base is what the file ` +
        `is\n  mostly a map of; without its four entry points there is nothing here worth ` +
        `serving.`,
    )
  }
}

if (kbPages === 0 || definitions === 0 || theorems === 0 || glossaryNames === 0) {
  fail(
    `[check-llms-txt] the graph counts nothing (${kbPages} page(s), ${definitions} definition(s), ` +
      `${theorems} theorem(s),\n  ${glossaryNames} glossary row(s)), so agreeing with the file ` +
      `would mean nothing.`,
  )
}

if (failed) process.exit(1)
