// An entity's `label` variant, as the loader reads it and as the graph renders it:
// the type word beside an entity, and the inflected word a display template asks for.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as graphModule from '../lib/content/graph.ts'
import * as loaderModule from '../lib/content/loader.ts'
import { resolveTemplate, segmentsText, TemplateCaseError } from '@youproof.org/display-templates'

const { buildGraphFromRaw, kbNodeLabel } = graphModule.default ?? graphModule
const { loadTheorem, ContentFormatError } = loaderModule.default ?? loaderModule

import { raw, single, tpl } from './support/raw-graph.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-labels-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

function theoremFile(extra) {
  const dir = fs.mkdtempSync(path.join(tmp, 'case-'))
  const file = path.join(dir, 'tetel.yaml')
  fs.writeFileSync(file, `type: theorem\nname: tetel\nslug: tetel\nlocale: hu\ntitle: Tétel\n${extra}body: []\n`)
  return file
}

test('the loader reads a label variant of the entity\'s type', () => {
  assert.equal(loadTheorem(theoremFile('label: lemma\n'), '/x', {}).node.label, 'lemma')
  assert.equal(loadTheorem(theoremFile(''), '/x', {}).node.label, undefined)
})

test('the loader rejects a variant its type does not have, naming the file', () => {
  assert.throws(
    () => loadTheorem(theoremFile('label: definition\n'), '/x', {}),
    (err) =>
      err instanceof ContentFormatError &&
      /tetel\.yaml — label 'definition' is not a theorem label in 'hu'\. Known: theorem, lemma, corollary/.test(err.message),
  )
})

test('the loader rejects a labels block, naming the file', () => {
  assert.throws(
    () => loadTheorem(theoremFile('labels:\n  canonical: lemma\n'), '/x', {}),
    (err) => err instanceof ContentFormatError && /tetel\.yaml — 'labels' is no longer supported/.test(err.message),
  )
})

// ---------------------------------------------------------------------------

const TEMPLATES = {
  ine: single(['theorem'], "{capital(base('ine', target.label))}{suffix('ine', target.label)}"),
  'parent-poss-dat': single(['claim'], "{base('poss-dat', target.parent.label)}{suffix('poss-dat', target.parent.label)}"),
  'old-in': single(['theorem'], "{base('in', target.label)}{suffix('in', target.label)}"),
}

function graphWith(references, theoremLabel) {
  const data = raw({ references, displayTemplates: TEMPLATES })
  if (theoremLabel) data.theorems[0].label = theoremLabel
  return buildGraphFromRaw(data)
}

const display = (g, index) => segmentsText(g.definitions.get('definitions.def-egy').references[index].segments)

test('an entity without a label reads as its type\'s default word', () => {
  const g = graphWith([tpl('ine', 'theorems.tetel-egy')])
  assert.match(kbNodeLabel(g, g.theorems.get('theorems.tetel-egy')), /Tétel$/)
  assert.equal(display(g, 0), 'Tételben')
})

test('an entity\'s label variant gives its own word and stem', () => {
  const g = graphWith([tpl('ine', 'theorems.tetel-egy')], 'lemma')
  assert.match(kbNodeLabel(g, g.theorems.get('theorems.tetel-egy')), /Lemma$/)
  assert.equal(display(g, 0), 'Lemmában')
})

test('a claim or term template inflects the parent entity\'s label', () => {
  const g = graphWith([tpl('parent-poss-dat', 'definitions.def-egy.claims.def-claim')])
  assert.equal(display(g, 0), 'definíciójának')
})

test('a case the target\'s locale does not declare fails the build, naming the owner and reference', () => {
  assert.throws(
    () => graphWith([tpl('ine', 'theorems.tetel-egy'), tpl('old-in', 'theorems.tetel-egy')]),
    /^Error: Reference \[1\] in definition "def-egy": case 'in' is not declared\. 'hu' declares: ine, ela, acc,/,
  )
})

test('a case applied to something that is not a label throws rather than rendering nothing', () => {
  assert.throws(
    () => resolveTemplate("{base('ine', target.label)}", { target: { index: '1.' } }),
    (err) => err instanceof TemplateCaseError && /case 'ine' is applied to something that is not a label/.test(err.message),
  )
})
