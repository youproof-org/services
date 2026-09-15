// The robots directive on a stub page, per environment.
//
// Both modules read SITE_ENV once, when they are evaluated, so a single process
// cannot hold two environments' behaviour from one import. Each environment gets
// its own module instance via a `?env=` query on the specifier (the pattern
// kb-graph.test.mjs uses) — and each module is imported under its own query,
// because a query on the importer does not re-evaluate what it imports.
//
// What this pins is the pair of directives and, more importantly, the SHAPE of
// the non-production return: an empty object, not one carrying an undefined
// `robots`. Next's parent/child metadata merge iterates the child's own keys, so
// a present-but-undefined key drops the root layout's site-wide noindex while an
// absent one inherits it. The difference is invisible in the object and decides
// whether staging stays out of the index.
import { test } from 'node:test'
import assert from 'node:assert/strict'

async function moduleFor(env, specifier) {
  const before = process.env.SITE_ENV
  if (env === undefined) delete process.env.SITE_ENV
  else process.env.SITE_ENV = env
  try {
    return await import(`${specifier}?env=${env ?? 'local'}`)
  } finally {
    if (before === undefined) delete process.env.SITE_ENV
    else process.env.SITE_ENV = before
  }
}

const robotsFor = (env) => moduleFor(env, '../lib/i18n/metadata.ts')
const stubFor = (env) => moduleFor(env, '../lib/content/stub.ts')

const published = { published: true, legacyPath: '/regi/ut' }
const notMigrated = { published: false, legacyPath: '/regi/ut' }
const unavailable = { published: false }

// ---------------------------------------------------------------------------
// Which stub a page renders
// ---------------------------------------------------------------------------

test('a deployed build stubs unpublished items, by whether they have a legacy path', async () => {
  for (const env of ['production', 'staging']) {
    const { stubKindFor } = await stubFor(env)
    assert.equal(stubKindFor(notMigrated), 'not-migrated', env)
    assert.equal(stubKindFor(unavailable), 'unavailable', env)
    assert.equal(stubKindFor(published), null, env)
  }
})

test('a local build renders drafts instead of stubbing them', async () => {
  const { stubKindFor } = await stubFor(undefined)
  assert.equal(stubKindFor(notMigrated), null)
  assert.equal(stubKindFor(unavailable), null)
})

// ---------------------------------------------------------------------------
// The directive each stub carries
// ---------------------------------------------------------------------------

test('production: a not-migrated stub is noindex, follow', async () => {
  const { stubRobots } = await robotsFor('production')
  // `follow`, not `nofollow`: the page's only content is the link to the legacy
  // page, which production keeps indexable.
  assert.deepEqual(stubRobots('not-migrated'), { robots: { index: false, follow: true } })
})

test('production: an unavailable stub is noindex, nofollow', async () => {
  const { stubRobots } = await robotsFor('production')
  assert.deepEqual(stubRobots('unavailable'), { robots: { index: false, follow: false } })
})

test('non-production returns no robots key at all, so the layout keeps its own', async () => {
  for (const env of ['staging', undefined]) {
    const { stubRobots } = await robotsFor(env)
    for (const kind of ['not-migrated', 'unavailable']) {
      const meta = stubRobots(kind)
      assert.deepEqual(meta, {}, `${env ?? 'local'} / ${kind}`)
      // The load-bearing assertion: deepEqual({robots: undefined}, {}) passes.
      assert.ok(!('robots' in meta), `${env ?? 'local'} / ${kind} must not carry a robots key`)
    }
  }
})
