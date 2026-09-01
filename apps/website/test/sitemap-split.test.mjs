// The postbuild sitemap splitter: which child sitemap each URL shape lands in,
// and what the rewritten index says about them.
//
// The grouping rules are exercised against the REAL locales.json, because their
// whole point is that the Hungarian segments live there and not in the script; a
// synthetic second locale then shows that nothing about Hungarian is baked in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { splitSitemap, SITEMAP_GROUPS } from '../scripts/lib/sitemap-split.mjs'

const { locales } = JSON.parse(
  readFileSync(new URL('../lib/i18n/locales.json', import.meta.url), 'utf8'),
)

const ORIGIN = 'https://youproof.org'

/** A `<url>` entry the way Next writes one: loc, self-alternate, optional lastmod. */
const url = (pathname, lastmod) =>
  `<url>\n<loc>${ORIGIN}${pathname}</loc>\n` +
  `<xhtml:link rel="alternate" hreflang="hu" href="${ORIGIN}${pathname}" />\n` +
  (lastmod ? `<lastmod>${lastmod}</lastmod>\n` : '') +
  '</url>'

const urlset = (entries) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  `${entries.join('\n')}\n</urlset>\n`

// One URL of every shape app/sitemap.ts emits, in its emission order.
const EVERY_SHAPE = [
  '/hu',
  '/hu/konyvek/alice-es-bob',
  '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-szinrelep',
  '/hu/cikkek',
  '/hu/cikkek/a-vegtelenen-tul',
  '/hu/hirek',
  '/hu/hirek/megujult-a-youproof',
  '/hu/tudasbazis',
  '/hu/tudasbazis/definiciok',
  '/hu/tudasbazis/definiciok/prim',
  '/hu/tudasbazis/tetelek',
  '/hu/tudasbazis/tetelek/fermat-kis-tetele',
  '/hu/tudasbazis/fogalmak',
  '/hu/tudasbazis/tetelek/fermat-kis-tetele/bizonyitasok/1',
  '/hu/tudasbazis/definiciok/prim/megjegyzesek/1',
  '/hu/tudasbazis/tetelek/fermat-kis-tetele/bizonyitasok/1/megjegyzesek/1',
  '/hu/impresszum',
]

const split = (pathnames, extra = {}) =>
  splitSitemap({ xml: urlset(pathnames.map((p) => url(p))), locales, ...extra })

const countsByFile = (result) => Object.fromEntries(result.children.map((c) => [c.file, c.count]))

test('every URL shape lands in the child sitemap of its own type', () => {
  const result = split(EVERY_SHAPE)
  assert.deepEqual(countsByFile(result), {
    // A chapter lists with its book, and the knowledge-base root with the pages
    // that have no container of their own.
    'sitemap-konyvek.xml': 2,
    'sitemap-cikkek.xml': 2,
    'sitemap-hirek.xml': 2,
    'sitemap-oldalak.xml': 3,
    'sitemap-definiciok.xml': 2,
    'sitemap-tetelek.xml': 2,
    'sitemap-bizonyitasok.xml': 1,
    'sitemap-megjegyzesek.xml': 2,
    'sitemap-fogalmak.xml': 1,
  })
})

test('the children are listed in the group table order, not the sitemap order', () => {
  // The glossary comes before two entity pages in EVERY_SHAPE, its file last.
  const result = split(EVERY_SHAPE)
  assert.deepEqual(result.children.map((c) => c.key), SITEMAP_GROUPS.filter((g) => g.inIndex).map((g) => g.key))
})

test('the children hold every entry, verbatim and once', () => {
  const result = split(EVERY_SHAPE)
  const locs = result.children.flatMap((c) => [...c.xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]))
  assert.equal(result.total, EVERY_SHAPE.length)
  assert.equal(locs.length, EVERY_SHAPE.length)
  assert.deepEqual([...locs].sort(), EVERY_SHAPE.map((p) => `${ORIGIN}${p}`).sort())
  // The alternates and the lastmod ride along — a child is the same entry in a
  // smaller file, so the xhtml namespace declaration comes with it.
  const child = result.children.find((c) => c.file === 'sitemap-bizonyitasok.xml')
  assert.match(child.xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset [^>]*xmlns:xhtml=/)
  assert.match(child.xml, /<xhtml:link rel="alternate" hreflang="hu"/)
  assert.match(child.xml, /<\/urlset>\n$/)
})

