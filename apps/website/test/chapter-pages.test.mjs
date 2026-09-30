// Chapter pages: how `chapter.yaml` groups sections into pages, the rules the
// loader enforces on them, and which page each part of a chapter renders on.
//
// The loader cases write real YAML to a temporary directory, because the rules
// are about what an author writes, and the error has to name the file they
// open. The graph cases go through `buildGraphFromRaw` like the other content
// model tests.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as loaderModule from '../lib/content/loader.ts'
import * as graphModule from '../lib/content/graph.ts'
import * as chapterPagesModule from '../lib/content/chapter-pages.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as i18nUrlModule from '../lib/i18n/url.ts'
import * as metadataModule from '../lib/i18n/metadata.ts'
import { hu, narrative, embed, raw, ref } from './support/raw-graph.mjs'

const { loadChapter } = loaderModule.default ?? loaderModule
const { buildGraphFromRaw, loadRawGraphData } = graphModule.default ?? graphModule
const { pageHolding, chapterPageMetaNode, generatedPages, chapterPageAt, chapterPageHref } =
  chapterPagesModule.default ?? chapterPagesModule
const { urlForChapter, urlForChapterPage, sectionAnchorId } = urlsModule.default ?? urlsModule
const { buildLocalizedUrl } = i18nUrlModule.default ?? i18nUrlModule
const { buildPageMeta } = metadataModule.default ?? metadataModule

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chapter-pages-'))
after(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

let chapterCount = 0
/** Write `body` (YAML lines after the chapter's identity) to a fresh chapter.yaml. */
function writeChapter(body, { published = true } = {}) {
  const dir = path.join(tmpRoot, `fejezet-${++chapterCount}`)
  fs.mkdirSync(dir)
  const file = path.join(dir, 'chapter.yaml')
  const head = [
    'name: fejezet',
    'slug: fejezet',
    'locale: hu',
    'title: Fejezet',
    ...(published ? ["published-at: '2020-01-01 00:00:00'"] : []),
  ]
  fs.writeFileSync(file, [...head, body.trim()].join('\n') + '\n')
  return file
}

const load = (body, options) => loadChapter(writeChapter(body, options))

/** Assert the load fails with a message naming the chapter file and matching `rule`. */
function assertRejects(body, rule, options) {
  assert.throws(
    () => load(body, options),
    (err) => {
      assert.equal(err.name, 'ContentFormatError')
      assert.match(err.message, /fejezet-\d+\/chapter\.yaml — /)
      assert.match(err.message, rule)
      return true
    },
  )
}

const twoPages = (secondMeta) => `
pages:
  - meta:
      title: Első oldal
      description: Első oldal leírása.
    sections: [egy, ketto]
  - ${secondMeta ? `meta:\n${secondMeta.replace(/^/gm, '      ')}\n    ` : ''}sections: [harom]
`

// ---------------------------------------------------------------------------
// The two YAML shapes
// ---------------------------------------------------------------------------

test('the old shape reads as one page that carries the chapter meta', () => {
  const chapter = load(`
meta:
  title: Oldalcím
  description: Leírás.
  open-graph: { title: '1. fejezet: Fejezet' }
sections: [egy, ketto]
`)
  assert.deepEqual(chapter.pages, [
    {
      sectionNames: ['egy', 'ketto'],
      meta: { title: 'Oldalcím', description: 'Leírás.', openGraph: { title: '1. fejezet: Fejezet', description: undefined } },
    },
  ])
  assert.ok(!('meta' in chapter) && !('sectionNames' in chapter))
})

test('the old shape without meta reads as one page without meta', () => {
  assert.deepEqual(load('sections: [egy]').pages, [{ sectionNames: ['egy'], meta: undefined }])
})

test('the pages shape reads each page with its own sections and meta', () => {
  const chapter = load(twoPages('title: Második oldal\ndescription: Második oldal leírása.\nopen-graph: { title: "1. fejezet: Fejezet (2. rész)" }'))
  assert.deepEqual(chapter.pages.map((p) => p.sectionNames), [['egy', 'ketto'], ['harom']])
  assert.equal(chapter.pages[0].meta.title, 'Első oldal')
  assert.equal(chapter.pages[1].meta.title, 'Második oldal')
  assert.equal(chapter.pages[1].meta.openGraph.title, '1. fejezet: Fejezet (2. rész)')
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('the old sections key next to pages is rejected', () => {
  assertRejects(`sections: [egy]\npages:\n  - sections: [egy]`, /'sections' can't sit next to 'pages'/)
})

test('the old chapter-level meta next to pages is rejected', () => {
  assertRejects(`meta: { title: Cím }\npages:\n  - sections: [egy]`, /'meta' can't sit next to 'pages'/)
})

test('a chapter with no pages is rejected', () => {
  assertRejects('pages: []', /'pages' is empty/)
})

test('pages that are not a list are rejected', () => {
  assertRejects('pages: { sections: [egy] }', /'pages' must be a list/)
})

test('a page with no sections is rejected, in either shape', () => {
  assertRejects(`pages:\n  - sections: [egy]\n  - meta: { title: Cím, description: Leírás. }`, /page 2 has no sections/)
  assertRejects(`pages:\n  - sections: []`, /page 1 has no sections/)
  assertRejects('meta: { title: Cím }', /page 1 has no sections/)
})

test('a section on two pages is rejected', () => {
  assertRejects(
    `pages:\n  - sections: [egy, ketto]\n  - meta: { title: Cím, description: Leírás. }\n    sections: [ketto]`,
    /section 'ketto' appears on page 1 and page 2/,
  )
})

test('a section twice on one page is rejected, in either shape', () => {
  assertRejects(`pages:\n  - sections: [egy, egy]`, /section 'egy' appears twice on page 1/)
  assertRejects('sections: [egy, ketto, egy]', /section 'egy' appears twice on page 1/)
})

test('a section file on no page is rejected when the graph loads', async (t) => {
  const contentDir = path.join(tmpRoot, 'content')
  const chapterDir = path.join(contentDir, 'books', 'konyv', 'resz', 'fejezet')
  fs.mkdirSync(chapterDir, { recursive: true })
  fs.writeFileSync(path.join(contentDir, 'books', 'episodes.yaml'), '- konyv\n')
  fs.writeFileSync(path.join(contentDir, 'books', 'konyv', 'book.yaml'), 'name: konyv\ntitle: Könyv\nparts: [resz]\n')
  fs.writeFileSync(path.join(contentDir, 'books', 'konyv', 'resz', 'part.yaml'), 'name: resz\ntitle: Rész\nchapters: [fejezet]\n')
  for (const name of ['egy', 'ketto', 'harom']) {
    fs.writeFileSync(path.join(chapterDir, `${name}.yaml`), `name: ${name}\ntitle: ${name}\nbody: []\n`)
  }
  const writeChapterYaml = (pagesYaml) =>
    fs.writeFileSync(path.join(chapterDir, 'chapter.yaml'), `name: fejezet\ntitle: Fejezet\n${pagesYaml}`)

  const previous = process.env.CONTENT_DIR
  process.env.CONTENT_DIR = contentDir
  t.after(() => {
    if (previous === undefined) delete process.env.CONTENT_DIR
    else process.env.CONTENT_DIR = previous
  })

  writeChapterYaml('pages:\n  - sections: [egy]\n  - sections: [ketto, harom]\n')
  const loaded = await loadRawGraphData()
  const pages = loaded.books[0].parts[0].chapters[0].pages
  assert.deepEqual(pages.map((p) => p.sections.map((s) => s.name)), [['egy'], ['ketto', 'harom']])

  writeChapterYaml('pages:\n  - sections: [egy]\n')
  await assert.rejects(loadRawGraphData(), (err) => {
    assert.equal(err.name, 'ContentFormatError')
    assert.match(err.message, /fejezet\/chapter\.yaml — /)
    assert.match(err.message, /section\(s\) 'harom', 'ketto' sit in the chapter's directory but on no page/)
    return true
  })
})

test('on a published chapter, a page after page 1 needs meta.title and meta.description', () => {
  assertRejects(twoPages(), /page 2 has no 'meta\.title'/)
  assertRejects(twoPages('description: Leírás.'), /page 2 has no 'meta\.title'/)
  assertRejects(twoPages('title: Cím'), /page 2 has no 'meta\.description'/)
  assertRejects(twoPages("title: '  '\ndescription: Leírás."), /page 2 has no 'meta\.title'/)
  assert.equal(load(twoPages('title: Cím\ndescription: Leírás.')).pages.length, 2)
})

test('page 1 of a published chapter may go without meta, as today', () => {
  assert.equal(load('pages:\n  - sections: [egy]').pages[0].meta, undefined)
})

test('an unpublished chapter may leave its later pages without meta', () => {
  assert.equal(load(twoPages(), { published: false }).pages[1].meta, undefined)
})

test('a later page Open Graph title must end in its own page number', () => {
  const withOg = (title) => twoPages(`title: Cím\ndescription: Leírás.\nopen-graph: { title: '${title}' }`)
  assertRejects(withOg('1. fejezet: Fejezet'), /page 2 has an 'open-graph\.title' that doesn't end in '\(2\. rész\)'/)
  assertRejects(withOg('1. fejezet: Fejezet (3. rész)'), /doesn't end in '\(2\. rész\)'/)
  assertRejects(withOg('1. fejezet: Fejezet (2. rész) után'), /doesn't end in '\(2\. rész\)'/)
  assert.equal(load(withOg('1. fejezet: Fejezet (2. rész)')).pages[1].meta.openGraph.title, '1. fejezet: Fejezet (2. rész)')
})

test('the Open Graph suffix rule applies to unpublished chapters too', () => {
  assertRejects(twoPages("open-graph: { title: 'Fejezet' }"), /doesn't end in '\(2\. rész\)'/, { published: false })
})

test('page 1 Open Graph title needs no suffix', () => {
  const chapter = load(`pages:\n  - meta: { open-graph: { title: '1. fejezet: Fejezet' } }\n    sections: [egy]`)
  assert.equal(chapter.pages[0].meta.openGraph.title, '1. fejezet: Fejezet')
})

// ---------------------------------------------------------------------------
// The graph: pages, and which page holds what
// ---------------------------------------------------------------------------

const definition = (name) => ({
  ...hu, name, slug: name, title: name, body: [narrative('Törzs.')], references: {}, remarkSlugs: [],
})

const section = (name, body = []) => ({ name, slug: name, locale: 'hu', title: name, references: {}, body })

/**
 * The shared fixture's chapter split into three pages, with an embed in the
 * prologue, in a section on each page, and in the epilogue.
 */
function paged({ published = true } = {}) {
  const data = raw({
    published,
    extraDefinitions: ['def-elo', 'def-ketto', 'def-harom', 'def-uto'].map(definition),
  })
  const chapter = data.books[0].parts[0].chapters[0]
  const [first] = chapter.pages[0].sections
  chapter.prologue = [embed('definitions.def-elo')]
  chapter.epilogue = [embed('definitions.def-uto')]
  chapter.pages = [
    { meta: { title: 'Első oldal', description: 'Első.' }, sections: [first] },
    { meta: { title: 'Második oldal', description: 'Második.' }, sections: [section('ketto', [embed('definitions.def-ketto')]), section('harom')] },
    { sections: [section('negy', [embed('definitions.def-harom')])] },
  ]
  return data
}

const chapterOf = (g) => g.chapters.get('books.konyv.chapters.fejezet')

test('pages are numbered from 1 and point back at their chapter', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  assert.deepEqual(chapter.pages.map((p) => p.index), [1, 2, 3])
  for (const page of chapter.pages) assert.equal(page.chapter, chapter)
  assert.equal(chapter.pages[1].meta.title, 'Második oldal')
  assert.equal(chapter.pages[2].meta, undefined)
})

test('chapter.sections stays the flat list, in page order', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  assert.deepEqual(chapter.sections.map((s) => s.name), ['szakasz', 'ketto', 'harom', 'negy'])
  assert.deepEqual(chapter.pages.flatMap((p) => p.sections), chapter.sections)
})

test('every section maps to exactly one page, the one that lists it', () => {
  const g = buildGraphFromRaw(paged())
  const chapter = chapterOf(g)
  for (const s of chapter.sections) {
    assert.equal(chapter.pages.filter((p) => p.sections.includes(s)).length, 1, s.name)
    assert.ok(s.page.sections.includes(s), s.name)
    assert.equal(pageHolding(chapter, s), s.page)
  }
  assert.equal(g.sections.get('books.konyv.chapters.fejezet.sections.harom').page.index, 2)
})

test('page 1 holds the abstract, the prerequisite warning and the prologue; the last page the epilogue', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  for (const frame of ['abstract', 'prerequisite-warning', 'prologue']) {
    assert.equal(pageHolding(chapter, frame).index, 1, frame)
  }
  assert.equal(pageHolding(chapter, 'epilogue').index, 3)
})

test('a one-page chapter holds everything on page 1', () => {
  const chapter = chapterOf(buildGraphFromRaw(raw()))
  assert.equal(chapter.pages.length, 1)
  assert.equal(pageHolding(chapter, 'prologue'), chapter.pages[0])
  assert.equal(pageHolding(chapter, 'epilogue'), chapter.pages[0])
})

test('an embedding records the page its embed renders on', () => {
  const g = buildGraphFromRaw(paged())
  const pageOf = (key) => g.embedding.get(key).page.index
  assert.equal(pageOf('definitions.def-elo'), 1)
  assert.equal(pageOf('definitions.def-egy'), 1)
  assert.equal(pageOf('definitions.def-ketto'), 2)
  assert.equal(pageOf('definitions.def-harom'), 3)
  assert.equal(pageOf('definitions.def-uto'), 3)
})

test('section numbering and embed indices stay chapter-global across pages', () => {
  const g = buildGraphFromRaw(paged())
  assert.equal(g.embedding.get('definitions.def-elo').index, '1.1.')
  assert.equal(g.embedding.get('definitions.def-egy').index, '1.2.')
  assert.equal(g.embedding.get('definitions.def-ketto').index, '1.4.')
  assert.equal(g.embedding.get('definitions.def-harom').index, '1.5.')
})

test('the chapter URL takes its metadata from page 1', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  assert.deepEqual(chapterPageMetaNode(chapter.pages[0]), {
    title: 'Fejezet',
    excerpt: undefined,
    publishedAt: '2020-01-01 00:00:00',
    thumbnail: undefined,
    meta: { title: 'Első oldal', description: 'Első.' },
  })
})

test('an unpublished chapter builds with all its pages, so its single stub page has a page 1 to describe it', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged({ published: false })))
  assert.equal(chapter.published, false)
  assert.equal(chapter.pages.length, 3)
  assert.equal(chapterPageMetaNode(chapter.pages[0]).meta.title, 'Első oldal')
})

// ---------------------------------------------------------------------------
// URLs: page 1 is the chapter URL, later pages add `/{n}`
// ---------------------------------------------------------------------------

const CHAPTER_URL = '/hu/konyvek/konyv/fejezetek/fejezet'

test('page 1 of a chapter is the bare chapter URL, later pages add their number', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  assert.equal(urlForChapter(chapter), CHAPTER_URL)
  assert.equal(urlForChapterPage(chapter, 1), CHAPTER_URL)
  assert.equal(urlForChapterPage(chapter, 2), `${CHAPTER_URL}/2`)
  assert.equal(urlForChapterPage(chapter, 3), `${CHAPTER_URL}/3`)
})

test('the page URL builder rejects page 0, a page past the last, and a non-integer', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  for (const index of [0, -1, 4, 1.5, Number.NaN]) {
    assert.throws(() => urlForChapterPage(chapter, index), /has 3 page\(s\), so it has no page/, String(index))
  }
})

test("the URL constructor's chapter-page key refuses a second spelling of page 1", () => {
  assert.equal(buildLocalizedUrl('hu', 'chapter-page', 'konyv', 'fejezet', '2'), `${CHAPTER_URL}/2`)
  for (const index of ['1', '0', '01', '2.0', 'x', '']) {
    assert.throws(() => buildLocalizedUrl('hu', 'chapter-page', 'konyv', 'fejezet', index), undefined, index)
  }
})

// ---------------------------------------------------------------------------
// The route: which segment resolves, and which pages are generated
// ---------------------------------------------------------------------------

test('a page segment resolves only for pages 2 to N, spelled as a plain number', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  assert.equal(chapterPageAt(chapter, '2'), chapter.pages[1])
  assert.equal(chapterPageAt(chapter, '3'), chapter.pages[2])
  for (const segment of ['1', '0', '4', '10', '02', '2.0', ' 2', 'x', '', undefined]) {
    assert.equal(chapterPageAt(chapter, segment), undefined, String(segment))
  }
})

