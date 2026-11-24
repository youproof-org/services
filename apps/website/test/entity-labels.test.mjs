// The entity label registry: the accessor every label in the site reads, and the
// checks that keep a locale's variants inflecting alike.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as labelsModule from '../lib/i18n/entity-labels.ts'

const {
  entityLabels,
  entityLabelCases,
  entityLabelVariants,
  validateEntityLabelRegistry,
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

// ---------------------------------------------------------------------------
// validateEntityLabelRegistry

const variant = (canonical, keys) => ({
  canonical,
  cases: Object.fromEntries(keys.map((k) => [k, { base: canonical, suffix: '' }])),
})

const oneVariantType = (name, canonical, keys) => ({ default: name, variants: { [name]: variant(canonical, keys) } })

function registry(keys = ['ine', 'acc']) {
  return {
    hu: {
      cases: keys,
      definition: oneVariantType('definition', 'definíció', keys),
      theorem: oneVariantType('theorem', 'tétel', keys),
      proof: oneVariantType('proof', 'bizonyítás', keys),
      remark: oneVariantType('remark', 'megjegyzés', keys),
    },
  }
}

test('the shipped registry passes', () => {
  // Importing the module already ran the check; a failure would have thrown above.
  assert.ok(entityLabelCases('hu').length > 0)
})

test('a well-formed registry has no errors', () => {
  assert.deepEqual(validateEntityLabelRegistry(registry(), ['hu']), [])
})

test('a locale without inflection may declare no cases', () => {
  assert.deepEqual(validateEntityLabelRegistry(registry([]), ['hu']), [])
})

test('a default that is not one of the type\'s variants is an error', () => {
  const r = registry()
  r.hu.theorem.default = 'lemma'
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu']), [
    "hu.theorem: default 'lemma' is not one of its variants",
  ])
})

test('a variant key that is not kebab-case is an error', () => {
  const r = registry()
  r.hu.theorem.variants.myLemma = variant('lemma', ['ine', 'acc'])
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu']), ['hu.theorem.myLemma: variant key is not kebab-case'])
})

test('a variant missing a declared case is an error', () => {
  const r = registry()
  delete r.hu.theorem.variants.theorem.cases.acc
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu']), ["hu.theorem.theorem: missing case 'acc'"])
})

test('a variant defining an undeclared case is an error', () => {
  const r = registry()
  r.hu.remark.variants.remark.cases.to = { base: 'megjegyzés', suffix: 'hez' }
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu']), [
    "hu.remark.remark: case 'to' is not declared for 'hu'",
  ])
})

test('a canonical word that is not lowercase is an error', () => {
  const r = registry()
  r.hu.proof.variants.proof.canonical = 'Bizonyítás'
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu']), [
    "hu.proof.proof: canonical 'Bizonyítás' is not lowercase",
  ])
})

test('a missing type or an unconfigured locale is an error', () => {
  const r = registry()
  delete r.hu.remark
  assert.deepEqual(validateEntityLabelRegistry(r, ['hu', 'en']), [
    "locale 'en' has no entity labels",
    'hu.remark: missing',
  ])
  assert.deepEqual(validateEntityLabelRegistry(registry(), []), ["'hu' is not a configured locale"])
})
