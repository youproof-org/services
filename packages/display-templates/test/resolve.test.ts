import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DisplayListError,
  resolveDisplay,
  resolveList,
  resolveSingle,
  targetCountError,
  type ContextObject,
  type DisplaySegment,
  type DisplayTemplateList,
  type ListMember,
} from '../src/index'

/** Segments in the notation the plan's tables use: link text in brackets. */
function bracketed(segments: DisplaySegment<string>[]): string {
  return segments.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('')
}

const linkTargets = (segments: DisplaySegment<string>[]) =>
  segments.flatMap((s) => (s.kind === 'link' ? [s.target] : []))

function chapter(index: number): ListMember<string> {
  const key = `books.b.chapters.c${index}`
  return {
    target: key,
    key,
    context: { target: { index: `${index}.`, name: `c${index}`, title: `Fejezet ${index}`, type: 'chapter' } },
    position: index,
    groups: { type: 'chapter' },
  }
}

const LABELS: Record<string, ContextObject> = {
  lemma: { canonical: 'lemma', cases: {} },
  corollary: { canonical: 'következmény', cases: {} },
}

function theorem(index: string, variant: 'lemma' | 'corollary'): ListMember<string> {
  const key = `theorems.t-${index}`
  const [major, minor] = index.split('.').map(Number)
  return {
    target: key,
    key,
    context: { target: { index: `${index}.`, name: `t-${index}`, title: '', type: 'theorem', label: LABELS[variant] } },
    position: major * 100 + minor,
    groups: { type: 'theorem', label: `theorem/${variant}` },
  }
}

const THE_CHAPTERS_INE: DisplayTemplateList = {
  count: { min: 2 },
  order: 'sorted',
  item: {
    first: '{the(target.index)} [{target.index}]',
    middle: '[{target.index}]',
    last: '{the(target.index)} [{target.index} fejezet]',
    separator: ', ',
    lastSeparator: ' és ',
  },
  before: '',
  after: 'ekben',
}

const THE_ENTITIES: DisplayTemplateList = {
  count: { min: 2 },
  groupBy: 'label',
  order: 'sorted',
  item: {
    first: '{the(target.index)} [{target.index}]',
    middle: '[{target.index}]',
    last: '[{target.index} {capital(target.label.canonical)}]',
    only: '{the(target.index)} [{target.index} {capital(target.label.canonical)}]',
    separator: ', ',
    lastSeparator: ' és ',
  },
  group: { separator: ', ', lastSeparator: ', valamint ' },
  before: '',
  after: '',
}

// ---------------------------------------------------------------------------
// The plan's example tables
// ---------------------------------------------------------------------------

test('the-chapters-ine renders 2, 3 and 4 targets', () => {
  const rows: [number[], string][] = [
    [[13, 14], 'a [13.] és a [14. fejezet]ekben'],
    [[13, 14, 15], 'a [13.], [14.] és a [15. fejezet]ekben'],
    [[13, 14, 15, 16], 'a [13.], [14.], [15.] és a [16. fejezet]ekben'],
  ]
  for (const [indexes, expected] of rows) {
    assert.equal(bracketed(resolveList(THE_CHAPTERS_INE, indexes.map(chapter))), expected)
  }
})

test('the-entities groups by label, sorted by position, with the groups in the order of their first member', () => {
  const rows: [ListMember<string>[], string][] = [
    [
      [theorem('14.1', 'lemma'), theorem('15.3', 'corollary'), theorem('15.2', 'lemma'), theorem('15.4', 'corollary')],
      'a [14.1.] és [15.2. Lemma], valamint a [15.3.] és [15.4. Következmény]',
    ],
    [
      [theorem('14.1', 'lemma'), theorem('15.3', 'lemma'), theorem('15.2', 'lemma'), theorem('15.4', 'corollary')],
      'a [14.1.], [15.2.] és [15.3. Lemma], valamint a [15.4. Következmény]',
    ],
    [[theorem('14.1', 'lemma'), theorem('15.2', 'lemma')], 'a [14.1.] és [15.2. Lemma]'],
  ]
  for (const [members, expected] of rows) assert.equal(bracketed(resolveList(THE_ENTITIES, members)), expected)
})

