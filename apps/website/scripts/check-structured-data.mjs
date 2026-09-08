#!/usr/bin/env node
/**
 * Postbuild: the JSON-LD in the export must parse, and its identifiers must join up.
 *
 * A structured-data block fails silently. A browser never draws it, no test renders
 * it, and a crawler that cannot read it simply moves on — so a block that stopped
 * being emitted, or started naming addresses nothing serves, would look exactly like
 * one that works. That is what this gates, against the built export rather than
 * against the graph: `lib/content/structured-data.ts` and the URL helpers it composes
 * agree with themselves by construction, and the failure worth catching is the id
 * scheme drifting from the addresses the export actually has.
 *
 * ## What is asserted
 *
 *   1. **Exactly one block per knowledge-base page.** A second block is a second set
 *      of statements that can contradict the first. Pages are identified by the panel
 *      they serve (`id="kb-panel"`, the literal `components/kb/Panel.tsx` keeps for
 *      this) rather than by a path prefix written down here, so the gate cannot be
 *      satisfied by a build that stopped producing entity pages.
 *   2. **Every block parses, and is one `@context` over one `@graph`.**
 *   3. **Every `@type` is one this design uses**, and every node carries the
 *      properties its type is described by. The list is an allow-list: a new type is
 *      a deliberate edit here, not a shape that quietly nothing checks.
 *   4. **`@id`s are unique within a page — counting declarations only.** A node whose
 *      sole key is `@id` is a REFERENCE to something described elsewhere, and a page
 *      legitimately carries many of them pointing at the same id. Only the members of
 *      the top-level `@graph` declare, so only those are counted; counting references
 *      turns a correct export into thousands of failures.
 *   5. **Every address the block states resolves.** For `@id`, `item`, `citation`,
 *      `url` and `logo`: strip the fragment, and a URL on this export's own origin
 *      must have a file behind it. Off-origin URLs are counted and skipped — the prose
 *      genuinely cites Wikipedia and the OEIS, and those are outgoing references we do
 *      not host — but an address on our own origin gets no such pass, or a typo in a
 *      path would read as someone else's site. `@context`, `additionalType` and
 *      `itemListOrder` are excluded: they name concepts on another authority, not
 *      addresses.
 *
 *      One requirement, not two. The rule is usually stated as "the fragment-stripped
 *      URL is in the export, OR the fragment is one the declaring page carries", and
 *      the second alternative is either vacuous or ruinous depending on how it is
 *      read. Read literally — the URL's base IS this page — it adds nothing, because
 *      the page we are reading is in the export by definition. Read loosely — any
 *      fragment this page declares — it exempts every `#theorem`, `#proof` and
 *      `#breadcrumb` id from the base check, which is exactly the drift this rule
 *      exists to catch. Nothing needs the escape: `https://<host>/#website` is
 *      declared on the locale root and its base is `/`, which the export carries as
 *      the `noindex` stub.
 *   6. **`BreadcrumbList` has the shape Google documents:** `ListItem` members whose
 *      `position` runs 1..n in order, each named, each carrying an `item` except the
 *      last — the last is the page itself and Google's convention is to omit it.
 *   7. **No page declares an inbound reference.** Two ways: no `@reverse` and no
 *      inbound-sounding property, and — the load-bearing one — every `citation`
 *      target is an address the page's OWN served markup already links. An inbound
 *      reference names a page that cites this one, which this page's prose does not
 *      link and whose row is deliberately not in the markup at all
 *      (`DEFERRED_PANEL_KINDS` in `components/kb/KbEntityPage.tsx`), so it cannot
 *      pass that test. This is what keeps the block's edges the transpose-free set
 *      the whole design rests on.
 *
 * ## Why it cannot pass vacuously
 *
 * An export with no blocks, or with a page kind's block silently dropped, would
 * satisfy every rule above by having nothing to break. So the census is asserted too:
 * every type in the allow-list must occur somewhere in the export, and the pages that
 * serve a panel must all be accounted for. Deleting the `DefinedTerm` branch, or the
 * `Organization` and `WebSite` nodes, fails this rather than passing it.
 *
 * ## The origin comes from the export
 *
 * `SITE_URL` is built from `SITE_HOST`, which the deploy workflow sets per
 * environment, so "our own origin" is not a constant this script may hard-code. It is
 * read from the `rel="canonical"` links the export serves, and the pages must agree on
 * one — which is worth knowing on its own.
 *
 * ## Not checked here
 *
 * That the vocabulary says what we mean. Google's Rich Results Test and
 * validator.schema.org are the tools for that, by hand, on staging, once per page
 * kind. This gate is about what a machine can decide.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')

/** `PANEL_ID` in `components/kb/Panel.tsx`, which is a literal there for this reason. */
const PANEL_ID = 'kb-panel'

