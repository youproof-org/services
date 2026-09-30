// Chapter pages as a DEPLOYED build generates them.
//
// `SITE_ENV` is read once, when `lib/content/stub.ts` and the graph module are
// evaluated, so this is a file of its own: the test runner executes it as a
// separate process, and it sets `SITE_ENV` before anything is imported (see
// kb-sections-deployed.test.mjs).
//
// What this pins: an unpublished chapter renders one stub page at the chapter URL,
// so it generates no later page, and a link to something on a later page goes to
// the stub rather than to a page the build never wrote.
import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SITE_ENV = 'staging'

const { buildGraphFromRaw } = await import('../lib/content/graph.ts')
const { generatedPages, chapterPageAt, chapterPageHref } = await import('../lib/content/chapter-pages.ts')
const { hu, narrative, embed, raw, ref } = await import('./support/raw-graph.mjs')

const CHAPTER_URL = '/hu/konyvek/konyv/fejezetek/fejezet'

/** The shared fixture's chapter in two pages, with a reference into page 2. */
function twoPages({ published }) {
  const data = raw({
    published,
    extraDefinitions: [
      { ...hu, name: 'def-ketto', slug: 'def-ketto', title: 'def-ketto', body: [narrative('Törzs.')], references: {}, remarkSlugs: [] },
    ],
  })
  const chapter = data.books[0].parts[0].chapters[0]
  chapter.pages.push({
    meta: { title: 'Második oldal', description: 'Második.' },
    sections: [{ name: 'ketto', slug: 'ketto', locale: 'hu', title: 'Kettő', references: {}, body: [embed('definitions.def-ketto')] }],
  })
  chapter.references = { masodik: ref('a második', 'definitions.def-ketto') }
  chapter.prologue = [narrative('[masodik]')]
  return buildGraphFromRaw(data)
}

const chapterOf = (g) => g.chapters.get('books.konyv.chapters.fejezet')

test('a published chapter generates every page, exactly as locally', () => {
  const chapter = chapterOf(twoPages({ published: true }))
  assert.deepEqual(generatedPages(chapter).map((p) => p.index), [1, 2])
  assert.equal(chapterPageAt(chapter, '2'), chapter.pages[1])
  assert.equal(chapterPageHref(chapter.pages[1]), `${CHAPTER_URL}/2`)
})

test('an unpublished chapter generates only its stub page, so its later pages do not resolve', () => {
  const chapter = chapterOf(twoPages({ published: false }))
  assert.deepEqual(generatedPages(chapter).map((p) => p.index), [1])
  assert.equal(chapterPageAt(chapter, '2'), undefined)
})

test("a link to a later page of an unpublished chapter goes to the chapter's stub", () => {
  const g = twoPages({ published: false })
  const chapter = chapterOf(g)
  assert.equal(chapterPageHref(chapter.pages[1]), CHAPTER_URL)
  assert.equal(chapter.references.masodik.href, `${CHAPTER_URL}#definiciok.def-ketto`)
})
