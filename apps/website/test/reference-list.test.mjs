// The `references` list as the loader reads it: the item format, the checks against
// the display template collection of the file's locale, and the checks of how the
// file's text uses the list. Every failure names the file, and a file's problems are
// reported together.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as loaderModule from '../lib/content/loader.ts'
import * as tokensModule from '../lib/content/inline-tokens.ts'

const { loadDefinition, loadChapter, loadSection, loadStandalone, referenceTexts, ContentFormatError } =
  loaderModule.default ?? loaderModule
const { referenceTokens } = tokensModule.default ?? tokensModule

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-list-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

function write(yamlText, name = 'definicio.yaml') {
  const dir = fs.mkdtempSync(path.join(tmp, 'case-'))
  const file = path.join(dir, name)
  fs.writeFileSync(file, yamlText)
  return file
}

const TEMPLATES = {
  hu: {
    'the-index-label': {
      kind: 'single',
      name: 'the-index-label',
      targets: ['definition', 'theorem'],
      template: '{the(target.index)} [{target.index} {capital(target.label.canonical)}]',
    },
    'the-chapters': {
      kind: 'list',
      name: 'the-chapters',
      targets: ['chapter'],
      list: {
        count: { min: 2, max: 3 },
        order: 'sorted',
        item: { first: '[{target.index}]', middle: '[{target.index}]', last: '[{target.index} fejezet]', separator: ', ', lastSeparator: ' és ' },
        before: '',
        after: '',
      },
    },
  },
  en: {
    'english-only': { kind: 'single', name: 'english-only', targets: ['theorem'], template: '[{target.index}]' },
  },
}

/** A definition file with `references` and a body of narrative blocks. */
function definition(references, ...narratives) {
  const body = narratives.map((content) => `  - type: narrative\n    content: ${JSON.stringify(content)}\n`).join('')
  return write(`name: d\nslug: d\nlocale: hu\ntitle: D\n${references}body:\n${body || '  []\n'}`)
}

const load = (file) => loadDefinition(file, '/ns', TEMPLATES)

/** Asserts the file fails to load, naming it, with every one of `problems` in the message. */
function rejects(file, ...problems) {
  assert.throws(
    () => load(file),
    (err) => {
      assert.ok(err instanceof ContentFormatError, `expected a ContentFormatError, got ${err}`)
      assert.match(err.message, /definicio\.yaml — /)
      for (const problem of problems) assert.match(err.message, problem)
      return true
    },
  )
}

// ---------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------

test('a list item with one target, a display or a text, loads with its targets as a list', () => {
  const node = load(definition(
    'references:\n' +
      '  - { display: the-index-label, target: theorems.t }\n' +
      '  - { text: "a [gyűrű]k", targets: [definitions.gyuru] }\n' +
      '  - { display: the-chapters, targets: [books.b.chapters.a, books.b.chapters.c] }\n',
    'Lásd [0], [1] és [2].',
  )).node
  assert.deepEqual(
    node.references.map(({ display, text, targets, segments }) => ({ display, text, targets: targets.map((t) => t.fqn), segments })),
    [
      { display: 'the-index-label', text: undefined, targets: ['theorems.t'], segments: [] },
      { display: undefined, text: 'a [gyűrű]k', targets: ['definitions.gyuru'], segments: [] },
      { display: 'the-chapters', text: undefined, targets: ['books.b.chapters.a', 'books.b.chapters.c'], segments: [] },
    ],
  )
})

test('a file without references has an empty list', () => {
  assert.deepEqual(load(definition('', 'Nincs hivatkozás.')).node.references, [])
})

test('a references dictionary fails the build, naming the file and saying the format changed', () => {
  rejects(
    definition('references:\n  regi-kulcs:\n    display: a tétel\n    target: theorems.t\n', 'Lásd [regi-kulcs].'),
    /'references' is a dictionary of named references, which is no longer supported\. It is now a list/,
    /\[0\], \[1\]/,
  )
})

test('an item has exactly one of target and targets, and exactly one of display and text', () => {
  rejects(
    definition(
      'references:\n' +
        '  - { display: the-index-label, target: theorems.t, targets: [theorems.u] }\n' +
        '  - { display: the-index-label }\n' +
        '  - { display: the-index-label, text: a tétel, target: theorems.t }\n' +
        '  - { target: theorems.t }\n' +
        '  - { text: a tétel, targets: [] }\n' +
        '  - { text: "", target: theorems.t }\n' +
        '  - { text: a tétel, target: theorems.t, case: ine }\n' +
        '  - just a string\n',
      '[0] [1] [2] [3] [4] [5] [6] [7]',
    ),
    /reference \[0\]: an item has exactly one of 'target' and 'targets'/,
    /reference \[1\]: an item has exactly one of 'target' and 'targets'/,
    /reference \[2\]: an item has exactly one of 'display' and 'text'/,
    /reference \[3\]: an item has exactly one of 'display' and 'text'/,
    /reference \[4\]: 'targets' must be a non-empty list/,
    /reference \[5\]: 'text' must be non-empty link text/,
    /reference \[6\]: unknown key 'case'\. Known: display, text, target, targets/,
    /reference \[7\]: an item is a mapping/,
  )
})

