// The numbering and reading order over a small outline: which embed numbers an
// entity, which only records where it lives, and where every name sits.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildContentPositions,
  buildEmbedding,
  chapterIndexLabel,
  chapterNumber,
  indexContent,
  sectionIndexLabel,
  type ContentOutline,
  type OutlineBlock,
  type OutlineChapter,
  type OutlineEntity,
} from '../src/index'

const embed = (fqn: string): OutlineBlock => ({ type: 'embed', target: { type: fqn.split('.').slice(-2)[0].replace(/s$/, ''), fqn } })
const narrative: OutlineBlock = { type: 'narrative' }

function entity(type: OutlineEntity['type'], extra: Partial<OutlineEntity> = {}): OutlineEntity {
  return { type, locale: 'hu', body: [], terms: [], attached: false, ...extra }
}

const c1: OutlineChapter = {
  name: 'c1',
  title: 'Első',
  prologue: [narrative, embed('definitions.d1')],
  sections: [
    {
      name: 's1',
      title: 'Egy',
      body: [
        embed('theorems.t1'),
        { type: 'subsection', blocks: [embed('definitions.nested')] },
        embed('definitions.d1.remarks.attached'),
        embed('remarks.free'),
      ],
    },
    { name: 's2', title: 'Kettő', body: [embed('theorems.t1.proofs.p1')] },
  ],
  epilogue: [embed('definitions.epilogue')],
}
const c2: OutlineChapter = {
  name: 'c2',
  title: 'Második',
  prologue: [],
  sections: [{ name: 's1', title: 'Egy', body: [embed('definitions.d1'), embed('theorems.t2')] }],
  epilogue: [],
}
const c3: OutlineChapter = { name: 'c3', title: 'Harmadik', prologue: [embed('definitions.d3')], sections: [], epilogue: [] }

const book = { name: 'b', title: 'Könyv', parts: [{ name: 'p1', chapters: [c1, c2] }, { name: 'p2', chapters: [c3] }] }

const outline: ContentOutline = {
  books: [book],
  entities: new Map<string, OutlineEntity>([
    ['definitions.d1', entity('definition', { body: [narrative, { type: 'claim', name: 'c' }], terms: ['t'] })],
    ['definitions.nested', entity('definition')],
    ['definitions.epilogue', entity('definition')],
    ['definitions.d3', entity('definition')],
    ['theorems.t1', entity('theorem')],
    ['theorems.t2', entity('theorem')],
    ['theorems.t1.proofs.p1', entity('proof')],
    ['definitions.d1.remarks.attached', entity('remark', { attached: true })],
    ['remarks.free', entity('remark')],
  ]),
  standalones: [{ kind: 'article', name: 'a', title: 'Cikk', sections: [{ name: 'x' }] }],
}

test('a chapter is numbered across the parts of its book, and a section within its chapter', () => {
  assert.equal(chapterNumber(book, c3), 3)
  assert.equal(chapterIndexLabel(book, c2), '2.')
  assert.equal(sectionIndexLabel(book, c1, c1.sections[1]), '1.2.')
  assert.equal(chapterNumber({ name: 'other', title: '', parts: [] }, c1), 0)
})

test('every embedded entity records its first chapter and section, and the numbered ones get a chapter-scoped index', () => {
  assert.deepEqual([...buildEmbedding(outline)], [
    ['definitions.d1', { chapter: 'books.b.chapters.c1', section: undefined, index: '1.1.' }],
    ['definitions.epilogue', { chapter: 'books.b.chapters.c1', section: undefined }],
    ['theorems.t1', { chapter: 'books.b.chapters.c1', section: 'books.b.chapters.c1.sections.s1', index: '1.2.' }],
    ['definitions.nested', { chapter: 'books.b.chapters.c1', section: 'books.b.chapters.c1.sections.s1' }],
    ['definitions.d1.remarks.attached', { chapter: 'books.b.chapters.c1', section: 'books.b.chapters.c1.sections.s1' }],
    ['remarks.free', { chapter: 'books.b.chapters.c1', section: 'books.b.chapters.c1.sections.s1', index: '1.3.' }],
    ['theorems.t1.proofs.p1', { chapter: 'books.b.chapters.c1', section: 'books.b.chapters.c1.sections.s2' }],
    ['theorems.t2', { chapter: 'books.b.chapters.c2', section: 'books.b.chapters.c2.sections.s1', index: '2.1.' }],
    ['definitions.d3', { chapter: 'books.b.chapters.c3', section: undefined, index: '3.1.' }],
  ])
})

test('an embedded remark the outline does not hold gets no index', () => {
  const missing = { ...outline, entities: new Map([...outline.entities].filter(([fqn]) => fqn !== 'remarks.free')) }
  assert.equal(buildEmbedding(missing).get('remarks.free')?.index, undefined)
})

test('positions follow reading order: an entity is followed by its claims and terms, and standalone items come last', () => {
  assert.deepEqual([...buildContentPositions(outline).keys()], [
    'books.b',
    'books.b.parts.p1',
    'books.b.chapters.c1',
    'definitions.d1',
    'definitions.d1.claims.c',
    'definitions.d1.terms.t',
    'books.b.chapters.c1.sections.s1',
    'theorems.t1',
    'definitions.nested',
    'definitions.d1.remarks.attached',
    'remarks.free',
    'books.b.chapters.c1.sections.s2',
    'theorems.t1.proofs.p1',
    'definitions.epilogue',
    'books.b.chapters.c2',
    'books.b.chapters.c2.sections.s1',
    'theorems.t2',
    'books.b.parts.p2',
    'books.b.chapters.c3',
    'definitions.d3',
    'articles.a',
    'articles.a.sections.x',
  ])
  assert.deepEqual([...buildContentPositions(outline).values()], [...Array(22).keys()])
})

test('the index looks up books, chapters and sections by name, with their numbers', () => {
  const content = indexContent(outline)
  assert.equal(content.books.get('books.b'), book)
  assert.deepEqual(content.chapters.get('books.b.chapters.c2'), { chapter: c2, index: '2.' })
  assert.deepEqual(content.sections.get('books.b.chapters.c2.sections.s1'), { section: c2.sections[0], index: '2.1.' })
  assert.equal(content.sections.get('articles.a.sections.x'), undefined)
  assert.equal(content.embedding.get('theorems.t2')?.index, '2.1.')
  assert.equal(content.positions.get('articles.a'), 20)
})