test('the index points at each child and carries its newest lastmod', () => {
  const result = splitSitemap({
    xml: urlset([
      url('/hu/impresszum', '2026-01-02T00:00:00.000Z'),
      url('/hu/tudasbazis/definiciok/prim', '2026-03-04T00:00:00.000Z'),
      url('/hu/tudasbazis/definiciok/halmaz', '2026-02-03T00:00:00.000Z'),
    ]),
    locales,
  })
  assert.equal(
    result.index,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      `<sitemap>\n<loc>${ORIGIN}/sitemap-oldalak.xml</loc>\n<lastmod>2026-01-02T00:00:00.000Z</lastmod>\n</sitemap>\n` +
      `<sitemap>\n<loc>${ORIGIN}/sitemap-definiciok.xml</loc>\n<lastmod>2026-03-04T00:00:00.000Z</lastmod>\n</sitemap>\n` +
      '</sitemapindex>\n',
  )
})

test('a child with no dated entry is listed without a lastmod', () => {
  const result = split(['/hu'])
  assert.equal(result.children[0].lastmod, undefined)
  assert.match(result.index, /<sitemap>\n<loc>[^<]+<\/loc>\n<\/sitemap>/)
})

test('a group held out of the index gets no file and no entry', () => {
  const groups = SITEMAP_GROUPS.map((g) => (g.key === 'definition' ? { ...g, inIndex: false } : g))
  const result = split(EVERY_SHAPE, { groups })
  assert.equal(result.children.some((c) => c.file === 'sitemap-definiciok.xml'), false)
  assert.doesNotMatch(result.index, /definiciok/)
  assert.deepEqual(result.heldOut, [{ key: 'definition', locale: 'hu', count: 2 }])
  assert.equal(result.total, EVERY_SHAPE.length)
})

test('landing pages are held out by default, so one reaching the sitemap is not indexed', () => {
  const result = split(['/hu/landing/alice-es-bob-mintafejezet'])
  assert.deepEqual(result.children, [])
  assert.deepEqual(result.heldOut, [{ key: 'landing', locale: 'hu', count: 1 }])
})

test('the segments come from the locale dictionary, so a second locale groups by its own words', () => {
  const en = structuredClone(locales.hu)
  en.containers = { ...en.containers, book: 'books', chapter: 'chapters', 'knowledge-base': 'knowledge-base', theorem: 'theorems', proof: 'proofs' }
  en.sitemapGroups = { page: 'pages' }
  const result = splitSitemap({
    xml: urlset([
      url('/hu/konyvek/alice-es-bob'),
      url('/en/books/alice-and-bob'),
      url('/en/books/alice-and-bob/chapters/enter-alice'),
      url('/en/knowledge-base/theorems/fermat/proofs/one'),
      url('/en/imprint'),
    ]),
    locales: { ...locales, en },
  })
  assert.deepEqual(countsByFile(result), {
    'sitemap-konyvek.xml': 1,
    'sitemap-books.xml': 2,
    'sitemap-proofs.xml': 1,
    'sitemap-pages.xml': 1,
  })
})

test('refuses to guess at anything it cannot classify', () => {
  // Each of these would otherwise mean pages quietly missing from the sitemap.
  assert.throws(() => split(['/de/impresszum']), /not start with a configured locale/)
  assert.throws(() => split(['/hu/tudasbazis/nincs-ilyen/x']), /where a container segment belongs/)
  assert.throws(() => split(['/hu/nincs-ilyen/x/y']), /matches no known URL shape/)
  assert.throws(
    () => split(['/hu/impresszum'], { groups: SITEMAP_GROUPS.filter((g) => g.key !== 'page') }),
    /not in the group table/,
  )
})

test('refuses to let two locales write over each other', () => {
  // A group's file is named after one locale's word for it, and these two locales
  // use the same word for two different groups.
  const en = structuredClone(locales.hu)
  en.containers = { ...en.containers, article: 'hirek' }
  assert.throws(
    () =>
      splitSitemap({
        xml: urlset([url('/hu/hirek/megujult-a-youproof'), url('/en/hirek/some-article')]),
        locales: { ...locales, en },
      }),
    /both name sitemap-hirek\.xml/,
  )
})

test('refuses to split anything that is not a urlset', () => {
  // Guards against a second run over an already-rewritten sitemap.
  const index = split(['/hu']).index
  assert.throws(() => splitSitemap({ xml: index, locales }), /not a <urlset> sitemap/)
})