test('a malformed target is reported with the item it is in', () => {
  rejects(
    definition('references:\n  - { text: a tétel, target: 42 }\n', '[0]'),
    /reference \[0\]: 'target' must be a string/,
  )
})

test('a text with an expression fails the build, and so do brackets that mark no single link', () => {
  rejects(
    definition(
      'references:\n' +
        '  - { text: "{the(target.index)} [{target.index}]", target: theorems.t }\n' +
        '  - { text: "[a] és [b]", target: theorems.t }\n' +
        '  - { text: "modulo $p^{c+1}$ [maradékosztály]", target: theorems.t }\n',
      '[0] [1] [2]',
    ),
    /reference \[0\]: text: \{the\(target\.index\)\} is an expression, and literal text has none/,
    /reference \[1\]: text: it may hold one link/,
  )
  assert.doesNotThrow(
    () => load(definition('references:\n  - { text: "modulo $p^{c+1}$ [m]", target: theorems.t }\n', '[0]')),
    'braces inside math are not an expression',
  )
})

test('a text item has one target', () => {
  rejects(
    definition('references:\n  - { text: a tételek, targets: [theorems.t, theorems.u] }\n', '[0]'),
    /reference \[0\]: a 'text' item has one target\. Several targets need a list template in 'display'/,
  )
})

test('the same target twice in one item fails the build', () => {
  rejects(
    definition('references:\n  - { display: the-chapters, targets: [books.b.chapters.a, books.b.chapters.a] }\n', '[0]'),
    /reference \[0\]: lists 'books\.b\.chapters\.a' twice/,
  )
})

// ---------------------------------------------------------------------------
// Against the collection
// ---------------------------------------------------------------------------

test('a display must be a template of the file\'s own locale', () => {
  rejects(
    definition('references:\n  - { display: english-only, target: theorems.t }\n  - { display: nincs, target: theorems.t }\n', '[0] [1]'),
    /reference \[0\]: 'english-only' is not a display template in 'hu'/,
    /reference \[1\]: 'nincs' is not a display template in 'hu'/,
  )
  const english = write('name: d\nslug: d\nlocale: en\ntitle: D\nreferences:\n  - { display: english-only, target: theorems.t }\nbody:\n  - type: narrative\n    content: See [0].\n')
  assert.equal(loadDefinition(english, '/ns', TEMPLATES).node.references[0].display, 'english-only')
})

test('a target type the template does not accept fails the build', () => {
  rejects(
    definition(
      'references:\n' +
        '  - { display: the-index-label, target: books.b.chapters.a }\n' +
        '  - { display: the-index-label, target: "https://example.org" }\n',
      '[0] [1]',
    ),
    /reference \[0\]: template 'the-index-label' takes definition, theorem targets, not a chapter \('books\.b\.chapters\.a'\)/,
    /reference \[1\]: template 'the-index-label' takes definition, theorem targets, not a URL \('https:\/\/example\.org'\)/,
  )
})

test('a target count outside the template\'s count fails the build', () => {
  rejects(
    definition(
      'references:\n' +
        '  - { display: the-index-label, targets: [theorems.t, theorems.u] }\n' +
        '  - { display: the-chapters, target: books.b.chapters.a }\n' +
        '  - { display: the-chapters, targets: [books.b.chapters.a, books.b.chapters.b, books.b.chapters.c, books.b.chapters.d] }\n',
      '[0] [1] [2]',
    ),
    /reference \[0\]: template 'the-index-label' takes exactly 1 target, not 2/,
    /reference \[1\]: template 'the-chapters' takes 2 to 3 targets, not 1/,
    /reference \[2\]: template 'the-chapters' takes 2 to 3 targets, not 4/,
  )
})

// ---------------------------------------------------------------------------
// How the text uses the list
// ---------------------------------------------------------------------------

const TWO = 'references:\n  - { text: egy, target: theorems.t }\n  - { text: kettő, target: theorems.u }\n'

test('a token with no item, an item never used and an item used twice fail the build', () => {
  rejects(
    definition(TWO, 'Lásd [0] és [0], de [5] nincs.'),
    /\[5\] has no item: the 'references' list has 2 items/,
    /reference \[0\] is used 2 times: each item is used once/,
    /reference \[1\] is not used in the text/,
  )
})

