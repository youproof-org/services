// Breadcrumb chains for every knowledge-base page: the four list pages and the
// entity chains, a remark's following its actual ownership.
//
// The entity chains run over a graph built by `buildGraphFromRaw`, so the labels are
// the real `kbNodeTitle` output and the hrefs the real `urlFor*` output rather than
// strings restated here.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import * as breadcrumbsModule from '../lib/content/kb-breadcrumbs.ts'
import * as graphModule from '../lib/content/graph.ts'

const { kbListBreadcrumbs, kbEntityBreadcrumbs } = breadcrumbsModule.default ?? breadcrumbsModule
const { buildGraphFromRaw } = graphModule.default ?? graphModule

import { hu, narrative, raw } from './support/raw-graph.mjs'

const remark = (name) => ({ ...hu, name, body: [narrative('Megjegyzés.')], references: {} })

/**
 * The shared fixture plus a remark on the theorem, one on the proof, and one owned
 * by nobody — the three ownership cases the shared fixture (which has only a
 * definition's remark) cannot produce on its own.
 */
function graphWithEveryRemarkOwner() {
  const r = raw()
  r.remarks.push(remark('rem-tetel'), remark('rem-biz'), remark('rem-arva'))
  r.theorems[0].remarkSlugs = ['rem-tetel']
  r.proofs[0].remarkSlugs = ['rem-biz']
  return buildGraphFromRaw(r)
}

const g = graphWithEveryRemarkOwner()
const byName = (map, name) => [...map.values()].find((n) => n.name === name)

const chain = (crumbs) => crumbs.map((c) => `${c.label} @ ${c.href}`)

const HOME = 'Főoldal @ /hu'
const KB = 'Tudásbázis @ /hu/tudasbazis'
const DEFINITIONS = 'Definíciók @ /hu/tudasbazis/definiciok'
const THEOREMS = 'Tételek @ /hu/tudasbazis/tetelek'

// ---------------------------------------------------------------------------

test('the four list pages: the root, then one crumb per section', () => {
  assert.deepEqual(chain(kbListBreadcrumbs('hu', 'kb-root')), [HOME, KB])
  assert.deepEqual(chain(kbListBreadcrumbs('hu', 'definitions-index')), [HOME, KB, DEFINITIONS])
  assert.deepEqual(chain(kbListBreadcrumbs('hu', 'theorems-index')), [HOME, KB, THEOREMS])
  assert.deepEqual(chain(kbListBreadcrumbs('hu', 'glossary')), [
    HOME,
    KB,
    'Fogalmak @ /hu/tudasbazis/fogalmak',
  ])
})

test('a definition hangs off the definitions index, a theorem off the theorems index', () => {
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.definitions, 'def-egy'))), [
    HOME,
    KB,
    DEFINITIONS,
    'Első definíció @ /hu/tudasbazis/definiciok/def-egy',
  ])
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.theorems, 'tetel-egy'))), [
    HOME,
    KB,
    THEOREMS,
    'Első tétel @ /hu/tudasbazis/tetelek/tetel-egy',
  ])
})

test('a proof carries its theorem above it', () => {
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.proofs, 'biz-egy'))), [
    HOME,
    KB,
    THEOREMS,
    'Első tétel @ /hu/tudasbazis/tetelek/tetel-egy',
    'Bizonyítás: Első tétel @ /hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1',
  ])
})

test("a remark's chain follows its actual ownership, definition or theorem", () => {
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.remarks, 'rem-egy'))), [
    HOME,
    KB,
    DEFINITIONS,
    'Első definíció @ /hu/tudasbazis/definiciok/def-egy',
    'Megjegyzés: Első definíció @ /hu/tudasbazis/definiciok/def-egy/megjegyzesek/1',
  ])
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.remarks, 'rem-tetel'))), [
    HOME,
    KB,
    THEOREMS,
    'Első tétel @ /hu/tudasbazis/tetelek/tetel-egy',
    'Megjegyzés: Első tétel @ /hu/tudasbazis/tetelek/tetel-egy/megjegyzesek/1',
  ])
})

test('a remark on a proof carries the theorem AND the proof above it', () => {
  // The longest chain there is, and the one that has to be right for the reader to
  // be able to walk back out of a proof's remark.
  assert.deepEqual(chain(kbEntityBreadcrumbs(g, byName(g.remarks, 'rem-biz'))), [
    HOME,
    KB,
    THEOREMS,
    'Első tétel @ /hu/tudasbazis/tetelek/tetel-egy',
    'Bizonyítás: Első tétel @ /hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1',
    'Megjegyzés: Bizonyítás: Első tétel @ /hu/tudasbazis/tetelek/tetel-egy/bizonyitasok/1/megjegyzesek/1',
  ])
})

test('a chain never contains the namespace, so reorganizing namespaces cannot move a page', () => {
  for (const node of [
    byName(g.definitions, 'def-egy'),
    byName(g.theorems, 'tetel-egy'),
    byName(g.proofs, 'biz-egy'),
    byName(g.remarks, 'rem-biz'),
  ]) {
    for (const crumb of kbEntityBreadcrumbs(g, node)) {
      assert.ok(!crumb.href.includes('proba'), `${crumb.href} leaks its namespace`)
    }
  }
})

test('an owner-less remark has no chain, because it has no page to be the leaf of', () => {
  const orphan = byName(g.remarks, 'rem-arva')
  assert.equal(orphan.attachedTo, undefined)
  assert.throws(() => kbEntityBreadcrumbs(g, orphan), /has no page URL/)
})