/**
 * Every `@type` the builder emits, mapped to the properties a node of that type is
 * useless without. Not schema.org's full vocabulary — that is a download and a
 * moving target — but the closed set this design chose, so an unknown type is
 * reported rather than assumed valid.
 */
const TYPES = {
  Organization: ['@id', 'name', 'url'],
  WebSite: ['@id', 'name', 'url'],
  WebPage: ['@id', 'url', 'name'],
  CollectionPage: ['@id', 'url', 'name'],
  CreativeWork: ['@id', 'name'],
  Chapter: ['@id', 'name'],
  Book: ['@id', 'name'],
  BreadcrumbList: ['@id', 'itemListElement'],
  ListItem: ['position', 'name'],
  ItemList: ['@id', 'name', 'numberOfItems'],
  DefinedTerm: ['@id', 'name', 'inDefinedTermSet'],
  DefinedTermSet: ['@id', 'name'],
}

/** Keys whose string values are addresses, rather than names of concepts. */
const ADDRESS_KEYS = new Set(['@id', 'item', 'citation', 'url', 'logo'])

/**
 * Properties that would state an inbound edge. `@reverse` is JSON-LD's own mechanism
 * for one, and the rest are the schema.org spellings someone reaching for "what cites
 * this" would land on.
 */
const INBOUND_KEYS = ['@reverse', 'citedBy', 'isCitedBy', 'isReferencedBy', 'hasCitation']

if (!existsSync(OUT)) {
  console.error('[check-structured-data] no out/ directory — run after `next build`.')
  process.exit(1)
}

let failed = false
const fail = (...lines) => {
  failed = true
  console.error(...lines)
}

function htmlFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...htmlFiles(full))
    else if (entry.name.endsWith('.html')) found.push(full)
  }
  return found
}

/**
 * The file a pathname is served from, or null. Three spellings, because the export
 * holds all three: a page is `<path>.html`, a route with children can be
 * `<path>/index.html`, and an asset is itself. A directory of the same name is not an
 * answer — `out/hu` exists as a folder whether or not `/hu` is a page.
 */
