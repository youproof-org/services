// The `references` list reader: the item format, the checks against the display
// template collection of the file's locale, and the checks of how the file's text
// uses the list. A file's problems are reported together.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'

import {
  fileReferenceTexts,
  readReferences,
  referenceTexts,
  referenceTokens,
  type DisplayTemplateCollection,
  type ReferenceFileKind,
} from '../src/index'

const TEMPLATES: Record<string, DisplayTemplateCollection> = {
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

function read(yamlText: string, kind: ReferenceFileKind = 'entity') {
  const raw = yaml.load(yamlText) as Record<string, unknown>
  return readReferences(raw.references, { locale: raw.locale as string, templates: TEMPLATES, texts: fileReferenceTexts(raw, kind) })
}

/** A definition file with `references` and a body of narrative blocks. */
function definition(references: string, ...narratives: string[]): string {
  const body = narratives.map((content) => `  - type: narrative\n    content: ${JSON.stringify(content)}\n`).join('')
  return `name: d\nslug: d\nlocale: hu\ntitle: D\n${references}body:\n${body || '  []\n'}`
}

function load(yamlText: string, kind?: ReferenceFileKind) {
  const { references, errors } = read(yamlText, kind)
  assert.deepEqual(errors, [])
  return references
}

/** Asserts the file's references fail, with every one of `problems` among the errors. */
function rejects(yamlText: string, ...problems: RegExp[]) {
  const message = read(yamlText).errors.join('\n')
  assert.ok(message !== '', 'expected errors, got none')
  for (const problem of problems) assert.match(message, problem)
}

// ---------------------------------------------------------------------------
// Format

test('a list item with one target, a display or a text, reads with its targets as a list', () => {
  const references = load(definition(
    'references:\n' +
      '  - { display: the-index-label, target: theorems.t }\n' +
      '  - { text: "a [gyűrű]k", targets: [definitions.gyuru] }\n' +
      '  - { display: the-chapters, targets: [books.b.chapters.a, books.b.chapters.c] }\n',
    'Lásd [0], [1] és [2].',
  ))
  assert.deepEqual(
    references.map((item) => ({ display: item?.display, text: item?.text, targets: item?.targets.map((t) => (t.type === 'external' ? t.url : t.fqn)) })),
    [
      { display: 'the-index-label', text: undefined, targets: ['theorems.t'] },
      { display: undefined, text: 'a [gyűrű]k', targets: ['definitions.gyuru'] },
      { display: 'the-chapters', text: undefined, targets: ['books.b.chapters.a', 'books.b.chapters.c'] },
    ],
  )
  assert.deepEqual(references[0]?.targets[0], { type: 'theorem', name: 't', fqn: 'theorems.t', parentFqn: '', parentKind: null })
})

test('a file without references has an empty list', () => {
  assert.deepEqual(load(definition('', 'Nincs hivatkozás.')), [])
})

test('a references dictionary is rejected on its own, saying the format changed', () => {
  const { references, errors } = read(definition('references:\n  regi-kulcs:\n    display: a tétel\n    target: theorems.t\n', 'Lásd [regi-kulcs].'))
  assert.deepEqual(references, [])
  assert.equal(errors.length, 1)
  assert.match(errors[0], /'references' is a dictionary of named references, which is no longer supported\. It is now a list/)
  assert.match(errors[0], /\[0\], \[1\]/)
})

test('a references value that is neither a list nor a dictionary is rejected', () => {
  assert.deepEqual(read(definition('references: 3\n', 'x')).errors, ["'references' must be a list of items"])
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

test('an item that cannot be read leaves a gap, so the indexes still match the tokens', () => {
  const { references } = read(definition('references:\n  - just a string\n  - { text: egy, target: theorems.t }\n', '[0] [1]'))
  assert.equal(references.length, 2)
  assert.equal(references[0], undefined)
  assert.equal(references[1]?.text, 'egy')
})

test('a malformed target is reported with the item it is in', () => {
  rejects(definition('references:\n  - { text: a tétel, target: 42 }\n', '[0]'), /reference \[0\]: 'target' must be a string/)
  rejects(definition('references:\n  - { text: a tétel, target: proofs.p }\n', '[0]'), /reference \[0\]: 'proofs\.p' puts a 'proof' at the root/)
})

test('a text with an expression fails, and so do brackets that mark no single link', () => {
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
  load(definition('references:\n  - { text: "modulo $p^{c+1}$ [m]", target: theorems.t }\n', '[0]'))
})

test('a text item has one target', () => {
  rejects(
    definition('references:\n  - { text: a tételek, targets: [theorems.t, theorems.u] }\n', '[0]'),
    /reference \[0\]: a 'text' item has one target\. Several targets need a list template in 'display'/,
  )
})

test('the same target twice in one item fails', () => {
  rejects(
    definition('references:\n  - { display: the-chapters, targets: [books.b.chapters.a, books.b.chapters.a] }\n', '[0]'),
    /reference \[0\]: lists 'books\.b\.chapters\.a' twice/,
  )
})

// ---------------------------------------------------------------------------
// Against the collection

test("a display must be a template of the file's own locale", () => {
  rejects(
    definition('references:\n  - { display: english-only, target: theorems.t }\n  - { display: nincs, target: theorems.t }\n', '[0] [1]'),
    /reference \[0\]: 'english-only' is not a display template in 'hu'/,
    /reference \[1\]: 'nincs' is not a display template in 'hu'/,
  )
  const english = 'name: d\nslug: d\nlocale: en\ntitle: D\nreferences:\n  - { display: english-only, target: theorems.t }\nbody:\n  - type: narrative\n    content: See [0].\n'
  assert.equal(load(english)[0]?.display, 'english-only')
})

test('a target type the template does not accept fails', () => {
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

test("a target count outside the template's count fails", () => {
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

const TWO = 'references:\n  - { text: egy, target: theorems.t }\n  - { text: kettő, target: theorems.u }\n'

test('a token with no item, an item never used and an item used twice fail', () => {
  rejects(
    definition(TWO, 'Lásd [0] és [0], de [5] nincs.'),
    /\[5\] has no item: the 'references' list has 2 items/,
    /reference \[0\] is used 2 times: each item is used once/,
    /reference \[1\] is not used in the text/,
  )
})

test('a list not in the order the text uses it fails', () => {
  rejects(definition(TWO, 'Előbb [1], aztán [0].'), /not in the order the text uses it: \[1\] comes before \[0\]/)
  load(definition(TWO, 'Előbb [0].', 'Aztán [1].'))
})

test('a reference by name, the old token, fails', () => {
  rejects(
    definition('references:\n  - { text: egy, target: theorems.t }\n', 'Lásd [0] és [regi-kulcs].'),
    /\[regi-kulcs\] names a reference, which the text no longer does/,
  )
})

test('a [0] inside math, a [[term]] and a [*] are not reference tokens', () => {
  load(definition('', 'Az $[0]_3$ osztály, a [[term]] és a [*].'))
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

test('each problem names the item, the token or the key it is about, in the order of the errors', () => {
  const result = read(definition(
    'references:\n  - { display: no-such, target: theorems.t }\n  - { text: egy, target: theorems.u }\n  - { text: kettő, target: theorems.v }\n',
    'Lásd $[2]$ [2], [1], [7], [2] és [regi].',
  ))
  assert.deepEqual(result.problems, [
    { message: "reference [0]: 'no-such' is not a display template in 'hu'", item: 0 },
    { message: "[regi] names a reference, which the text no longer does: use the index of a 'references' item, as in [0]", key: 'regi' },
    { message: "[7] has no item: the 'references' list has 3 items", token: 2 },
    { message: 'reference [0] is not used in the text', item: 0 },
    { message: 'reference [2] is used 2 times: each item is used once', token: 3 },
    {
      message: "the 'references' list is not in the order the text uses it: [2] comes before [1]. Renumber the items in the order they appear",
      token: 1,
    },
  ])
  assert.deepEqual(result.errors, result.problems.map((problem) => problem.message))
  assert.deepEqual(read(definition('references:\n  old: { text: x, target: theorems.t }\n')).problems.map((p) => Object.keys(p)), [['message']])
})

test('the text fields of the blocks are read in the order the site renders them, latex blocks included', () => {
  const blocks = yaml.load(`
- { type: narrative, content: n }
- { type: formula, lead-in: f-in, content: "[9]", lead-out: f-out }
- { type: figure, lead-in: fig-in, src: x, caption: fig-caption }
- { type: ordered-list, lead-in: l-in, items: [l-1, l-2] }
- { type: typewriter, lead-in: tw-in, rows: ["[9]"] }
- { type: quote, lead-in: q-in, quote: q, author: a }
- { type: embed, target: theorems.t }
- { type: subsection, title: sub-title, blocks: [{ type: narrative, content: sub-n }] }
- { type: details, title: det-title, blocks: [{ type: claim, name: c, content: det-claim }] }
- { type: narrative, content: latex, context: latex }
`)
  assert.deepEqual(referenceTexts(blocks), [
    'n', 'f-in', 'f-out', 'fig-in', 'fig-caption', 'l-in', 'l-1', 'l-2', 'tw-in', 'q-in', 'q',
    'sub-n', 'det-title', 'det-claim', 'latex',
  ])
})

test('blocks that are not a list, and entries that are not mappings, hold no text', () => {
  assert.deepEqual(referenceTexts(undefined), [])
  assert.deepEqual(referenceTexts('narrative'), [])
  assert.deepEqual(referenceTexts([null, 'x', { type: 'narrative', content: 'n' }]), ['n'])
})

test('reference tokens are read at the top level and inside bold, not inside math or superscript', () => {
  assert.deepEqual(
    [...referenceTokens('[0] **[1] ***[2]***** $[9]$ ^[8]^ [[t]] [*] [kulcs]')],
    [{ kind: 'ref', index: 0 }, { kind: 'ref', index: 1 }, { kind: 'ref', index: 2 }, { kind: 'legacy-ref', key: 'kulcs' }],
  )
})

test('a chapter reads abstract, prerequisite warning, prologue and epilogue in that order', () => {
  const chapter = (order: number[]) =>
    'name: c\nslug: c\nlocale: hu\ntitle: C\n' +
    'references:\n  - { text: egy, target: theorems.t }\n  - { text: kettő, target: theorems.u }\n' +
    '  - { text: három, target: theorems.v }\n  - { text: négy, target: theorems.w }\n' +
    ['abstract', 'prerequisite-warning', 'prologue', 'epilogue']
      .map((field, i) => `${field}:\n  - type: narrative\n    content: "[${order[i]}]"\n`)
      .join('')
  assert.equal(load(chapter([0, 1, 2, 3]), 'chapter').length, 4)
  assert.match(read(chapter([0, 1, 3, 2]), 'chapter').errors.join('\n'), /\[3\] comes before \[2\]/)
})

test('a standalone item reads abstract, prologue and epilogue, and a section its body', () => {
  const page =
    'name: p\nslug: p\nlocale: hu\ntitle: P\nreferences:\n  - { text: egy, target: pages.q }\n  - { text: kettő, target: pages.r }\n' +
    'abstract:\n  - type: narrative\n    content: "[0]"\nbody:\n  - type: narrative\n    content: "[9]"\nepilogue:\n  - type: narrative\n    content: "[1]"\n'
  assert.equal(load(page, 'standalone').length, 2)
  const section = 'name: s\nslug: s\nlocale: hu\ntitle: S\nreferences:\n  - { text: egy, target: theorems.t }\nbody: []\n'
  assert.deepEqual(read(section, 'section').errors, ['reference [0] is not used in the text'])
})
