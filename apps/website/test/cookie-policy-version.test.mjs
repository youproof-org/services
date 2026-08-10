import { test } from 'node:test'
import assert from 'node:assert/strict'

import { reduceCookiePolicyPages } from '../scripts/lib/cookie-policy-version.mjs'
import { policyPagesForLocale } from '../lib/consent/pages.ts'

function page(relPath, overrides = {}) {
  return {
    relPath,
    doc: { locale: 'hu', slug: 'suti-cookie-kezelese', title: 'Süti tájékoztató', ...overrides },
  }
}

test('reads the version and link data off a flagged page', () => {
  const result = reduceCookiePolicyPages([page('pages/suti/page.yaml', { 'cookie-policy-version': 3 })])
  assert.deepEqual(result, {
    cookiePolicyVersion: 3,
    pages: [{ locale: 'hu', slug: 'suti-cookie-kezelese', title: 'Süti tájékoztató' }],
  })
})

test('preserves diacritics in the title', () => {
  // The label must come from `title:`, not the slug — `suti-cookie-kezelese`
  // de-slugified would lose the ü and é.
  const { pages } = reduceCookiePolicyPages([
    page('pages/suti/page.yaml', { 'cookie-policy-version': 1 }),
  ])
  assert.equal(pages[0].title, 'Süti tájékoztató')
  assert.notEqual(pages[0].title, pages[0].slug)
})

test('accepts several pages in lockstep and sorts them deterministically', () => {
  const { cookiePolicyVersion, pages } = reduceCookiePolicyPages([
    page('pages/suti/page.yaml', { 'cookie-policy-version': 2 }),
    page('pages/adatkezeles/page.yaml', {
      'cookie-policy-version': 2,
      slug: 'adatkezeles',
      title: 'Adatkezelési tájékoztató',
    }),
  ])
  assert.equal(cookiePolicyVersion, 2)
  assert.deepEqual(pages.map((p) => p.slug), ['adatkezeles', 'suti-cookie-kezelese'])
})

test('ignores pages without the field', () => {
  const { cookiePolicyVersion, pages } = reduceCookiePolicyPages([
    page('pages/suti/page.yaml', { 'cookie-policy-version': 1 }),
    page('pages/impresszum/page.yaml', { slug: 'impresszum', title: 'Impresszum' }),
  ])
  assert.equal(cookiePolicyVersion, 1)
  assert.deepEqual(pages.map((p) => p.slug), ['suti-cookie-kezelese'])
})

test('reports the feature off when no page carries the field', () => {
  // This is the state of stable/released until the policy rewrite is promoted.
  assert.deepEqual(reduceCookiePolicyPages([page('pages/impresszum/page.yaml')]), {
    cookiePolicyVersion: 0,
    pages: [],
  })
  assert.deepEqual(reduceCookiePolicyPages([]), { cookiePolicyVersion: 0, pages: [] })
})

test('refuses to guess when flagged pages disagree on the version', () => {
  assert.throws(
    () =>
      reduceCookiePolicyPages([
        page('pages/suti/page.yaml', { 'cookie-policy-version': 2 }),
        page('pages/adatkezeles/page.yaml', { 'cookie-policy-version': 1, slug: 'adatkezeles' }),
      ]),
    /disagree on 'cookie-policy-version'.*lockstep/s,
  )
})

test('rejects a version that is not a positive integer', () => {
  for (const bad of [0, -1, 1.5, '1', true, {}]) {
    assert.throws(
      () => reduceCookiePolicyPages([page('pages/suti/page.yaml', { 'cookie-policy-version': bad })]),
      /must be an integer >= 1/,
      `should reject ${JSON.stringify(bad)}`,
    )
  }
})

test('rejects a flagged page missing the fields needed to link it', () => {
  for (const key of ['locale', 'slug', 'title']) {
    assert.throws(
      () =>
        reduceCookiePolicyPages([
          page('pages/suti/page.yaml', { 'cookie-policy-version': 1, [key]: '' }),
        ]),
      new RegExp(`'${key}' is missing or empty`),
    )
    assert.throws(
      () =>
        reduceCookiePolicyPages([
          page('pages/suti/page.yaml', { 'cookie-policy-version': 1, [key]: undefined }),
        ]),
      new RegExp(`'${key}' is missing or empty`),
    )
  }
})

const HU = { locale: 'hu', slug: 'suti-cookie-kezelese', title: 'Süti tájékoztató' }
const EN = { locale: 'en', slug: 'cookie-policy', title: 'Cookie policy' }

test('links the pages for the current locale', () => {
  assert.deepEqual(policyPagesForLocale([HU, EN], 'en', 'hu'), [EN])
})

test('falls back to the default locale rather than rendering a linkless banner', () => {
  assert.deepEqual(policyPagesForLocale([HU], 'en', 'hu'), [HU])
})

test('returns nothing when neither locale has a policy page', () => {
  // check-analytics-build.mjs rejects this state for a live build.
  assert.deepEqual(policyPagesForLocale([], 'en', 'hu'), [])
})
