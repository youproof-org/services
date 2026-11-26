// The template context of each target type over a small outline, and a file's
// references resolved against it, with the reason for each that can't render.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  indexContent,
  parseRefTarget,
  type EntityLabelRegistry,
  type EntityLabelType,
  type OutlineBlock,
  type OutlineEntity,
  type RefTarget,
} from '@youproof.org/content-model'
import {
  buildContext,
  groupKeys,
  resolveReference,
  resolveReferences,
  TEMPLATE_CONTEXT_SHAPES,
  TEMPLATE_TARGET_TYPES,
  type ContextValue,
  type DisplaySegment,
  type DisplayTemplate,
  type DisplayTemplateCollection,
  type DisplayTemplateList,
  type ReferenceDisplayOptions,
} from '../src/index'

const labelType = (canonical: string, variants: Record<string, string> = {}): EntityLabelType => ({
  default: 'main',
  variants: Object.fromEntries(
    Object.entries({ main: canonical, ...variants }).map(([key, word]) => [key, { canonical: word, cases: { ine: { base: word, suffix: 'ban' } } }]),
  ),
})

const labels: EntityLabelRegistry = {
  hu: {
    cases: ['ine'],
    definition: labelType('definíció'),
    theorem: labelType('tétel', { lemma: 'lemma' }),
    proof: labelType('bizonyítás'),
    remark: labelType('megjegyzés'),
  },
}

const embed = (type: string, fqn: string): OutlineBlock => ({ type: 'embed', target: { type, fqn } })

function entity(type: OutlineEntity['type'], extra: Partial<OutlineEntity> = {}): OutlineEntity {
  return { type, locale: 'hu', body: [], terms: [], attached: false, ...extra }
}

const content = indexContent({
  books: [
    {
      name: 'b',
      title: 'Könyv',
      parts: [
        {
          name: 'p',
          chapters: [
            {
              name: 'c',
              title: 'Fejezet',
              prologue: [embed('definition', 'definitions.d')],
              sections: [{ name: 's', title: 'Szakasz', body: [embed('theorem', 'theorems.t'), embed('theorem', 'theorems.l')] }],
              epilogue: [],
            },
          ],
        },
      ],
    },
  ],
  entities: new Map<string, OutlineEntity>([
    ['definitions.d', entity('definition', { title: 'Gyűrű', body: [{ type: 'claim', name: 'c1' }, { type: 'narrative' }, { type: 'claim', name: 'c2' }], terms: ['x'] })],
    ['theorems.t', entity('theorem')],
    ['theorems.l', entity('theorem', { label: 'lemma' })],
    ['theorems.t.proofs.p', entity('proof')],
    ['theorems.t.remarks.r', entity('remark', { attached: true })],
  ]),
  standalones: (['article', 'newsletter', 'page', 'landing'] as const).map((kind) => ({ kind, name: kind, title: `A ${kind}`, sections: [] })),
})

const target = (fqn: string): RefTarget => parseRefTarget(fqn, 'test')
const context = (fqn: string) => buildContext(target(fqn), content, labels)

function shapeOf(value: ContextValue): unknown {
  if (typeof value === 'string') return 'text'
  if ('canonical' in value && 'cases' in value) return 'label'
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]))
}

test('every target type gets a context in the shape the template checks declare', () => {
  const fqns: Record<string, string> = {
    book: 'books.b',
    chapter: 'books.b.chapters.c',
    section: 'books.b.chapters.c.sections.s',
    definition: 'definitions.d',
    theorem: 'theorems.t',
    proof: 'theorems.t.proofs.p',
    remark: 'theorems.t.remarks.r',
    claim: 'definitions.d.claims.c2',
    term: 'definitions.d.terms.x',
    article: 'articles.article',
    newsletter: 'newsletters.newsletter',
    page: 'pages.page',
    landing: 'landings.landing',
  }
  assert.deepEqual(Object.keys(fqns).sort(), [...TEMPLATE_TARGET_TYPES].sort())
  for (const [type, fqn] of Object.entries(fqns)) {
    const ctx = context(fqn)
    assert.ok(ctx, `no context for ${type}`)
    assert.deepEqual(shapeOf(ctx.target), TEMPLATE_CONTEXT_SHAPES[type as keyof typeof TEMPLATE_CONTEXT_SHAPES], type)
  }
})