test('locally every page of a chapter is generated, drafts included', () => {
  for (const published of [true, false]) {
    const chapter = chapterOf(buildGraphFromRaw(paged({ published })))
    assert.deepEqual(generatedPages(chapter).map((p) => p.index), [1, 2, 3])
  }
})

test('every generated page URL resolves back to its own page, the static params round trip', () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  for (const page of generatedPages(chapter)) {
    const path = urlForChapterPage(chapter, page.index).split('/').slice(2)
    assert.deepEqual(path.slice(0, 4), ['konyvek', 'konyv', 'fejezetek', 'fejezet'])
    const resolved = path.length === 4 ? chapter.pages[0] : chapterPageAt(chapter, path[4])
    assert.equal(resolved, page)
  }
})

// ---------------------------------------------------------------------------
// Hrefs into a paginated chapter carry the page that renders the anchor
// ---------------------------------------------------------------------------

/**
 * `paged()`, with section 'negy' on page 3 citing something on every page, and
 * section 'harom' on page 2 citing def-egy, so def-egy has a backlink row that
 * points at page 2.
 */
function pagedWithRefs() {
  const data = paged()
  const [, second, third] = data.books[0].parts[0].chapters[0].pages
  const harom = second.sections[1]
  harom.body = [narrative('Lásd [az-elsot].')]
  harom.references = { 'az-elsot': ref('az elsőt', 'definitions.def-egy') }
  const negy = third.sections[0]
  negy.body.push(narrative('[szakasz] [harmadik] [masodik] [utolso] [allitas] [fejezet]'))
  negy.references = {
    szakasz: ref('a szakasz', 'books.konyv.chapters.fejezet.sections.harom'),
    harmadik: ref('a harmadik', 'definitions.def-harom'),
    masodik: ref('a második', 'definitions.def-ketto'),
    utolso: ref('az utolsó', 'definitions.def-uto'),
    allitas: ref('az állítás', 'definitions.def-egy.claims.def-claim'),
    fejezet: ref('a fejezet', 'books.konyv.chapters.fejezet'),
  }
  return data
}

