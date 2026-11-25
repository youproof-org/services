// A reference's resolved display as segments: how the graph builds them from a
// collection template or literal text, the hrefs each link carries, how a list
// template orders and groups its targets, how InlineText renders them, and what the
// knowledge-base consumers read off them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import * as graphModule from '../lib/content/graph.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as inlineTextModule from '../components/content/InlineText.tsx'

const { buildGraphFromRaw } = graphModule.default ?? graphModule
const { kbRefs, kbRefLinks } = urlsModule.default ?? urlsModule
const InlineText = inlineTextModule.default?.default ?? inlineTextModule.default

import { claim, embed, hu, narrative, raw, ref, single, tpl } from './support/raw-graph.mjs'

/** The segments with each link in brackets, empty text segments left out. */
const shape = (segments) =>
  segments.filter((s) => s.kind === 'link' || s.text !== '').map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('|')
const linksOf = (entry) => entry.segments.filter((s) => s.kind === 'link')

const render = (text, refs) => renderToStaticMarkup(React.createElement(InlineText, { text, refs }))

/** Visible text with each link as [text](data-target-fqn). */
const linked = (html) =>
  html.replace(/<a [^>]*data-target-fqn="([^"]+)"[^>]*>([^<]*)<\/a>/g, '[$2]($1)').replace(/<[^>]+>/g, '')

const list = (fields) => ({
  kind: 'list',
  name: '',
  targets: fields.targets,
  list: {
    count: fields.count ?? { min: 2 },
    order: fields.order ?? 'sorted',
    ...(fields.groupBy ? { groupBy: fields.groupBy, group: fields.group } : {}),
    item: fields.item,
    before: fields.before ?? '',
    after: fields.after ?? '',
  },
})

const TEMPLATES = {
  'the-index-label-ine': single(['definition', 'theorem'], "{the(target.index)} [{target.index} {capital(base('ine', target.label))}]{suffix('ine', target.label)}"),
  'index-label': single(['theorem'], '[{target.index} {capital(target.label.canonical)}]'),
  'link-first-ine': single(['theorem'], "[{base('ine', target.label)}]{suffix('ine', target.label)}"),
  'proof-title': single(['proof'], '{target.title}'),
  'the-entities': list({
    targets: ['definition', 'theorem'],
    groupBy: 'label',
    item: {
      first: '{the(target.index)} [{target.index}]',
      middle: '[{target.index}]',
      last: '[{target.index} {capital(target.label.canonical)}]',
      only: '{the(target.index)} [{target.index} {capital(target.label.canonical)}]',
      separator: ', ',
      lastSeparator: ' és ',
    },
    group: { separator: ', ', lastSeparator: ', valamint ' },
  }),
  'the-entities-authored': list({
    targets: ['theorem'],
    order: 'authored',
    item: { first: '[{target.index}]', middle: '[{target.index}]', last: '[{target.index}]', separator: ', ', lastSeparator: ' és ' },
    before: 'a ',
    after: ' tételek',
  }),
  'the-claims': list({
    targets: ['claim'],
    groupBy: 'parent',
    item: {
      first: '{the(target.parent.index)} {target.parent.index} {capital(target.parent.label.canonical)} [{target.index}]',
      middle: '[{target.index}]',
      last: '[{target.index}] pontja',
      only: '{the(target.parent.index)} {target.parent.index} {capital(target.parent.label.canonical)} [{target.index}] pontja',
      separator: ', ',
      lastSeparator: ' és ',
    },
    group: { separator: ', ', lastSeparator: ', valamint ' },
  }),
  'by-type': list({
    targets: ['definition', 'theorem'],
    groupBy: 'type',
    item: {
      first: '[{target.index}]',
      middle: '[{target.index}]',
      last: '[{target.index} {capital(target.label.canonical)}]',
      only: '[{target.index} {capital(target.label.canonical)}]',
      separator: ', ',
      lastSeparator: ' és ',
    },
    group: { separator: ', ', lastSeparator: ' és ' },
  }),
  'three-at-most': list({
    targets: ['theorem'],
    count: { min: 2, max: 3 },
    item: { first: '[{target.index}]', middle: '[{target.index}]', last: '[{target.index}]', separator: ', ', lastSeparator: ' és ' },
  }),
  'chapters-by-parent': list({
    targets: ['chapter'],
    count: { min: 1 },
    groupBy: 'parent',
    item: { first: '[{target.index}]', middle: '[{target.index}]', last: '[{target.index}]', only: '[{target.index}]', separator: ', ', lastSeparator: ' és ' },
    group: { separator: ', ', lastSeparator: ' és ' },
  }),
}