function exportedFile(pathname) {
  const base = path.join(OUT, pathname === '/' ? '' : pathname)
  for (const candidate of [`${base}.html`, path.join(base, 'index.html'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const files = htmlFiles(OUT)

// ---------------------------------------------------------------------------
// The origin this export was built for
// ---------------------------------------------------------------------------

const origins = new Set()
for (const file of files) {
  const match = /<link[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"/.exec(readFileSync(file, 'utf8'))
  if (match) {
    try {
      origins.add(new URL(match[1]).origin)
    } catch {
      /* a canonical that is not a URL is app/[locale] metadata's problem, not this gate's */
    }
  }
}

if (origins.size !== 1) {
  console.error(
    `[check-structured-data] the export's pages name ${origins.size} canonical origin(s) ` +
      `(${[...origins].join(', ') || 'none'}).\n  This gate needs one, to tell an address it must ` +
      `resolve from an outgoing reference to someone else's site.`,
  )
  process.exit(1)
}
const [ORIGIN] = origins

// ---------------------------------------------------------------------------
// Read every block
// ---------------------------------------------------------------------------

const LD_SCRIPT = /<script[^>]*\btype="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g

let blocks = 0
let nodes = 0
let addressesChecked = 0
let offsite = 0
let panelPages = 0
const typeCensus = new Map()
const missingBlock = []
const extraBlocks = []
const unparsed = []
const badShape = []
const unknownTypes = new Map()
const missingProps = []
const duplicateIds = []
const unresolved = new Map()
const badBreadcrumbs = []
const inbound = []

/** Depth-first over a JSON-LD value, yielding every node object in it. */
function* nodesIn(value) {
  if (Array.isArray(value)) {
    for (const item of value) yield* nodesIn(item)
  } else if (value && typeof value === 'object') {
    yield value
    for (const child of Object.values(value)) yield* nodesIn(child)
  }
}

for (const file of files) {
  const page = path.relative(websiteRoot, file)
  const html = readFileSync(file, 'utf8')
  const found = [...html.matchAll(LD_SCRIPT)].map((m) => m[1])
  const hasPanel = html.includes(`id="${PANEL_ID}"`)
  if (hasPanel) panelPages++

  if (found.length === 0) {
    if (hasPanel) missingBlock.push(page)
    continue
  }
  if (found.length > 1) extraBlocks.push({ page, count: found.length })

  // The hrefs a crawler reading this page can follow, absolute. Scripts go first: the
  // RSC payload carries the inbound rows, and it is precisely the markup copy that
  // check 7 is about.
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '')
  const hrefs = new Set()
  for (const m of markup.matchAll(/href="([^"]*)"/g)) {
    hrefs.add(m[1].startsWith('/') ? `${ORIGIN}${m[1]}` : m[1])
  }

  for (const source of found) {
    blocks++
    let doc
    try {
      doc = JSON.parse(source)
    } catch (error) {
      unparsed.push({ page, message: error.message })
      continue
    }

    if (doc['@context'] !== 'https://schema.org' || !Array.isArray(doc['@graph']) || doc['@graph'].length === 0) {
      badShape.push({ page, context: doc['@context'], graph: doc['@graph'] })
      continue
    }

    // Only these declare. Everything deeper is a reference to something described
    // here or on another page — see check 4.
    const declared = new Set()
    for (const node of doc['@graph']) {
      const id = node['@id']
      if (typeof id !== 'string') continue
      if (declared.has(id)) duplicateIds.push({ page, id })
      declared.add(id)
    }

    for (const node of nodesIn(doc['@graph'])) {
      nodes++
      const type = node['@type']
      if (typeof type === 'string') {
        typeCensus.set(type, (typeCensus.get(type) ?? 0) + 1)
        const required = TYPES[type]
        if (!required) {
          unknownTypes.set(type, (unknownTypes.get(type) ?? 0) + 1)
        } else {
          const absent = required.filter((key) => node[key] === undefined)
          if (absent.length > 0) missingProps.push({ page, type, absent })
        }
      }

      for (const key of INBOUND_KEYS) {
        if (node[key] !== undefined) inbound.push({ page, key })
      }

      for (const [key, value] of Object.entries(node)) {
        if (!ADDRESS_KEYS.has(key) || typeof value !== 'string') continue
        let url
        try {
          url = new URL(value)
        } catch {
          unresolved.set(value, { page, reason: 'not an absolute URL' })
          continue
        }
        if (url.origin !== ORIGIN) {
          offsite++
          continue
        }
        addressesChecked++
        if (exportedFile(url.pathname) === null) {
          unresolved.set(value, { page, reason: `${url.pathname} is not in the export` })
        }
      }

      if (type === 'BreadcrumbList') {
        const items = node.itemListElement
        if (!Array.isArray(items) || items.length === 0) {
          badBreadcrumbs.push({ page, why: 'itemListElement is not a non-empty array' })
        } else {
          items.forEach((item, index) => {
            const last = index === items.length - 1
            if (item['@type'] !== 'ListItem') {
              badBreadcrumbs.push({ page, why: `member ${index + 1} is not a ListItem` })
            }
            if (item.position !== index + 1) {
              badBreadcrumbs.push({ page, why: `member ${index + 1} has position ${item.position}` })
            }
            if (typeof item.name !== 'string' || item.name === '') {
              badBreadcrumbs.push({ page, why: `member ${index + 1} has no name` })
            }
            if (!last && typeof item.item !== 'string') {
              badBreadcrumbs.push({ page, why: `member ${index + 1} of ${items.length} has no item URL` })
            }
          })
        }
      }

      // Check 7's load-bearing half: an edge the block states must be one the page's
      // markup already makes.
      const citations = node.citation === undefined ? [] : [node.citation].flat()
      for (const citation of citations) {
        const target = typeof citation === 'string' ? citation : citation?.['@id']
        if (typeof target === 'string' && !hrefs.has(target)) {
          inbound.push({ page, key: 'citation', target })
        }
      }
    }
  }
}

const census = [...typeCensus.entries()]
  .sort(([, a], [, b]) => b - a)
  .map(([type, count]) => `${count} ${type}`)
  .join(', ')

console.log(
  `[check-structured-data] ${blocks} JSON-LD block(s) across ${files.length} page(s), ` +
    `${nodes} node(s): ${census}.\n  ${addressesChecked} address(es) on ${ORIGIN} resolved ` +
    `against the export, ${offsite} outgoing reference(s) off it.`,
)

// ---------------------------------------------------------------------------
// The findings
// ---------------------------------------------------------------------------

const report = (list, headline, format, limit = 5) => {
  if (list.length === 0) return
  fail(headline(list.length))
  for (const entry of list.slice(0, limit)) console.error(`  ${format(entry)}`)
  if (list.length > limit) console.error(`  … and ${list.length - limit} more`)
}

report(
  missingBlock,
  (n) =>
    `[check-structured-data] ${n} page(s) serve a knowledge-base panel but no JSON-LD block.\n` +
    `  Every entity page carries one — check that the route still renders <StructuredData>.`,
  (page) => page,
)

report(
  extraBlocks,
  (n) =>
    `[check-structured-data] ${n} page(s) carry more than one JSON-LD block.\n` +
    `  One per page: a second block is a second set of statements that can contradict the first.`,
  (e) => `${e.page}: ${e.count} blocks`,
)

report(
  unparsed,
  (n) =>
    `[check-structured-data] ${n} JSON-LD block(s) do not parse.\n` +
    `  A block that does not parse says nothing at all, and says it silently.`,
  (e) => `${e.page}: ${e.message}`,
)

report(
  badShape,
  (n) =>
    `[check-structured-data] ${n} block(s) are not one 'https://schema.org' @context over a ` +
    `non-empty @graph.\n  Without the context every key is a word rather than a schema.org ` +
    `property.`,
  (e) => `${e.page}: @context ${JSON.stringify(e.context)}, @graph ${JSON.stringify(e.graph)?.slice(0, 60)}`,
)

report(
  [...unknownTypes.entries()],
  (n) =>
    `[check-structured-data] ${n} @type(s) this gate has no expectation for.\n` +
    `  Add it to TYPES with the properties it must carry — a type nothing checks is a shape ` +
    `that can\n  rot unnoticed — or fix the builder if it is a typo.`,
  ([type, count]) => `${type} (${count}×)`,
)

report(
  missingProps,
  (n) =>
    `[check-structured-data] ${n} node(s) do not carry the properties their type is described ` +
    `by.\n  A node without them states that something exists and nothing about it.`,
  (e) => `${e.page}: ${e.type} is missing ${e.absent.join(', ')}`,
)

report(
  duplicateIds,
  (n) =>
    `[check-structured-data] ${n} @id(s) are declared twice on one page.\n` +
    `  An identifier names one thing; two descriptions under one id are two things a consumer ` +
    `has to\n  merge, and it will merge them wrongly.`,
  (e) => `${e.page}: ${e.id}`,
)

report(
  [...unresolved.entries()],
  (n) =>
    `[check-structured-data] ${n} address(es) on ${ORIGIN} resolve to nothing.\n` +
    `  These come from the urlFor* helpers, so this is the id scheme and the export disagreeing: ` +
    `either\n  the page stopped being built, or the helper and the route no longer produce the ` +
    `same address.`,
  ([url, e]) => `${url} — ${e.reason} (on ${e.page})`,
)

report(
  badBreadcrumbs,
  (n) =>
    `[check-structured-data] ${n} BreadcrumbList problem(s).\n` +
    `  Google reads the trail from position 1 upwards and drops the whole breadcrumb if the ` +
    `sequence\n  is broken; every member but the last needs its item URL.`,
  (e) => `${e.page}: ${e.why}`,
)

report(
  inbound,
  (n) =>
    `[check-structured-data] ${n} edge(s) a page states but its own markup does not make.\n` +
    `  The block declares outgoing references only: an inbound list is the transpose of edges ` +
    `the citing\n  pages state themselves, and duplicating it here is what this design does not ` +
    `do.`,
  (e) => `${e.page}: ${e.key}${e.target ? ` → ${e.target}` : ''}`,
)

// ---------------------------------------------------------------------------
// The controls: nothing above can be satisfied by an export that says nothing
// ---------------------------------------------------------------------------

if (blocks === 0) {
  fail(
    `[check-structured-data] the export carries no JSON-LD at all, so every check above passed ` +
      `on nothing.\n  Either the blocks stopped being rendered or this gate is reading the wrong ` +
      `directory.`,
  )
}

if (panelPages === 0) {
  fail(
    `[check-structured-data] no page in the export serves #${PANEL_ID}, so the "one block per ` +
      `knowledge-base\n  page" rule had nothing to apply to.`,
  )
}

const absentTypes = Object.keys(TYPES).filter((type) => !typeCensus.has(type))
if (absentTypes.length > 0) {
  fail(
    `[check-structured-data] the export declares no ${absentTypes.join(', ')} anywhere.\n` +
      `  Each page kind contributes its own types, so a type gone missing is a page kind that ` +
      `stopped\n  describing itself — which every other check here would pass over in silence.`,
  )
}

if (failed) process.exit(1)