test('a reference into a chapter links to the page that renders its target', () => {
  const g = buildGraphFromRaw(pagedWithRefs())
  const refs = g.sections.get('books.konyv.chapters.fejezet.sections.negy').references
  assert.equal(refs.szakasz.href, `${CHAPTER_URL}/2#szakaszok.harom`)
  assert.equal(refs.masodik.href, `${CHAPTER_URL}/2#definiciok.def-ketto`)
  assert.equal(refs.harmadik.href, `${CHAPTER_URL}/3#definiciok.def-harom`)
  assert.equal(refs.utolso.href, `${CHAPTER_URL}/3#definiciok.def-uto`, 'the epilogue is on the last page')
  assert.match(refs.allitas.href, new RegExp(`^${CHAPTER_URL}#definiciok\\.def-egy\\.`), 'page 1 stays bare')
  assert.equal(refs.fejezet.href, CHAPTER_URL, 'the chapter as a whole is page 1')
})

test('a backlink row to a section links to the page the section sits on', () => {
  const g = buildGraphFromRaw(pagedWithRefs())
  const rows = (list) => list.flatMap((r) => [r, ...rows(r.children)])
  const row = rows(g.backlinks.get('definitions.def-egy').all)
    .find((r) => r.fqn === 'books.konyv.chapters.fejezet.sections.harom')
  const harom = g.sections.get('books.konyv.chapters.fejezet.sections.harom')
  assert.equal(row.href, `${CHAPTER_URL}/2#${sectionAnchorId(harom)}`)
  assert.equal(chapterPageHref(harom.page), `${CHAPTER_URL}/2`)
})

