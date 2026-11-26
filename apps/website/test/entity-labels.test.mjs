// The shipped entity label registry, through the accessors every label in the site
// reads. The registry checks and the lookups themselves are tested in
// packages/content-model.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as labelsModule from '../lib/i18n/entity-labels.ts'

const {
  entityLabels,
  entityLabelCases,
  entityLabelVariants,
  KB_ENTITY_TYPES,
} = labelsModule.default ?? labelsModule

test('a type without a named variant gets its default word', () => {
  assert.equal(entityLabels('hu', 'definition').canonical, 'definíció')
  assert.equal(entityLabels('hu', 'theorem').canonical, 'tétel')
  assert.equal(entityLabels('hu', 'proof').canonical, 'bizonyítás')
  assert.equal(entityLabels('hu', 'remark').canonical, 'megjegyzés')
})

test('a named variant gets its own word and stem', () => {
  const lemma = entityLabels('hu', 'theorem', 'lemma')
  assert.equal(lemma.canonical, 'lemma')
  assert.deepEqual(lemma.cases.ine, { base: 'lemmá', suffix: 'ban' })
  assert.equal(entityLabels('hu', 'theorem', 'corollary').canonical, 'következmény')
})

test('an unknown variant throws instead of falling back to the default', () => {
  assert.throws(() => entityLabels('hu', 'theorem', 'lema'), /'lema' is not a theorem label in 'hu'/)
  assert.throws(() => entityLabels('hu', 'definition', 'lemma'), /not a definition label/)
})

test('an unknown type or locale throws', () => {
  assert.throws(() => entityLabels('hu', 'chapter'), /'chapter' is not a KB entity type/)
  assert.throws(() => entityLabels('xx', 'theorem'), /No entity labels for locale 'xx'/)
})

test('every variant in a locale defines exactly the cases the locale declares', () => {
  const cases = [...entityLabelCases('hu')].sort()
  for (const type of KB_ENTITY_TYPES) {
    for (const variant of entityLabelVariants('hu', type)) {
      assert.deepEqual(Object.keys(entityLabels('hu', type, variant).cases).sort(), cases, `${type}.${variant}`)
    }
  }
})

test('the theorem variants are the three words the content uses', () => {
  assert.deepEqual([...entityLabelVariants('hu', 'theorem')].sort(), ['corollary', 'lemma', 'theorem'])
})

test('the shipped registry passes', () => {
  // Importing the module already ran the check; a failure would have thrown above.
  assert.ok(entityLabelCases('hu').length > 0)
})
