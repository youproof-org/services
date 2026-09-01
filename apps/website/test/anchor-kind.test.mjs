// Which fragment arrivals get a mark (sub-plan §6.2, D5).
//
// `anchorMarksTarget` is the inverse of the five anchor builders, and this suite is
// the only place the two are put back to back: every case below is an id produced by
// calling a builder rather than a string typed out from memory, so a builder that
// changed its shape — a new container segment, a different nesting — fails here
// instead of quietly turning the marker off for a whole kind of anchor.
//
// The browser half is `e2e/kb-arrival.test.ts`, which checks that a marked decision
// actually puts a rectangle on the screen and an unmarked one puts nothing there.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  anchorMarksTarget,
  claimAnchorId,
  embeddedScope,
  kbAnchorPath,
  ownPageScope,
  partAnchorId,
  sectionAnchorId,
  termAnchorId,
} from '../lib/content/urls.ts'

const hu = 'hu'

// The four knowledge-base node types, as the minimum `kbAnchorPath` reads: its own
// `type` and `locale`, a `slug` for the two types addressed by one, and for a proof
// and a remark the owner they hang off — whose list has to hold them, since their
// address is their position in it.
const definition = { type: 'definition', locale: hu, slug: 'gyuru-test' }
const theorem = { type: 'theorem', locale: hu, slug: 'oszthatosag-tulajdonsagai', proofs: [] }
const proof = { type: 'proof', locale: hu, proves: theorem, remarks: [] }
const remark = { type: 'remark', locale: hu, attachedTo: proof }
const orphanRemark = { type: 'remark', locale: hu, name: 'sehova-nem-tartozo', attachedTo: null }
theorem.proofs.push(proof)
proof.remarks.push(remark)

const section = { locale: hu, slug: 'linearis-kongruenciak' }
const part = { locale: hu, slug: 'a-szamelmelet-alapjai' }

test('an embedded entity anchor is marked, at every depth of the ownership chain', () => {
  for (const node of [definition, theorem, proof, remark, orphanRemark]) {
    const anchor = kbAnchorPath(node)
    assert.equal(anchorMarksTarget(hu, anchor), true, anchor)
  }
})

test('a term anchor is marked, on its own page and embedded in a chapter', () => {
  const own = termAnchorId(ownPageScope(definition), 'gyuru', { slug: 'gyuru' })
  const embedded = termAnchorId(embeddedScope(definition), 'gyuru', { slug: 'gyuru' })
  assert.equal(own, 'fogalmak.gyuru')
  assert.equal(embedded, 'definiciok.gyuru-test.fogalmak.gyuru')
  assert.equal(anchorMarksTarget(hu, own), true)
  assert.equal(anchorMarksTarget(hu, embedded), true)
})

test('a claim anchor is marked, on its own page and embedded in a chapter', () => {
  const claim = { name: 'multiplicationDistributes', slug: 'szorzas-disztributiv' }
  const own = claimAnchorId(ownPageScope(definition), claim)
  const embedded = claimAnchorId(embeddedScope(definition), claim)
  assert.equal(own, 'allitasok.szorzas-disztributiv')
  assert.equal(embedded, 'definiciok.gyuru-test.allitasok.szorzas-disztributiv')
  assert.equal(anchorMarksTarget(hu, own), true)
  assert.equal(anchorMarksTarget(hu, embedded), true)
})

test('the name fallback of a claim or a term is still marked', () => {
  // A claim or term added between migrations has no slug yet and falls back to its
  // language-independent name. That produces an English tail on a Hungarian
  // container, and the container is what decides — so the mark must survive it.
  const claim = claimAnchorId(ownPageScope(definition), { name: 'someNewClaim' })
  const term = termAnchorId(ownPageScope(definition), 'someNewTerm', {})
  assert.equal(claim, 'allitasok.someNewClaim')
  assert.equal(term, 'fogalmak.someNewTerm')
  assert.equal(anchorMarksTarget(hu, claim), true)
  assert.equal(anchorMarksTarget(hu, term), true)
})

test('a section anchor and a part anchor are not marked (D5)', () => {
  const sectionAnchor = sectionAnchorId(section)
  const partAnchor = partAnchorId(part)
  assert.equal(sectionAnchor, 'szakaszok.linearis-kongruenciak')
  assert.equal(partAnchor, 'reszek.a-szamelmelet-alapjai')
  assert.equal(anchorMarksTarget(hu, sectionAnchor), false)
  assert.equal(anchorMarksTarget(hu, partAnchor), false)
})

test('the ids that are not cross-reference targets are not marked', () => {
  // §6.2's inventory of what else on the site has an id: the homepage's two nav
  // scroll targets, and the dialog/form ids that are accessibility wiring. None of
  // them is a `container.slug` pair, and none of them gets a mark.
  for (const id of ['articles', 'news', 'newsletter-form', 'kb-panel', '']) {
    assert.equal(anchorMarksTarget(hu, id), false, id)
  }
})

test('a malformed anchor is not marked', () => {
  // The shape of every builder's output is a run of `container.slug` pairs, so an
  // odd count is not one of ours, and a segment that is no container at all is not
  // either. Both answer "no mark" rather than throwing: the string comes from the
  // address bar, where anything can be typed.
  for (const id of [
    'fogalmak',
    'definiciok.gyuru-test.fogalmak',
    'nincsilyen.gyuru',
    'gyuru.fogalmak',
    '.',
  ]) {
    assert.equal(anchorMarksTarget(hu, id), false, id)
  }
})
