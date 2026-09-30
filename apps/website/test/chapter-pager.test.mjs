// The pure rules behind `components/content/ChapterPager.tsx`: which newsletter
// slots of a chapter get a form, which page a section is on, and which links the
// pager takes over.
//
// The browser half is `e2e/chapter-pagination.test.ts`, which scrolls a real split
// chapter and watches the forms, the URL and the view.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as placementModule from '../lib/newsletter/placement.ts'
import * as pagerModule from '../lib/content/chapter-pager.ts'

const { chapterSlotTakesForm, midContentIndex, CHAPTER_FORM_SPACING } =
  placementModule.default ?? placementModule
const { pageOfSection, inChapterDestination, isPlainClick } = pagerModule.default ?? pagerModule

/**
 * The slots of a chapter that hold a form once the given sections are in the
 * document. A slot precedes every section but the first, and only the slots of
 * loaded sections exist.
 */
function formSlots(sectionCount, arrival, loaded) {
  const slots = []
  for (let slot = 1; slot < sectionCount; slot++) {
    if (!loaded.has(slot)) continue
    const sectionBeforeLoaded = loaded.has(slot - 1)
    if (chapterSlotTakesForm({ sectionCount, arrival, slot, sectionBeforeLoaded })) slots.push(slot)
  }
  return slots
}

const range = (from, to) => new Set(Array.from({ length: to - from }, (_, i) => from + i))

test('the spacing is three sections', () => {
  assert.equal(CHAPTER_FORM_SPACING, 3)
})

test('landing on page 1 of a 12-section chapter places forms at 3, 6 and 9', () => {
  assert.deepEqual(formSlots(12, 0, range(0, 12)), [3, 6, 9])
})

test('slot 9 of 12 takes a form, because exactly three sections follow it', () => {
  assert.equal(chapterSlotTakesForm({ sectionCount: 12, arrival: 0, slot: 9, sectionBeforeLoaded: true }), true)
  assert.equal(chapterSlotTakesForm({ sectionCount: 13, arrival: 1, slot: 10, sectionBeforeLoaded: true }), true)
  assert.equal(chapterSlotTakesForm({ sectionCount: 12, arrival: 1, slot: 10, sectionBeforeLoaded: true }), false)
})

test('landing on page 2 at section 7 of 12: nothing until page 1 loads, then 4 and 7', () => {
  const page2 = range(7, 12)
  assert.deepEqual(formSlots(12, 7, page2), [], 'slot 7 waits for section 6, slot 10 has two after it')
  assert.deepEqual(formSlots(12, 7, range(0, 12)), [4, 7], 'slot 1 has only one section before it')
})

test('the lattice is counted from the arrival section, in both directions', () => {
  const all = range(0, 30)
  assert.deepEqual(formSlots(30, 0, all), [3, 6, 9, 12, 15, 18, 21, 24, 27])
  assert.deepEqual(formSlots(30, 11, all), [5, 8, 11, 14, 17, 20, 23, 26])
  assert.deepEqual(formSlots(30, 13, all), [4, 7, 10, 13, 16, 19, 22, 25])
})

test('the edge limits: at least three sections before and after a form', () => {
  for (const slot of [0, 1, 2]) {
    assert.equal(chapterSlotTakesForm({ sectionCount: 12, arrival: slot, slot, sectionBeforeLoaded: true }), false)
  }
  for (const slot of [10, 11]) {
    assert.equal(chapterSlotTakesForm({ sectionCount: 12, arrival: slot, slot, sectionBeforeLoaded: true }), false)
  }
})

test('slot a stays empty until a section loads above it', () => {
  const slot = { sectionCount: 12, arrival: 7, slot: 7 }
  assert.equal(chapterSlotTakesForm({ ...slot, sectionBeforeLoaded: false }), false)
  assert.equal(chapterSlotTakesForm({ ...slot, sectionBeforeLoaded: true }), true)
})

test('a chapter too short for three sections either side gets no form', () => {
  for (const sectionCount of [1, 2, 3, 4, 5]) {
    assert.deepEqual(formSlots(sectionCount, 0, range(0, sectionCount)), [], `${sectionCount} sections`)
  }
  assert.deepEqual(formSlots(6, 0, range(0, 6)), [3])
})

test('articles keep the single midpoint form', () => {
  assert.equal(midContentIndex(5), -1)
  assert.equal(midContentIndex(6), 3)
  assert.equal(midContentIndex(11), 5)
})

test('pageOfSection finds the page by its first sections', () => {
  const firstSections = [0, 4, 8]
  assert.deepEqual(
    [0, 3, 4, 7, 8, 11].map((section) => pageOfSection(firstSections, section)),
    [1, 1, 2, 2, 3, 3],
  )
  assert.equal(pageOfSection([0], 5), 1)
  assert.equal(pageOfSection([0, 4], -1), 1)
})

const CHAPTER = '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-felcsavarja-a-szamegyenest'
const PAGE_URLS = [CHAPTER, `${CHAPTER}/2`]
const ORIGIN = 'https://youproof.org'

test('inChapterDestination names the page and the decoded anchor', () => {
  const current = `${ORIGIN}${CHAPTER}/2`
  assert.deepEqual(inChapterDestination(`${CHAPTER}#definiciok.ideal`, current, PAGE_URLS), {
    page: 1,
    anchor: 'definiciok.ideal',
  })
  assert.deepEqual(inChapterDestination(`${ORIGIN}${CHAPTER}`, current, PAGE_URLS), { page: 1, anchor: '' })
  assert.deepEqual(inChapterDestination(`${CHAPTER}#a%C3%A1`, current, PAGE_URLS), { page: 1, anchor: 'aá' })
})

test('inChapterDestination leaves every other link alone', () => {
  const current = `${ORIGIN}${CHAPTER}`
  const cases = {
    'the page the URL already names': `${CHAPTER}#szakaszok.kongruenciak`,
    'another chapter': '/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-gyuruje#x',
    'a page this chapter does not have': `${CHAPTER}/3#x`,
    'a trailing slash': `${CHAPTER}/2/#x`,
    'another origin': `https://example.org${CHAPTER}/2#x`,
    'a query string': `${CHAPTER}/2?kiemeles=definitions.ideal#x`,
    'a malformed escape': `${CHAPTER}/2#%E0%A4%A`,
  }
  for (const [name, href] of Object.entries(cases)) {
    assert.equal(inChapterDestination(href, current, PAGE_URLS), null, name)
  }
})

test('isPlainClick accepts the primary button with no modifier only', () => {
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }
  assert.equal(isPlainClick(plain), true)
  assert.equal(isPlainClick({ ...plain, button: 1 }), false)
  for (const key of ['metaKey', 'ctrlKey', 'shiftKey', 'altKey']) {
    assert.equal(isPlainClick({ ...plain, [key]: true }), false, key)
  }
})