// ---------------------------------------------------------------------------
// Links and segments
// ---------------------------------------------------------------------------

test('every item links to its own target, in reading order', () => {
  const segments = resolveList(THE_CHAPTERS_INE, [chapter(15), chapter(13), chapter(14)])
  assert.deepEqual(linkTargets(segments), ['books.b.chapters.c13', 'books.b.chapters.c14', 'books.b.chapters.c15'])
  assert.deepEqual(segments, [
    { kind: 'text', text: 'a ' },
    { kind: 'link', text: '13.', target: 'books.b.chapters.c13' },
    { kind: 'text', text: ', ' },
    { kind: 'link', text: '14.', target: 'books.b.chapters.c14' },
    { kind: 'text', text: ' és a ' },
    { kind: 'link', text: '15. fejezet', target: 'books.b.chapters.c15' },
    { kind: 'text', text: 'ekben' },
  ])
})

test('an item form without brackets is a link as a whole, and before and after are plain text', () => {
  const list: DisplayTemplateList = {
    ...THE_CHAPTERS_INE,
    item: { ...THE_CHAPTERS_INE.item, first: '{target.index}', middle: '{target.index}', last: '{target.index}' },
    before: 'lásd: ',
    after: ' fejezetek',
  }
  assert.deepEqual(resolveList(list, [chapter(1), chapter(2)]), [
    { kind: 'text', text: 'lásd: ' },
    { kind: 'link', text: '1.', target: 'books.b.chapters.c1' },
    { kind: 'text', text: ' és ' },
    { kind: 'link', text: '2.', target: 'books.b.chapters.c2' },
    { kind: 'text', text: ' fejezetek' },
  ])
})

test('a single template is the one-link case', () => {
  const { target, context } = chapter(5)
  assert.deepEqual(resolveSingle('{the(target.index)} [{target.index} fejezet]ben', target, context), [
    { kind: 'text', text: 'az ' },
    { kind: 'link', text: '5. fejezet', target: 'books.b.chapters.c5' },
    { kind: 'text', text: 'ben' },
  ])
})

test('a single template is resolved and trimmed before it is split into segments', () => {
  const { target, context } = chapter(2)
  assert.deepEqual(resolveSingle('  [{target.index}]  ', target, context), [
    { kind: 'text', text: '' },
    { kind: 'link', text: '2.', target },
    { kind: 'text', text: '' },
  ])
  assert.deepEqual(resolveSingle('{target.missing}', target, context), [])
})

// ---------------------------------------------------------------------------
// Order and grouping
// ---------------------------------------------------------------------------

test('order: authored keeps the reference\'s own order', () => {
  const list: DisplayTemplateList = { ...THE_CHAPTERS_INE, order: 'authored' }
  assert.equal(bracketed(resolveList(list, [chapter(15), chapter(13), chapter(14)])), 'a [15.], [13.] és a [14. fejezet]ekben')
})

test('members at the same position keep their authored order', () => {
  const a = { ...chapter(3), key: 'a', target: 'a', context: chapter(3).context }
  const b = { ...chapter(3), key: 'b', target: 'b', context: { target: { ...chapter(3).context.target, index: '3b.' } } }
  assert.equal(bracketed(resolveList(THE_CHAPTERS_INE, [b, a])), 'a [3b.] és a [3. fejezet]ekben')
})

test('positions count within each group, and a group of one uses the only form', () => {
  const members = [theorem('2.1', 'corollary'), theorem('1.1', 'lemma'), theorem('1.2', 'lemma'), theorem('3.1', 'lemma')]
  assert.equal(
    bracketed(resolveList(THE_ENTITIES, members)),
    'az [1.1.], [1.2.] és [3.1. Lemma], valamint a [2.1. Következmény]',
  )
})