// ---------------------------------------------------------------------------
// Per-page metadata
// ---------------------------------------------------------------------------

test("each page's metadata is its own: title, description, canonical, og:url and hreflang", () => {
  const chapter = chapterOf(buildGraphFromRaw(paged()))
  const metaOf = (page) =>
    buildPageMeta({
      locale: 'hu',
      key: page.index === 1 ? 'chapter' : 'chapter-page',
      slugPath: page.index === 1 ? ['konyv', 'fejezet'] : ['konyv', 'fejezet', String(page.index)],
      ogType: 'article',
      node: chapterPageMetaNode(page),
    })
  const [first, second, third] = chapter.pages.map(metaOf)

  assert.match(first.title.absolute, /^Első oldal \| /)
  assert.equal(first.description, 'Első.')
  assert.equal(first.alternates.canonical, `https://youproof.org${CHAPTER_URL}`)

  assert.match(second.title.absolute, /^Második oldal \| /)
  assert.equal(second.description, 'Második.')
  assert.equal(second.alternates.canonical, `https://youproof.org${CHAPTER_URL}/2`)
  assert.equal(second.openGraph.url, `https://youproof.org${CHAPTER_URL}/2`)
  assert.deepEqual(second.alternates.languages, {
    hu: `https://youproof.org${CHAPTER_URL}/2`,
    'x-default': `https://youproof.org${CHAPTER_URL}/2`,
  })

  // Page 3 of this unvalidated fixture has no meta, so it falls back as page 1 would.
  assert.match(third.title.absolute, /^Fejezet \| /)
  assert.equal(third.alternates.canonical, `https://youproof.org${CHAPTER_URL}/3`)
})