const theorem = (name, label, body = [narrative('Tétel.')]) => ({
  ...hu,
  name,
  slug: name,
  title: name,
  ...(label ? { label } : {}),
  body,
  references: [],
  proofSlugs: [],
  remarkSlugs: [],
})

/**
 * The shared fixture plus four theorems embedded after it, two lemmas and two
 * corollaries, numbered 1.3 to 1.6 in embed order. The theorem of the fixture has
 * two claims.
 */
function graphWith(references) {
  const data = raw({ references, displayTemplates: TEMPLATES })
  data.theorems[0].body = [narrative('Tétel.'), claim('t-elso', 't-elso'), claim('t-masodik', 't-masodik')]
  data.theorems.push(
    theorem('lemma-a', 'lemma'),
    theorem('lemma-c', 'lemma'),
    theorem('kov-b', 'corollary'),
    theorem('kov-d', 'corollary'),
  )
  data.books[0].parts[0].chapters[0].sections[0].body.push(
    embed('theorems.lemma-a'),
    embed('theorems.lemma-c'),
    embed('theorems.kov-b'),
    embed('theorems.kov-d'),
  )
  return buildGraphFromRaw(data)
}

const refsOf = (references) => graphWith(references).definitions.get('definitions.def-egy').references

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('a display resolves through its template in the collection of the file\'s locale', () => {
  const [entry] = refsOf([tpl('the-index-label-ine', 'theorems.tetel-egy')])
  assert.equal(shape(entry.segments), 'az |[1.2. Tétel]|ben')
  assert.equal(entry.display, 'the-index-label-ine', 'the template name is kept')
})

test('a text item is its literal text, a link as a whole without brackets, and not trimmed', () => {
  const refs = refsOf([ref('kis tétel', 'theorems.tetel-egy'), ref(' a [tétel] ', 'theorems.tetel-egy')])
  assert.equal(shape(refs[0].segments), '[kis tétel]')
  assert.equal(shape(refs[1].segments), ' a |[tétel]| ')
})

test('each link segment carries its own target and both hrefs', () => {
  const [entry] = refsOf([ref('a [tétel]', 'theorems.tetel-egy')])
  const [link] = linksOf(entry)
  assert.equal(link.target, entry.targets[0])
  assert.equal(link.href, '/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy')
  assert.equal(link.kbHref, '/hu/tudasbazis/tetelek/tetel-egy')
  assert.equal(entry.href, undefined, 'hrefs live on the links, not on the item')
})

test('a list template sorts its targets by position and groups them by label variant', () => {
  const [entry] = refsOf([
    tpl('the-entities', 'theorems.lemma-a', 'theorems.kov-b', 'theorems.lemma-c', 'theorems.kov-d'),
  ])
  assert.equal(shape(entry.segments), 'az |[1.3.]| és |[1.4. Lemma]|, valamint az |[1.5.]| és |[1.6. Következmény]')
  assert.deepEqual(
    linksOf(entry).map((link) => link.target.fqn),
    ['theorems.lemma-a', 'theorems.lemma-c', 'theorems.kov-b', 'theorems.kov-d'],
  )
})

test('a group of one takes the only form, and the label of an entity without one is its type\'s default', () => {
  const [entry] = refsOf([tpl('the-entities', 'theorems.kov-b', 'theorems.tetel-egy', 'theorems.lemma-a')])
  assert.equal(shape(entry.segments), 'az |[1.2. Tétel]|, az |[1.3. Lemma]|, valamint az |[1.5. Következmény]')
})

