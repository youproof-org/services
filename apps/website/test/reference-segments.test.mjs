// A reference's resolved display as segments: how the graph builds them from a
// display, the hrefs each link carries, and how InlineText renders them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import * as graphModule from '../lib/content/graph.ts'
import * as urlsModule from '../lib/content/urls.ts'
import * as inlineTextModule from '../components/content/InlineText.tsx'

const { buildGraphFromRaw } = graphModule.default ?? graphModule
const { kbRefs } = urlsModule.default ?? urlsModule
const InlineText = inlineTextModule.default?.default ?? inlineTextModule.default

import { raw, ref } from './support/raw-graph.mjs'

const refsOf = (references) => buildGraphFromRaw(raw({ references })).definitions.get('definitions.def-egy').references

const shape = (segments) => segments.map((s) => (s.kind === 'link' ? `[${s.text}]` : s.text)).join('|')

const render = (text, refs) => renderToStaticMarkup(React.createElement(InlineText, { text, refs }))

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test('a template display resolves to the text around its link and the link', () => {
  const refs = refsOf({ r: ref('{the(target.index)} [{target.index} Tétel]ben', 'theorems.tetel-egy') })
  assert.equal(shape(refs.r.segments), 'az |[1.2. Tétel]|ben')
  assert.equal(refs.r.display, '{the(target.index)} [{target.index} Tétel]ben', 'the authored display is kept')
})

test('a display without brackets is one link, and literal text is not trimmed', () => {
  const refs = refsOf({
    whole: ref('{target.index} Tétel', 'theorems.tetel-egy'),
    literal: ref(' a [tétel] ', 'theorems.tetel-egy'),
  })
  assert.equal(shape(refs.whole.segments), '[1.2. Tétel]')
  assert.equal(shape(refs.literal.segments), ' a |[tétel]| ')
})

test('a display that resolves to nothing has no segments', () => {
  const refs = refsOf({ empty: ref('', 'theorems.tetel-egy'), blank: ref('{target.nothing}', 'theorems.tetel-egy') })
  assert.deepEqual(refs.empty.segments, [])
  assert.deepEqual(refs.blank.segments, [])
})

test('each link segment carries its target and the two hrefs of the entry', () => {
  const refs = refsOf({ r: ref('a [tétel]', 'theorems.tetel-egy') })
  const link = refs.r.segments.find((s) => s.kind === 'link')
  assert.equal(link.target, refs.r.target)
  assert.equal(link.href, refs.r.href)
  assert.equal(link.kbHref, refs.r.kbHref)
  assert.equal(link.kbHref, '/hu/tudasbazis/tetelek/tetel-egy')
})

test('kbRefs swaps in the knowledge-base href on every link segment', () => {
  const refs = refsOf({ r: ref('a [tétel]', 'theorems.tetel-egy') })
  const remapped = kbRefs(refs)
  assert.equal(remapped.r.segments[1].href, '/hu/tudasbazis/tetelek/tetel-egy')
  assert.equal(refs.r.segments[1].href, '/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy', 'the original is not mutated')
})

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const chapter = (name) => ({
  type: 'chapter', name, fqn: `books.b.chapters.${name}`, parentFqn: 'books.b', parentKind: 'book',
})

test('only the link segment is the link, and a sentence start capitalizes the first segment', () => {
  const refs = refsOf({ r: ref('a [tétel]ben', 'theorems.tetel-egy') })
  assert.equal(
    render('[r] áll. Lásd [r].', refs),
    'A <a href="/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy" target="_blank" data-target-fqn="theorems.tetel-egy" class="ref-concept">tétel</a>ben áll. ' +
      'Lásd a <a href="/hu/konyvek/konyv/fejezetek/fejezet#tetelek.tetel-egy" target="_blank" data-target-fqn="theorems.tetel-egy" class="ref-concept">tétel</a>ben.',
  )
})

test('a display that starts with its link is not capitalized, and one without brackets is', () => {
  const refs = refsOf({ starts: ref('[kis tétel]ben', 'theorems.tetel-egy'), whole: ref('kis tétel', 'theorems.tetel-egy') })
  assert.match(render('[starts] áll.', refs), /^<a [^>]*>kis tétel<\/a>ben áll\.$/)
  assert.match(render('[whole] áll.', refs), /^<a [^>]*>Kis tétel<\/a> áll\.$/)
})

test('every link segment renders with its own target and href', () => {
  const [c13, c14] = [chapter('c13'), chapter('c14')]
  const refs = {
    list: {
      display: 'the-chapters',
      target: c13,
      segments: [
        { kind: 'text', text: 'a ' },
        { kind: 'link', text: '13.', target: c13, href: '/c13' },
        { kind: 'text', text: ' és a ' },
        { kind: 'link', text: '14. fejezet', target: c14, href: '/c14' },
        { kind: 'text', text: 'ben' },
      ],
    },
  }
  assert.equal(
    render('Ez [list] van.', refs),
    'Ez a <a href="/c13" target="_blank" data-target-fqn="books.b.chapters.c13" class="ref-link">13.</a> és a ' +
      '<a href="/c14" target="_blank" data-target-fqn="books.b.chapters.c14" class="ref-link">14. fejezet</a>ben van.',
  )
})

test('an external link has no target attribute, and an empty display renders as an error', () => {
  const refs = refsOf({ ext: { display: 'a [Wikipédia]', target: { type: 'external', url: 'https://hu.wikipedia.org' } }, empty: ref('', 'theorems.tetel-egy') })
  assert.equal(
    render('Itt: [ext].', refs),
    'Itt: a <a href="https://hu.wikipedia.org" target="_blank" rel="noopener noreferrer" class="ref-link">Wikipédia</a>.',
  )
  assert.equal(render('Itt: [empty].', refs), 'Itt: <span class="ref-error">[empty]</span>.')
})
