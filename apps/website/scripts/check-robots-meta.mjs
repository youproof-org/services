#!/usr/bin/env node
/**
 * Postbuild: every page's `<meta name="robots">` must be the one its environment
 * and its kind call for.
 *
 * Indexing fails silently in both directions, and the whole mechanism is one
 * spread in `generateMetadata` over a value the ROOT LAYOUT also sets. Next's
 * parent/child metadata merge iterates the child's own keys, so a page that
 * returns `{ robots: undefined }` drops the layout's site-wide noindex while a
 * page that omits the key inherits it — two spellings of the same intent, one of
 * which quietly exposes staging. Nothing else in the build would notice: the
 * pages render identically, and the directive is a tag no reader ever sees.
 *
 * So the gate is against the built export rather than the metadata helpers: what
 * matters is the tag the crawler is served after the merge, not what the function
 * returned before it.
 *
 * ## What is asserted
 *
 *   1. **Non-production noindexes everything.** Every page in the export carries
 *      `noindex, nofollow`. `robots.txt` is `Disallow: /` there too, but that only
 *      stops a crawler that reads it, and a disallowed URL can still be indexed
 *      from inbound links alone — the meta tag is what covers the crawl that
 *      happens anyway.
 *   2. **Production noindexes exactly the stub pages, per stub.** A
 *      `data-stub="not-migrated"` page is `noindex, follow` and a
 *      `data-stub="unavailable"` page is `noindex, nofollow`. The two differ
 *      because a not-migrated stub's only content is its link to the legacy page,
 *      which production keeps indexable.
 *   3. **Production noindexes nothing else.** A page with no stub marker carries
 *      no robots tag at all. This is the direction that matters most: a gate that
 *      only checked the stubs would pass a build that had noindexed the site.
 *
 * ## The one tag that is not ours
 *
 * `404.html` carries TWO robots tags. Next's `notFound()` inserts a bare
 * `<meta name="robots" content="noindex">` of its own, outside the metadata API
 * and not removable through it, and the resolved metadata adds the second. Two
 * tags are well-defined to a crawler — the most restrictive of them applies — so
 * the framework's is discounted on that one page rather than fought, and the rule
 * is then applied to what our own metadata contributed. Discounted, not skipped:
 * the not-found page is an `unavailable` stub and still has to carry the
 * directive, and it would be the page most likely to lose it silently.
 *
 * Pages are classified by the `data-stub` attribute their stub components carry —
 * the same marker `check-anchors.mjs` reads, and a literal in
 * `components/content/NotMigratedStub.tsx` / `UnavailableStub.tsx` for exactly
 * this kind of consumer. The directive cannot stand in for the marker here, since
 * that is the thing being checked.
 *
 * ## Why an empty stub set is not a failure
 *
 * Every other gate refuses to pass on a degenerate export. This one cannot state
 * the rule that way: the stub set is the not-yet-migrated content, and a
 * production build with nothing left to migrate legitimately has none. It would be
 * a gate that passes for years and then fails on the day the migration finishes.
 * So the counts are printed instead, and the load-bearing non-vacuity is assertion
 * 3 — it is over every page in the export, so it cannot be satisfied by an empty
 * or truncated one.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')

const isProduction = process.env.SITE_ENV === 'production'

/** The directive each stub kind carries on production (see lib/i18n/metadata.ts). */
const PRODUCTION_DIRECTIVE = {
  'not-migrated': 'noindex, follow',
  unavailable: 'noindex, nofollow',
}
/** What the root layout puts on every page off production (see app/layout.tsx). */
const NON_PRODUCTION_DIRECTIVE = 'noindex, nofollow'

/** The tag Next's `notFound()` inserts on the not-found page, and the only page it is on. */
const FRAMEWORK_404_PAGE = '404.html'
const FRAMEWORK_404_DIRECTIVE = 'noindex'

if (!existsSync(OUT)) {
  console.error('[check-robots-meta] no out/ directory — run after `next build`.')
  process.exit(1)
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

const files = htmlFiles(OUT)
if (files.length === 0) {
  console.error('[check-robots-meta] out/ holds no .html files — nothing was gated.')
  process.exit(1)
}

const wrong = []
const counts = { 'not-migrated': 0, unavailable: 0, plain: 0 }

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const page = path.relative(OUT, file).replace(/\\/g, '/')

  const stub = /\sdata-stub="([^"]+)"/.exec(html)?.[1] ?? null
  if (stub && !(stub in PRODUCTION_DIRECTIVE)) {
    wrong.push({ page, found: `data-stub="${stub}"`, expected: `one of ${Object.keys(PRODUCTION_DIRECTIVE).join(', ')}` })
    continue
  }
  counts[stub ?? 'plain']++

  const directives = [...html.matchAll(/<meta name="robots" content="([^"]*)"/g)].map((m) => m[1])
  if (page === FRAMEWORK_404_PAGE) {
    const framework = directives.indexOf(FRAMEWORK_404_DIRECTIVE)
    if (framework === -1) {
      console.error(
        `[check-robots-meta] ${page} no longer carries Next's own ` +
          `"${FRAMEWORK_404_DIRECTIVE}" tag.\n  This gate discounts that one tag so it can check ` +
          `OUR directive on the page. If the framework\n  stopped inserting it, drop the special ` +
          `case — do not widen it.`,
      )
      process.exit(1)
    }
    directives.splice(framework, 1)
  }

  const expected = isProduction
    ? stub
      ? PRODUCTION_DIRECTIVE[stub]
      : null
    : NON_PRODUCTION_DIRECTIVE
  const found = directives.length === 1 ? directives[0] : directives.length === 0 ? null : directives.join(' + ')

  if (found !== expected) {
    wrong.push({ page, found: found ?? '(no robots tag)', expected: expected ?? '(no robots tag)' })
  }
}

const env = isProduction ? 'production' : (process.env.SITE_ENV || 'local')
console.log(
  `[check-robots-meta] ${files.length} page(s) on ${env}: ` +
    `${counts['not-migrated']} not-migrated stub(s), ${counts.unavailable} unavailable stub(s), ` +
    `${counts.plain} content page(s)`,
)

if (wrong.length > 0) {
  console.error(
    `[check-robots-meta] ${wrong.length} page(s) carry the wrong robots directive.\n` +
      (isProduction
        ? `  On production only a stub page is noindexed: a not-migrated stub is ` +
          `"${PRODUCTION_DIRECTIVE['not-migrated']}" so the\n  legacy page it links to stays ` +
          `discoverable, an unavailable stub is "${PRODUCTION_DIRECTIVE.unavailable}", and every ` +
          `other page\n  carries no robots tag at all.`
        : `  Off production every page is "${NON_PRODUCTION_DIRECTIVE}", from the root layout. A ` +
          `stub page\n  must INHERIT that rather than set its own — see the merge note in ` +
          `lib/i18n/metadata.ts.`),
  )
  for (const w of wrong.slice(0, 10)) {
    console.error(`  ${w.page}: found ${w.found} — expected ${w.expected}`)
  }
  if (wrong.length > 10) console.error(`  … and ${wrong.length - 10} more`)
  process.exit(1)
}
