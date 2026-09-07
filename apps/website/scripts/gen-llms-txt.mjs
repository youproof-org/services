/**
 * Build-time generator for `public/llms.txt` — the short map of the site that an
 * LLM or an AI crawler is meant to read first (llmstxt.org). `next build` copies
 * `public/` into the export, so this lands at `/llms.txt`.
 *
 * ## Generated rather than authored
 *
 * Everything countable in it — how many definitions, how many theorems, how many
 * glossary rows, how many chapters — is a property of the content, and the content
 * changes every release. A hand-kept file stating those numbers is a file that
 * starts lying the next time anyone publishes a chapter, and nothing would ever
 * report it. So the numbers come from the graph, through the SAME functions the
 * visible pages are built from: `kbPublishedCount` (the knowledge-base root's cards
 * and the two index pages' own count lines), `glossaryRows` (the glossary page's),
 * and the count labels out of `locales.json`. A reader, a crawler reading the
 * JSON-LD, and a model reading this file are then told one number in one wording.
 *
 * URLs come from the `urlFor*` helpers for the same reason: nothing here knows what
 * a knowledge-base path looks like, so moving one moves this file with it.
 *
 * ## Curated rather than exhaustive
 *
 * The 537 entity pages are deliberately NOT listed. That list already exists twice
 * — in the sitemaps, and in the index pages' own markup — and a third copy here
 * would be some 40 KiB of links restating what the two links above them lead to.
 * The convention asks for a map, not a dump. `/sitemap.xml` is linked instead, so
 * a consumer that does want the full enumeration is one hop from it.
 *
 * ## Hungarian
 *
 * The site is Hungarian and every page this file points at is Hungarian, so the
 * file is too, and it names things exactly as the pages name themselves — the page
 * names and the count phrasings are read out of the locale dictionary rather than
 * written here a second time. The connecting prose is the one part authored in
 * place, and it is authored for `DEFAULT_LOCALE`; a second locale would need a
 * decision about whether `/llms.txt` stays one file or becomes one per locale,
 * which is a question this generator should not answer by accident.
 *
 * ## How it is run
 *
 * Under `tsx` with the `server-only` shim — `node --import tsx --import
 * ./test/support/register.mjs` — because the content graph is TypeScript that
 * imports a specifier only a bundler resolves. That is the same entry the unit
 * suite and the browser suite's fixture derivation use; running this as bare
 * `node` fails at the first import.
 *
 * `scripts/check-llms-txt.mjs` gates the result: it re-derives every count from the
 * graph and resolves every link against the export.
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Populates CONTENT_DIR (and DEFAULT_LOCALE) from .env.local when not already
// exported; must come before anything that reads the graph. CI exports them, so
// this is a no-op there.
import './lib/load-env.mjs'
import * as graphModule from '../lib/content/graph.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as kbSectionsModule from '../lib/content/kb-sections.ts'
import * as glossaryModule from '../lib/content/glossary-rows.ts'
import * as collateModule from '../lib/content/collate.ts'
import * as configModule from '../lib/i18n/config.ts'
import * as metadataModule from '../lib/i18n/metadata.ts'

// tsx's ESM→CJS translation puts a module's exports behind `default` on some Node
// versions and not on others; `pick` covers both, as it does in derive-fixtures.
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
const { compareHu } = pick(collateModule)
const { DEFAULT_LOCALE, getLocaleConfig, getLocaleLabel, formatLocaleLabel } = pick(configModule)
const { absoluteUrl, pageTitleOf } = pick(metadataModule)

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outFile = path.join(websiteRoot, 'public', 'llms.txt')

const graph = await buildContentGraph()
const locale = DEFAULT_LOCALE
const config = getLocaleConfig(locale)

const label = (key) => getLocaleLabel(locale, key)
const counted = (key, count) => formatLocaleLabel(locale, key, { count })

const kbPages = [...kbNodes(graph)].filter(
  (node) => node.locale === locale && kbPageExists(graph, node),
).length
const definitions = kbPublishedCount(graph, graph.definitions, locale)
const theorems = kbPublishedCount(graph, graph.theorems, locale)
const glossaryNames = glossaryRows(graph.glossary).length
const glossaryTerms = graph.glossary.length

// Ordered by title through the site's one Hungarian collator, so the file has a
// stable order whatever order the loader happened to build the map in.
const books = [...graph.books.values()]
  .filter((book) => book.locale === locale)
  .sort((a, b) => compareHu(pageTitleOf(a), pageTitleOf(b)))

/** How many chapters of a book this environment actually serves as a page. */
const publishedChapters = (book) =>
  book.parts.reduce((total, part) => total + part.chapters.filter((c) => c.published).length, 0)

