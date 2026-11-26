// Loads the committed, generated content-checker.mjs, the file the content repo's
// check-refs.mjs runs, and checks a small collection and content file with it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  DEFAULT_LOCALE,
  LOCALES,
  localeCases,
  parseYaml,
  readCollection,
  readFileReferences,
  referenceTokenPositions,
} from '../content-checker.mjs'

const registry = JSON.parse(readFileSync(new URL('../../../apps/website/lib/i18n/entity-labels.json', import.meta.url), 'utf8'))

const COLLECTION = `
the-index:
  targets: [definition, theorem]
  template: '[{target.index}]'
the-indexes:
  targets: [theorem]
  list:
    count: { min: 2 }
    item: { first: '[{target.index}]', separator: ', ', last-separator: ' és ' }
broken:
  targets: [chapter]
  template: '{target.label.canonical}'
`

const FILE = `type: definition
name: d
title: D
references:
  - { display: the-index, target: theorems.t }
  - { text: 'a [gyűrű]', target: definitions.gyuru }
  - { display: the-indexes, targets: [theorems.a] }
body:
  - type: narrative
    content: 'Lásd $[0]_3$ [1], aztán [0] és [1], végül [2] és [9].'
  - type: formula
    content: 'x [2]'
`

function collections() {
  const parsed = parseYaml(COLLECTION)
  assert.ok('doc' in parsed)
  return readCollection(parsed.doc, localeCases(registry))
}

test('the locales come from the website config, and the first is the default', () => {
  assert.ok(LOCALES.includes('hu'))
  assert.equal(DEFAULT_LOCALE, LOCALES[0])
})

test('a YAML error names its 1-based line', () => {
  const parsed = parseYaml('a: 1\nb: [\n')
  assert.ok('error' in parsed)
  assert.ok(parsed.error.line >= 2)
  assert.match(parsed.error.message, /^the file is not valid YAML: /)
})

test('the collection reads its valid templates and reports the invalid ones', () => {
  const { collection, errors } = collections()
  assert.deepEqual(Object.keys(collection), ['the-index', 'the-indexes'])
  assert.deepEqual(errors, ["template 'broken': template: {target.label.canonical}: a chapter target has no 'target.label'"])
})

test("a file's references are checked as the build checks them, each problem with its place", () => {
  const { collection } = collections()
  const parsed = parseYaml(FILE)
  assert.ok('doc' in parsed)
  const read = readFileReferences(parsed.doc, { [DEFAULT_LOCALE]: collection })
  assert.ok(read)
  assert.equal(read.kind, 'entity')
  assert.equal(read.locale, DEFAULT_LOCALE)
  assert.deepEqual(read.problems, [
    { message: "reference [2]: template 'the-indexes' takes at least 2 targets, not 1", item: 2 },
    { message: "[9] has no item: the 'references' list has 3 items", token: 4 },
    { message: 'reference [1] is used 2 times: each item is used once', token: 2 },
    {
      message: "the 'references' list is not in the order the text uses it: [1] comes before [0]. Renumber the items in the order they appear",
      token: 1,
    },
  ])
  assert.deepEqual(read.errors, read.problems.map((problem) => problem.message))
})

test('token positions are the tokens the site reads, in reading order, at their offsets in the source', () => {
  const positions = referenceTokenPositions(FILE)
  assert.deepEqual(positions.map((p) => p.index), [1, 0, 1, 2, 9])
  for (const p of positions) assert.equal(FILE.slice(p.offset, p.offset + p.source.length), `[${p.index}]`)
  assert.equal(positions[0].offset, FILE.indexOf('[1]'))
})

test('a file without references reads as null', () => {
  assert.equal(readFileReferences({ type: 'book', name: 'b' }, {}), null)
  assert.deepEqual(referenceTokenPositions('type: book\nname: b\n'), [])
})
