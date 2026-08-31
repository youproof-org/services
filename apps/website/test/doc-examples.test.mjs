// Every reference-target example in the content model doc must resolve against the
// real content.
//
// Documentation drifts silently, and a wrong example is worse than none: an author
// copies it, gets a build error, and cannot tell whether the doc or their content is
// at fault. Two of these were wrong when this test was written — a section attached
// to the wrong chapter, and a theorem that does not exist at all — both invented
// from memory while writing the doc rather than read out of the content.
//
// This is the one place the docs are coupled to the content on purpose. If a rename
// breaks it, the doc genuinely became wrong and the fix is to update the example.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { parseFqn, isExternalTarget } from '../lib/content/fqn.ts'
import * as graphModule from '../lib/content/graph.ts'

const { loadRawGraphData, buildGraphFromRaw } = graphModule.default ?? graphModule

/**
 * CONTENT_DIR the way the build gets it: from the environment, else from `.env`.
 *
 * Reading `.env` matters — the test runner does not load it, so without this the
 * test skips on every ordinary `pnpm test` run and the check silently never
 * happens. `${VAR}` is expanded because the committed `.env` uses `${HOME}`.
 */
function contentDir() {
  if (process.env.CONTENT_DIR) return process.env.CONTENT_DIR
  // Next's precedence: .env.local wins over .env. Checking only one is how this
  // check silently skipped on the machine it was written on.
  for (const file of ['.env.local', '.env']) {
    try {
      const env = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      const line = /^CONTENT_DIR=(.*)$/m.exec(env)
      if (line) {
        return line[1].trim().replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '')
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

const CONTENT = contentDir()
const DOC = CONTENT ? path.join(CONTENT, '..', 'docs', 'content-model.md') : null

test('every documented reference-target example resolves against the content', async (t) => {
  if (!DOC || !fs.existsSync(DOC)) {
    t.skip('no CONTENT_DIR in the environment or .env, or the content repo is elsewhere')
    return
  }
  // loadRawGraphData reads CONTENT_DIR from the environment, so hand it over.
  process.env.CONTENT_DIR = CONTENT

  const md = fs.readFileSync(DOC, 'utf8')
  const examples = [...md.matchAll(/^\s*target:\s*(\S+)\s*$/gm)]
    .map((m) => m[1])
    // `{placeholder}` forms are grammar illustrations, not real targets.
    .filter((t) => !t.includes('{') && !t.includes('...'))

  assert.ok(examples.length >= 10, `expected the doc to carry examples, found ${examples.length}`)

  const graph = buildGraphFromRaw(await loadRawGraphData())
  const maps = [
    graph.books, graph.parts, graph.chapters, graph.sections,
    graph.definitions, graph.theorems, graph.proofs, graph.remarks,
    graph.articles, graph.newsletters, graph.pages, graph.landings,
  ]

  const unresolved = []
  for (const example of examples) {
    if (isExternalTarget(example)) continue

    let parsed
    try {
      parsed = parseFqn(example, 'doc example')
    } catch (err) {
      unresolved.push(`${example} — ${err.message}`)
      continue
    }

    // A claim or term is not a node; it lives on its parent.
    if (parsed.kind === 'claim' || parsed.kind === 'term') {
      const parent = maps.map((m) => m.get(parsed.parentFqn)).find(Boolean)
      if (!parent) {
        unresolved.push(`${example} — parent '${parsed.parentFqn}' is not in the graph`)
      } else if (
        parsed.kind === 'term'
          ? !parent.terms?.[parsed.name]
          : !(parent.body ?? []).some((b) => b.type === 'claim' && b.name === parsed.name)
      ) {
        unresolved.push(`${example} — '${parsed.parentFqn}' has no ${parsed.kind} '${parsed.name}'`)
      }
      continue
    }

    if (!maps.some((m) => m.has(example))) {
      unresolved.push(`${example} — no such node in the graph`)
    }
  }

  assert.deepEqual(unresolved, [], `documented examples that do not resolve:\n  ${unresolved.join('\n  ')}`)
})