test('three groups use the group separator, then the last group separator', () => {
  const LABELS3 = { ...THE_ENTITIES, groupBy: 'type' as const }
  const member = (key: string, type: string, position: number): ListMember<string> => ({
    target: key,
    key,
    context: { target: { index: `${position}.`, type, label: { canonical: type, cases: {} } } },
    position,
    groups: { type },
  })
  const segments = resolveList(LABELS3, [member('d', 'definition', 1), member('t', 'theorem', 2), member('r', 'remark', 3)])
  assert.equal(bracketed(segments), 'az [1. Definition], a [2. Theorem], valamint a [3. Remark]')
})

test('a member without the key its template groups by does not fit the template', () => {
  const ungrouped = { ...theorem('1.1', 'lemma'), groups: {} }
  assert.throws(
    () => resolveList(THE_ENTITIES, [ungrouped, theorem('1.2', 'lemma')]),
    (err) => err instanceof DisplayListError && /has no 'label' to group by/.test(err.message),
  )
})

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

test('a target count outside the bounds fails', () => {
  assert.throws(
    () => resolveList(THE_CHAPTERS_INE, [chapter(1)]),
    (err) => err instanceof DisplayListError && err.message === 'the template takes at least 2 targets, not 1',
  )
  const ranged: DisplayTemplateList = { ...THE_CHAPTERS_INE, count: { min: 2, max: 3 } }
  assert.throws(() => resolveList(ranged, [1, 2, 3, 4].map(chapter)), /takes 2 to 3 targets, not 4/)
  const exact: DisplayTemplateList = { ...THE_CHAPTERS_INE, count: { min: 3, max: 3 } }
  assert.throws(() => resolveList(exact, [1, 2].map(chapter)), /takes exactly 3 targets, not 2/)
  assert.equal(bracketed(resolveList(ranged, [1, 2, 3].map(chapter))), 'az [1.], [2.] és a [3. fejezet]ekben')
})

test('the same target twice fails', () => {
  assert.throws(
    () => resolveList(THE_CHAPTERS_INE, [chapter(1), chapter(2), chapter(1)]),
    (err) => err instanceof DisplayListError && err.message === "'books.b.chapters.c1' is listed twice",
  )
})

test('a lone item with no only form fails rather than guessing a form', () => {
  const loose: DisplayTemplateList = { ...THE_CHAPTERS_INE, count: { min: 1 } }
  assert.throws(() => resolveList(loose, [chapter(1)]), DisplayListError)
})

test('resolveDisplay dispatches on the template kind, and a single template takes exactly one target', () => {
  const single = { kind: 'single', name: 's', targets: ['chapter'], template: '[{target.index} fejezet]' } as const
  assert.equal(bracketed(resolveDisplay({ ...single, targets: [...single.targets] }, [chapter(7)])), '[7. fejezet]')
  assert.throws(() => resolveDisplay({ ...single, targets: [...single.targets] }, [chapter(7), chapter(8)]), /exactly 1 target, not 2/)
  const list = { kind: 'list' as const, name: 'l', targets: ['chapter' as const], list: THE_CHAPTERS_INE }
  assert.equal(bracketed(resolveDisplay(list, [chapter(8), chapter(7)])), 'a [7.] és a [8. fejezet]ekben')
})

test('targetCountError says why a template cannot render a count, for the loader to report', () => {
  const single = { kind: 'single' as const, name: 's', targets: ['chapter' as const], template: '[{target.index}]' }
  const list = (count: DisplayTemplateList['count']) => ({ kind: 'list' as const, name: 'l', targets: ['chapter' as const], list: { ...THE_CHAPTERS_INE, count } })
  assert.equal(targetCountError(single, 1), undefined)
  assert.equal(targetCountError(single, 2), 'takes exactly 1 target, not 2')
  assert.equal(targetCountError(list({ min: 2 }), 9), undefined)
  assert.equal(targetCountError(list({ min: 2 }), 1), 'takes at least 2 targets, not 1')
  assert.equal(targetCountError(list({ min: 2, max: 3 }), 4), 'takes 2 to 3 targets, not 4')
  assert.equal(targetCountError(list({ min: 3, max: 3 }), 2), 'takes exactly 3 targets, not 2')
})