// ---------------------------------------------------------------------------
// A page with nothing on it
// ---------------------------------------------------------------------------

test('a page whose listed sections all lack a file fails the graph load', async (t) => {
  const contentDir = path.join(tmpRoot, 'content-missing')
  const chapterDir = path.join(contentDir, 'books', 'konyv', 'resz', 'fejezet')
  fs.mkdirSync(chapterDir, { recursive: true })
  fs.writeFileSync(path.join(contentDir, 'books', 'episodes.yaml'), '- konyv\n')
  fs.writeFileSync(path.join(contentDir, 'books', 'konyv', 'book.yaml'), 'name: konyv\ntitle: Könyv\nparts: [resz]\n')
  fs.writeFileSync(path.join(contentDir, 'books', 'konyv', 'resz', 'part.yaml'), 'name: resz\ntitle: Rész\nchapters: [fejezet]\n')
  fs.writeFileSync(path.join(chapterDir, 'egy.yaml'), 'name: egy\ntitle: egy\nbody: []\n')
  fs.writeFileSync(
    path.join(chapterDir, 'chapter.yaml'),
    'name: fejezet\ntitle: Fejezet\npages:\n  - sections: [egy]\n  - sections: [nincs]\n',
  )

  const previous = process.env.CONTENT_DIR
  process.env.CONTENT_DIR = contentDir
  t.after(() => {
    if (previous === undefined) delete process.env.CONTENT_DIR
    else process.env.CONTENT_DIR = previous
  })
  t.mock.method(console, 'warn', () => {})

  await assert.rejects(loadRawGraphData(), (err) => {
    assert.equal(err.name, 'ContentFormatError')
    assert.match(err.message, /fejezet\/chapter\.yaml — page 2 lists no section that has a file/)
    return true
  })
})