test('a template with order: authored keeps the reference\'s own order', () => {
  const [entry] = refsOf([tpl('the-entities-authored', 'theorems.kov-d', 'theorems.lemma-a', 'theorems.kov-b')])
  assert.equal(shape(entry.segments), 'a |[1.6.]|, |[1.3.]| és |[1.5.]| tételek')
})

test('claims group by the entity that owns them, in claim order', () => {
  const [entry] = refsOf([
    tpl(
      'the-claims',
      'theorems.tetel-egy.claims.t-masodik',
      'definitions.def-egy.claims.def-claim',
      'theorems.tetel-egy.claims.t-elso',
    ),
  ])
  assert.equal(
    shape(entry.segments),
    'az 1.1. Definíció |[1.]| pontja, valamint az 1.2. Tétel |[1.]| és |[2.]| pontja',
  )
  assert.deepEqual(linksOf(entry).map((link) => link.target.name), ['def-claim', 't-elso', 't-masodik'])
})

test('grouping by type separates definitions from theorems', () => {
  const [entry] = refsOf([tpl('by-type', 'theorems.lemma-a', 'definitions.def-egy', 'theorems.tetel-egy')])
  assert.equal(shape(entry.segments), '[1.1. Definíció]| és |[1.2.]| és |[1.3. Lemma]')
})

test('every target of a multi-reference resolves its own hrefs', () => {
  const [entry] = refsOf([tpl('the-entities', 'theorems.lemma-a', 'theorems.lemma-c')])
  assert.deepEqual(
    linksOf(entry).map((link) => [link.href, link.kbHref]),
    [
      ['/hu/konyvek/konyv/fejezetek/fejezet#tetelek.lemma-a', '/hu/tudasbazis/tetelek/lemma-a'],
      ['/hu/konyvek/konyv/fejezetek/fejezet#tetelek.lemma-c', '/hu/tudasbazis/tetelek/lemma-c'],
    ],
  )
})

// ---------------------------------------------------------------------------
// What the graph rejects
// ---------------------------------------------------------------------------

/** Asserts building the graph fails, naming the definition's reference [0] and `problem`. */
function rejects(references, problem) {
  assert.throws(
    () => refsOf(references),
    (err) => err.message.startsWith('Reference [0] in definition "def-egy": ') && problem.test(err.message),
  )
}

test('a display that is not a template of the file\'s locale fails the build', () => {
  rejects([tpl('nincs-ilyen', 'theorems.tetel-egy')], /'nincs-ilyen' is not a display template in 'hu'/)
})

test('a target the graph does not hold fails the build', () => {
  rejects([tpl('index-label', 'theorems.nincs-ilyen')], /'theorems.nincs-ilyen' is not in the content graph/)
})

test('a target count outside the template\'s count fails the build', () => {
  rejects([tpl('three-at-most', 'theorems.lemma-a')], /template 'three-at-most': the template takes 2 to 3 targets, not 1/)
  rejects([tpl('index-label', 'theorems.lemma-a', 'theorems.lemma-c')], /the template takes exactly 1 target, not 2/)
})

test('a group-by its targets do not support fails the build', () => {
  rejects(
    [tpl('chapters-by-parent', 'books.konyv.chapters.fejezet')],
    /template 'chapters-by-parent': 'books.konyv.chapters.fejezet' has no 'parent' to group by/,
  )
})

test('a target whose display renders no link fails the build', () => {
  rejects([tpl('proof-title', 'theorems.tetel-egy.proofs.biz-egy')], /'theorems.tetel-egy.proofs.biz-egy' renders no link/)
})

