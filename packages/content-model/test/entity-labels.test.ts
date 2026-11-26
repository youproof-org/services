// The entity label registry: the checks that keep a locale's variants inflecting
// alike, and the lookups over a parsed registry.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  entityLabelCases,
  entityLabels,
  entityLabelVariant,
  entityLabelVariants,
  validateEntityLabelRegistry,
  type EntityLabelRegistry,
  type EntityLabelVariant,
  type EntityLabelType,
} from '../src/index'

const variant = (canonical: string, keys: string[]): EntityLabelVariant => ({
  canonical,
  cases: Object.fromEntries(keys.map((k) => [k, { base: canonical, suffix: '' }])),
})

const oneVariantType = (name: string, canonical: string, keys: string[]): EntityLabelType => ({
  default: name,
  variants: { [name]: variant(canonical, keys) },
})

function registry(keys = ['ine', 'acc']): EntityLabelRegistry {
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

// ---------------------------------------------------------------------------
// validateEntityLabelRegistry

test('a well-formed registry has no errors', () => {
  assert.deepEqual(validateEntityLabelRegistry(registry(), ['hu']), [])
})

test('a locale without inflection may declare no cases', () => {
  assert.deepEqual(validateEntityLabelRegistry(registry([]), ['hu']), [])
})

test("a default that is not one of the type's variants is an error", () => {
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
  const r = registry() as Record<string, Partial<EntityLabelRegistry[string]>>
  delete r.hu.remark
  assert.deepEqual(validateEntityLabelRegistry(r as EntityLabelRegistry, ['hu', 'en']), [
    "locale 'en' has no entity labels",
    'hu.remark: missing',
  ])
  assert.deepEqual(validateEntityLabelRegistry(registry(), []), ["'hu' is not a configured locale"])
})

// ---------------------------------------------------------------------------
// Lookups

function withLemma(): EntityLabelRegistry {
  const r = registry()
  r.hu.theorem.variants.lemma = { canonical: 'lemma', cases: { ine: { base: 'lemmá', suffix: 'ban' }, acc: { base: 'lemmá', suffix: 't' } } }
  return r
}

test('a type without a named variant gets its default word, and a named variant its own', () => {
  const r = withLemma()
  assert.equal(entityLabels(r, 'hu', 'theorem').canonical, 'tétel')
  assert.deepEqual(entityLabels(r, 'hu', 'theorem', 'lemma'), {
    canonical: 'lemma',
    cases: { ine: { base: 'lemmá', suffix: 'ban' }, acc: { base: 'lemmá', suffix: 't' } },
  })
  assert.equal(entityLabelVariant(r, 'hu', 'theorem'), 'theorem')
  assert.equal(entityLabelVariant(r, 'hu', 'theorem', 'lemma'), 'lemma')
})

test('the cases and variants are read from the registry', () => {
  const r = withLemma()
  assert.deepEqual(entityLabelCases(r, 'hu'), ['ine', 'acc'])
  assert.deepEqual(entityLabelVariants(r, 'hu', 'theorem'), ['theorem', 'lemma'])
})

test('an unknown variant, type or locale throws instead of falling back', () => {
  const r = withLemma()
  assert.throws(() => entityLabels(r, 'hu', 'theorem', 'lema'), /'lema' is not a theorem label in 'hu'\. Known: theorem, lemma/)
  assert.throws(() => entityLabels(r, 'hu', 'chapter'), /'chapter' is not a KB entity type/)
  assert.throws(() => entityLabelCases(r, 'xx'), /No entity labels for locale 'xx'/)
})