test('a list not in the order the text uses it fails the build', () => {
  rejects(definition(TWO, 'Előbb [1], aztán [0].'), /not in the order the text uses it: \[1\] comes before \[0\]/)
  assert.doesNotThrow(() => load(definition(TWO, 'Előbb [0].', 'Aztán [1].')))
})

test('a reference by name, the old token, fails the build', () => {
  rejects(
    definition('references:\n  - { text: egy, target: theorems.t }\n', 'Lásd [0] és [regi-kulcs].'),
    /\[regi-kulcs\] names a reference, which the text no longer does/,
  )
})

test('a [0] inside math, a [[term]] and a [*] are not reference tokens', () => {
  assert.doesNotThrow(() => load(definition('', 'Az $[0]_3$ osztály, a [[term]] és a [*].')))
})

test('every problem of a file is reported at once', () => {
  rejects(
    definition(
      'references:\n' +
        '  - { display: nincs, target: theorems.t }\n' +
        '  - { text: "{x}", target: theorems.t }\n',
      'Csak [1] és [7].',
    ),
    /'nincs' is not a display template/,
    /\{x\} is an expression/,
    /\[7\] has no item/,
    /reference \[0\] is not used/,
  )
})

// ---------------------------------------------------------------------------
// Order of appearance
// ---------------------------------------------------------------------------

test('the text fields are read in the order the site renders them, latex blocks included', () => {
  const blocks = [
    { type: 'narrative', content: 'n' },
    { type: 'formula', leadIn: 'f-in', content: '[9]', leadOut: 'f-out' },
    { type: 'figure', leadIn: 'fig-in', src: 'x', caption: 'fig-caption' },
    { type: 'ordered-list', leadIn: 'l-in', items: ['l-1', 'l-2'] },
    { type: 'typewriter', leadIn: 'tw-in', rows: ['[9]'] },
    { type: 'quote', leadIn: 'q-in', quote: 'q', author: 'a' },
    { type: 'embed', target: { type: 'theorem', name: 't', fqn: 'theorems.t' } },
    { type: 'subsection', title: 'sub-title', blocks: [{ type: 'narrative', content: 'sub-n' }] },
    { type: 'details', title: 'det-title', blocks: [{ type: 'claim', name: 'c', content: 'det-claim' }] },
    { type: 'narrative', content: 'latex', context: 'latex' },
  ]
  assert.deepEqual(referenceTexts(blocks), [
    'n', 'f-in', 'f-out', 'fig-in', 'fig-caption', 'l-in', 'l-1', 'l-2', 'tw-in', 'q-in', 'q',
    'sub-n', 'det-title', 'det-claim', 'latex',
  ])
})

test('reference tokens are read at the top level and inside bold, not inside math or superscript', () => {
  assert.deepEqual(
    [...referenceTokens('[0] **[1] ***[2]***** $[9]$ ^[8]^ [[t]] [*] [kulcs]')],
    [{ kind: 'ref', index: 0 }, { kind: 'ref', index: 1 }, { kind: 'ref', index: 2 }, { kind: 'legacy-ref', key: 'kulcs' }],
  )
})

test('a chapter reads abstract, prerequisite warning, prologue and epilogue in that order', () => {
  const chapter = (order) => write(
    'name: c\nslug: c\nlocale: hu\ntitle: C\n' +
      'references:\n  - { text: egy, target: theorems.t }\n  - { text: kettő, target: theorems.u }\n' +
      '  - { text: három, target: theorems.v }\n  - { text: négy, target: theorems.w }\n' +
      ['abstract', 'prerequisite-warning', 'prologue', 'epilogue']
        .map((field, i) => `${field}:\n  - type: narrative\n    content: "[${order[i]}]"\n`)
        .join(''),
    'chapter.yaml',
  )
  assert.equal(loadChapter(chapter([0, 1, 2, 3]), TEMPLATES).references.length, 4)
  assert.throws(() => loadChapter(chapter([0, 1, 3, 2]), TEMPLATES), /chapter\.yaml — .*\[3\] comes before \[2\]/s)
})

test('a section and a standalone item check their own references', () => {
  const section = write('name: s\nslug: s\nlocale: hu\ntitle: S\nreferences:\n  - { text: egy, target: theorems.t }\nbody: []\n', 'szakasz.yaml')
  assert.throws(() => loadSection(section, TEMPLATES, '/fig'), /szakasz\.yaml — reference \[0\] is not used in the text/)
  const page = write(
    'name: p\nslug: p\nlocale: hu\ntitle: P\nreferences:\n  - { text: egy, target: pages.q }\n  - { text: kettő, target: pages.r }\n' +
      'abstract:\n  - type: narrative\n    content: "[0]"\nepilogue:\n  - type: narrative\n    content: "[1]"\n',
    'page.yaml',
  )
  assert.equal(loadStandalone(page, TEMPLATES).references.length, 2)
})
