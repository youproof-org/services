import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isPathTarget, localeCodes, parseRefTarget, refTargetKey } from '../src/index'

test('a fully qualified name reads as a path target with its parent', () => {
  assert.deepEqual(parseRefTarget(' theorems.t.proofs.p ', 'test'), {
    type: 'proof',
    name: 'p',
    fqn: 'theorems.t.proofs.p',
    parentFqn: 'theorems.t',
    parentKind: 'theorem',
  })
})

test('a URL reads as an external target, and a key names either kind', () => {
  const url = parseRefTarget('mailto:hello@youproof.org', 'test')
  assert.deepEqual(url, { type: 'external', url: 'mailto:hello@youproof.org' })
  assert.ok(!isPathTarget(url))
  assert.equal(refTargetKey(url), 'mailto:hello@youproof.org')
  assert.equal(refTargetKey(parseRefTarget('definitions.d', 'test')), 'definitions.d')
})

test('a target that is not a string, or not a legal path, throws naming the site', () => {
  assert.throws(() => parseRefTarget(42, 'reference [0]'), /^Error: reference \[0\]: 'target' must be a string/)
  assert.throws(() => parseRefTarget('proofs.p', 'reference [0]'), /^Error: reference \[0\]: 'proofs\.p' puts a 'proof' at the root/)
})

test('the locale codes are the keys of the locales mapping, in order', () => {
  assert.deepEqual(localeCodes({ locales: { hu: {}, en: {} } }), ['hu', 'en'])
  assert.throws(() => localeCodes({}), /no 'locales' mapping/)
  assert.throws(() => localeCodes({ locales: ['hu'] }), /no 'locales' mapping/)
})