test('a context carries the numbers, titles and labels the content gives its target', () => {
  assert.deepEqual(context('books.b.chapters.c.sections.s'), { target: { index: '1.1.', name: 's', title: 'Szakasz', type: 'section' } })
  assert.deepEqual(context('definitions.d')?.target, {
    type: 'definition',
    name: 'd',
    title: 'Gyűrű',
    label: { canonical: 'definíció', cases: { ine: { base: 'definíció', suffix: 'ban' } } },
    index: '1.1.',
  })
  assert.equal(context('theorems.l')?.target.index, '1.3.')
  assert.deepEqual(context('theorems.l')?.target.label, { canonical: 'lemma', cases: { ine: { base: 'lemma', suffix: 'ban' } } })
  assert.equal(context('theorems.t.proofs.p')?.target.index, '')
  assert.equal(context('theorems.t')?.target.title, '')
  const claim = context('definitions.d.claims.c2')?.target
  assert.equal(claim?.index, '2.')
  assert.equal((claim?.parent as { index: string }).index, '1.1.')
  assert.equal(context('articles.article')?.target.title, 'A article')
})

test('a target the content does not hold, a part and a URL have no context', () => {
  for (const fqn of ['books.b.chapters.nope', 'definitions.d.claims.nope', 'definitions.nope.terms.x', 'books.b.parts.p', 'pages.nope', 'https://example.org']) {
    assert.equal(context(fqn), null, fqn)
  }
})

test('group keys name the type, the owning entity of a claim and the label variant of an entity', () => {
  assert.deepEqual(groupKeys(target('theorems.l'), content, labels), { type: 'theorem', label: 'theorem:lemma' })
  assert.deepEqual(groupKeys(target('theorems.t'), content, labels), { type: 'theorem', label: 'theorem:main' })
  assert.deepEqual(groupKeys(target('definitions.d.claims.c1'), content, labels), { type: 'claim', parent: 'definitions.d' })
  assert.deepEqual(groupKeys(target('https://example.org'), content, labels), {})
})

const single = (name: string, template: string): DisplayTemplate => ({ name, targets: ['definition', 'theorem'], kind: 'single', template })

const list = (name: string, spec: DisplayTemplateList): DisplayTemplate => ({ name, targets: ['theorem'], kind: 'list', list: spec })
const forms = () => ({ first: '[{target.index}]', middle: '[{target.index}]', last: '[{target.index}]', separator: ', ', lastSeparator: ' és ' })

const templates: DisplayTemplateCollection = {
  in: single('in', "a [{target.index} {base('ine', target.label)}]{suffix('ine', target.label)}"),
  acc: single('acc', "[{base('acc', target.label)}]"),
  title: single('title', '{target.title}'),
  list: list('list', { count: { min: 2 }, order: 'sorted', item: forms(), before: '', after: '' }),
  'by-label': list('by-label', {
    count: { min: 2 },
    groupBy: 'label',
    order: 'sorted',
    item: { ...forms(), only: '[{target.index}]' },
    group: { separator: '; ', lastSeparator: '; ' },
    before: '',
    after: '',
  }),
}

const options: ReferenceDisplayOptions = { locale: 'hu', templates, content, labels }

function bracketed(segments: DisplaySegment<RefTarget>[] | undefined): string | undefined {
  return segments?.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('')
}

test('a display renders through its template and a text item through its brackets, each link carrying its target', () => {
  const d = target('definitions.d')
  const resolved = resolveReference({ display: 'in', targets: [d] }, options)
  assert.equal(bracketed(resolved.segments), 'a [1.1. definíció]ban')
  assert.equal((resolved.segments?.[1] as { target: RefTarget }).target, d)
  assert.equal(bracketed(resolveReference({ text: 'a [gyűrű] ', targets: [d] }, options).segments), 'a [gyűrű] ')
})

test('a list template sorts its targets by reading order, and groups them when it groups by label variant', () => {
  const targets = [target('theorems.l'), target('theorems.t')]
  assert.equal(bracketed(resolveReference({ display: 'list', targets }, options).segments), '[1.2.] és [1.3.]')
  assert.equal(bracketed(resolveReference({ display: 'by-label', targets }, options).segments), '[1.2.]; [1.3.]')
})

test('each reference that cannot render says why', () => {
  const d = target('definitions.d')
  const errors = resolveReferences(
    [
      { display: 'nope', targets: [d] },
      { display: 'in', targets: [target('definitions.missing')] },
      { display: 'in', targets: [d, target('theorems.t')] },
      { display: 'acc', targets: [d] },
      { display: 'list', targets: [target('theorems.t')] },
      { display: 'title', targets: [target('theorems.t')] },
      { text: 'a [gyűrű]', targets: [d, target('theorems.t')] },
    ],
    options,
  ).map((resolved) => resolved.error)
  assert.deepEqual(errors, [
    "'nope' is not a display template in 'hu'.",
    "'definitions.missing' is not in the content graph.",
    "template 'in': the template takes exactly 1 target, not 2.",
    "case 'acc' is not declared. 'hu' declares: ine.",
    "template 'list': the template takes at least 2 targets, not 1.",
    "'theorems.t' renders no link; every target renders exactly one.",
    "'theorems.t' renders no link; every target renders exactly one.",
  ])
  assert.equal(resolveReference({ display: 'in', targets: [d] }, { ...options, templates: undefined }).error, "'in' is not a display template in 'hu'.")
})
