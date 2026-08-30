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
  assert.equal(formatLocaleLabel('hu', 'kbGlossaryCount', { count: 341 }), '341 fogalom')
  assert.equal(
    formatLocaleLabel('hu', 'kbGlossaryCountNote', { count: 217 }),
    '217 fogalom nevei és szinonimái',
  )
})

test('a backlink row counts the references one source aims at the entity', () => {
  // One row per source with a count, not one row per reference (sub-plan §7.2), so
  // the wording is about this source's references rather than about the list.
  assert.equal(formatLocaleLabel('hu', 'kbPanelIncomingCount', { count: 5 }), '5 hivatkozás')
})

test('names what hangs off a definition or a theorem, in the project\'s own words', () => {
  // The second line of a backlink row for a proof or a remark: its first line names
  // the definition or theorem the page belongs to, and these are what say which of
  // that node's children the row leads to. The words are `ENTITY_LABEL_HU`'s
  // (lib/content/display-template.ts), lowercase like it.
  assert.equal(getLocaleLabel('hu', 'kbBacklinkKindProof'), 'bizonyítás')
  assert.equal(getLocaleLabel('hu', 'kbBacklinkKindRemark'), 'megjegyzés')
})

test('numbers a sibling in the ownership chain the way a label reads', () => {
  // Two proofs of one theorem are both "Bizonyítás", so the ordinal is what makes
  // the pair two links rather than one repeated; it leads, as an entity's index
  // does in "15.6. Tétel".
  assert.equal(
    formatLocaleLabel('hu', 'kbOwnershipSibling', { index: 2, label: 'Bizonyítás' }),
    '2. Bizonyítás',
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
