// The `references` list as the loader reads it: each kind of file reads its own text
// fields, the items get the segments the graph fills in, and every failure names the
// file. The item format and the checks themselves are tested in
// packages/display-templates.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as loaderModule from '../lib/content/loader.ts'

const { loadDefinition, loadChapter, loadSection, loadStandalone, ContentFormatError } =
  loaderModule.default ?? loaderModule

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

test("a display is checked against the collection of the file's own locale", () => {
  rejects(definition('references:\n  - { display: english-only, target: theorems.t }\n', '[0]'), /reference \[0\]: 'english-only' is not a display template in 'hu'/)
  const english = write('name: d\nslug: d\nlocale: en\ntitle: D\nreferences:\n  - { display: english-only, target: theorems.t }\nbody:\n  - type: narrative\n    content: See [0].\n')
  assert.equal(loadDefinition(english, '/ns', TEMPLATES).node.references[0].display, 'english-only')
})

// ---------------------------------------------------------------------------
// How the text uses the list
// ---------------------------------------------------------------------------

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
