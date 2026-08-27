// `formatLocaleLabel`: the labels that carry a number keep their sentence in
// locales.json and get the number substituted in. The point of the test is the
// failure case — an unsupplied placeholder must throw rather than render `{count}`
// to the reader.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as configModule from '../lib/i18n/config.ts'

const { formatLocaleLabel, getLocaleLabel } = configModule.default ?? configModule

test('substitutes a placeholder with the value given', () => {
  assert.equal(formatLocaleLabel('hu', 'kbDefinitionsCount', { count: 84 }), '84 definíció')
  assert.equal(formatLocaleLabel('hu', 'kbTheoremsCount', { count: 136 }), '136 tétel')
})

test('the two glossary counts read as rows and the terms they name', () => {
  assert.equal(formatLocaleLabel('hu', 'kbGlossaryCount', { count: 341 }), '341 szócikk')
  assert.equal(
    formatLocaleLabel('hu', 'kbGlossaryCountNote', { count: 217 }),
    '217 fogalom nevei és szinonimái',
  )
})

test('throws on a placeholder the caller did not supply', () => {
  assert.throws(
    () => formatLocaleLabel('hu', 'kbDefinitionsCount', {}),
    /no value for '\{count\}'/,
  )
})

test('leaves a label without placeholders untouched', () => {
  assert.equal(
    formatLocaleLabel('hu', 'kbIntro', {}),
    getLocaleLabel('hu', 'kbIntro'),
  )
})