const sections = [
  {
    heading: label('knowledgeBase'),
    entries: [
      {
        name: label('knowledgeBase'),
        url: urlForKbRoot(locale),
        description: `${label('kbIntro')} ${kbPages} önálló lap: definíciók, tételek, bizonyítások és megjegyzések.`,
      },
      {
        name: label('definitionsIndex'),
        url: urlForDefinitionsIndex(locale),
        description: `${counted('kbDefinitionsCount', definitions)}, címük szerinti magyar betűrendben.`,
      },
      {
        name: label('theoremsIndex'),
        url: urlForTheoremsIndex(locale),
        description: `${counted('kbTheoremsCount', theorems)}, címük szerinti magyar betűrendben.`,
      },
      {
        name: label('glossary'),
        url: urlForGlossary(locale),
        description:
          `${counted('kbGlossaryCount', glossaryNames)} — ${counted('kbGlossaryCountNote', glossaryTerms)}. ` +
          `Minden sor a fogalmat bevezető lapra mutat.`,
      },
    ],
  },
  {
    heading: 'Könyvek',
    entries: books.map((book) => ({
      // `pageTitleOf`, so a book is called here what its own `<title>` and its
      // structured data call it. A book's display title is the series name
      // ("Alice és Bob"); its crawler title says what the book is about, which is
      // what a consumer matching this file against the page has to go on.
      name: pageTitleOf(book),
      url: urlForBook(book),
      description: `${publishedChapters(book)} megjelent fejezet, részekbe rendezve.`,
    })),
  },
  {
    heading: 'Egyéb',
    entries: [
      { name: label('home'), url: homeUrl(locale), description: 'A portál nyitólapja.' },
      { name: 'Oldaltérkép', url: '/sitemap.xml', description: 'Minden lap URL-je, típusonként bontva.' },
    ],
  },
]

const bullet = (entry) => `- [${entry.name}](${absoluteUrl(entry.url)}): ${entry.description}`

const document = [
  `# ${config.siteName}`,
  '',
  `> ${config.defaultDescription}`,
  '',
  'A könyvek fejezetei összefüggő szöveget adnak; a tudásbázis ugyanennek az anyagnak a',
  'definícióit, tételeit, bizonyításait és megjegyzéseit teszi külön lapokra,',
  'kereszthivatkozásokkal összekötve. Minden lap magyar nyelvű.',
  '',
  'Ez a fájl a belépési pontokat sorolja fel, nem az összes lapot: a teljes listát az',
  'oldaltérkép és az alábbi indexlapok adják. A számokat a build a tartalomból származtatja.',
  ...sections.flatMap((section) => ['', `## ${section.heading}`, '', ...section.entries.map(bullet)]),
  '',
].join('\n')

mkdirSync(path.dirname(outFile), { recursive: true })
writeFileSync(outFile, document)

const links = sections.reduce((total, section) => total + section.entries.length, 0)
console.log(
  `[gen-llms-txt] ${locale}: ${sections.length} section(s), ${links} link(s), ` +
    `${kbPages} knowledge-base page(s) (${definitions} definitions, ${theorems} theorems, ` +
    `${glossaryNames} glossary rows), ${books.length} book(s) -> ` +
    `${path.relative(websiteRoot, outFile)}, ${statSync(outFile).size} B`,
)