test('a target its owner kind may not reference fails the build, naming the index', () => {
  const data = raw({ displayTemplates: TEMPLATES })
  data.standalones.push({
    kind: 'page', name: 'jogi', slug: 'jogi', locale: 'hu', title: 'Jogi',
    abstract: [], prologue: [], sections: [], epilogue: [],
    references: [ref('kifelé', 'https://example.org'), ref('a [definíció]', 'definitions.def-egy')],
  })
  assert.throws(
    () => buildGraphFromRaw(data),
    /^Error: Reference \[1\] in page "jogi" targets 'definition', which a page may not reference/,
  )
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

test('[i] renders the i-th item, and a sentence start capitalizes its first visible character', () => {
  const refs = refsOf([ref('a [tétel]ben', 'theorems.tetel-egy'), ref('a [tétel]ben', 'theorems.tetel-egy')])
  assert.equal(
    render('[0] áll. Lásd [1].', refs),
    'A <a href="/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy" target="_blank" data-target-fqn="theorems.tetel-egy" class="ref-concept">tétel</a>ben áll. ' +
      'Lásd a <a href="/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy" target="_blank" data-target-fqn="theorems.tetel-egy" class="ref-concept">tétel</a>ben.',
  )
})

test('a display that starts with its link is capitalized inside the link', () => {
  const refs = refsOf([tpl('link-first-ine', 'theorems.tetel-egy'), ref('kis tétel', 'theorems.tetel-egy')])
  assert.match(render('[0] áll.', refs), /^<a [^>]*>Tétel<\/a>ben áll\.$/)
  assert.match(render('[1] áll.', refs), /^<a [^>]*>Kis tétel<\/a> áll\.$/)
  assert.match(render('Itt [0] áll.', refs), /^Itt <a [^>]*>tétel<\/a>ben áll\.$/)
})

test('a grouped multi-reference renders one link per target, each with its own href and target', () => {
  const refs = kbRefs(refsOf([
    tpl('the-entities', 'theorems.lemma-a', 'theorems.kov-b', 'theorems.lemma-c', 'theorems.kov-d'),
  ]))
  const html = render('[0] szerint igaz.', refs)
  assert.equal(
    linked(html),
    'Az [1.3.](theorems.lemma-a) és [1.4. Lemma](theorems.lemma-c), valamint az [1.5.](theorems.kov-b) és ' +
      '[1.6. Következmény](theorems.kov-d) szerint igaz.',
  )
  for (const name of ['lemma-a', 'lemma-c', 'kov-b', 'kov-d']) {
    assert.ok(html.includes(`href="/hu/tudasbazis/tetelek/${name}" target="_blank" data-target-fqn="theorems.${name}"`), name)
  }
})

test('kbRefs swaps in the knowledge-base href on every link segment, without mutating', () => {
  const refs = refsOf([tpl('the-entities', 'theorems.lemma-a', 'theorems.lemma-c')])
  const remapped = kbRefs(refs)
  assert.deepEqual(linksOf(remapped[0]).map((link) => link.href), ['/hu/tudasbazis/tetelek/lemma-a', '/hu/tudasbazis/tetelek/lemma-c'])
  assert.equal(linksOf(refs[0])[0].href, '/hu/konyvek/konyv/fejezetek/fejezet#tetelek.lemma-a', 'the original is not mutated')
})

test('kbRefLinks is every link of every item in reading order, one per target', () => {
  const links = kbRefLinks(refsOf([
    ref('a [tétel]', 'theorems.tetel-egy'),
    tpl('the-entities', 'theorems.kov-b', 'theorems.lemma-a'),
    ref('[kifelé]', 'https://example.org'),
  ]))
  assert.deepEqual(
    links.map((link) => link.target.fqn ?? link.target.url),
    ['theorems.tetel-egy', 'theorems.lemma-a', 'theorems.kov-b', 'https://example.org'],
  )
  assert.equal(links[1].href, '/hu/tudasbazis/tetelek/lemma-a')
})

test('an external link has no target attribute, and a missing item or a name token renders as an error', () => {
  const refs = refsOf([ref('a [Wikipédia]', 'https://hu.wikipedia.org')])
  assert.equal(
    render('Itt: [0].', refs),
    'Itt: a <a href="https://hu.wikipedia.org" target="_blank" rel="noopener noreferrer" class="ref-link">Wikipédia</a>.',
  )
  assert.equal(render('Itt: [1].', refs), 'Itt: <span class="ref-error">[1]</span>.')
  assert.equal(render('Itt: [regi-kulcs].', refs), 'Itt: <span class="ref-error">[regi-kulcs]</span>.')
})

test('a [0] inside math and a [[term]] are not references', () => {
  const refs = refsOf([ref('HIBA', 'theorems.tetel-egy')])
  assert.doesNotMatch(render('Az $[0]_3$ osztály és [[nincs]].', refs), /HIBA/)
})
