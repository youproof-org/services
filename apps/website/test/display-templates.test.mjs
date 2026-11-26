// The display template collection as the loader reads it: one file per locale, the
// file named in every failure, and the case keys taken from the label registry. The
// reader's defaults and checks are tested in packages/display-templates.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as loaderModule from '../lib/content/loader.ts'
import * as templateModule from '../lib/content/display-template.ts'
import { checkTemplate, TEMPLATE_CONTEXT_SHAPES, TEMPLATE_TARGET_TYPES } from '@youproof.org/display-templates'
import * as graphModule from '../lib/content/graph.ts'

const { loadDisplayTemplates, loadDisplayTemplateCollections, displayTemplatesPath, ContentFormatError } =
  loaderModule.default ?? loaderModule
const { buildContext } = templateModule.default ?? templateModule
const { buildGraphFromRaw, loadRawGraphData } = graphModule.default ?? graphModule

import { raw, ref } from './support/raw-graph.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'display-templates-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

function contentDir(yamlText) {
  const dir = fs.mkdtempSync(path.join(tmp, 'content-'))
  if (yamlText !== undefined) {
    const file = displayTemplatesPath(dir, 'hu')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, yamlText)
  }
  return dir
}

const load = (yamlText) => loadDisplayTemplates(displayTemplatesPath(contentDir(yamlText), 'hu'))

/** Asserts the file fails to load, naming the file and the template, with `problem` in the message. */
function rejects(yamlText, name, problem) {
  assert.throws(
    () => load(yamlText),
    (err) => {
      assert.ok(err instanceof ContentFormatError, `expected a ContentFormatError, got ${err}`)
      assert.match(err.message, /display-templates\.hu\.yaml — /)
      assert.ok(err.message.includes(`template '${name}': `), err.message)
      assert.ok(err.message.includes(problem), `'${problem}' not in:\n${err.message}`)
      return true
    },
  )
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

test('a locale without a collection file has no templates, and an empty file is an empty collection', () => {
  assert.deepEqual(loadDisplayTemplateCollections(contentDir()), { hu: {} })
  assert.deepEqual(load(''), {})
})

test('a template loads with the defaults the reader fills in', () => {
  const { list } = load(
    'the-chapters:\n  targets: [chapter]\n  list:\n    count: 3\n    item:\n      first: "[{target.index}]"\n      separator: ", "\n',
  )['the-chapters']
  assert.deepEqual(list.count, { min: 3, max: 3 })
  assert.equal(list.item.last, '[{target.index}]')
  assert.equal(list.item.lastSeparator, ', ')
})

test('an invalid template fails the load, naming the file and the template', () => {
  rejects('theIndex:\n  targets: [chapter]\n  template: x\n', 'theIndex', 'the name is not kebab-case')
  assert.throws(() => load('- a\n'), /display-templates\.hu\.yaml — the file must map template names to templates\./)
})

test('the case keys a template may name are the ones the label registry declares', () => {
  rejects(
    "t:\n  targets: [definition]\n  template: \"{base('in', target.label)}{suffix('in', target.label)}\"\n",
    't',
    "case 'in' is not declared. 'hu' declares: ine, ela,",
  )
  assert.ok(load("t:\n  targets: [claim]\n  template: \"{inflect('poss', target.parent.label)}\"\n").t)
})

test('a name used twice in one file fails', () => {
  assert.throws(() => load('t:\n  targets: [chapter]\n  template: x\nt:\n  targets: [chapter]\n  template: y\n'), /duplicated mapping key/)
})

test('the raw graph carries each locale\'s collection, and an invalid one stops the load', async () => {
  const saved = process.env.CONTENT_DIR
  try {
    process.env.CONTENT_DIR = contentDir('remark:\n  targets: [remark]\n  template: megjegyzés\n')
    assert.deepEqual(Object.keys((await loadRawGraphData()).displayTemplates.hu), ['remark'])

    process.env.CONTENT_DIR = contentDir('Remark:\n  targets: [remark]\n  template: megjegyzés\n')
    await assert.rejects(loadRawGraphData(), ContentFormatError)
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR
    else process.env.CONTENT_DIR = saved
  }
})

// ---------------------------------------------------------------------------
// checkTemplate and the template context
// ---------------------------------------------------------------------------

test("a standalone section in another locale than its item stops the load", async () => {
  const saved = process.env.CONTENT_DIR
  try {
    const dir = contentDir()
    const pageDir = path.join(dir, 'pages', 'p')
    fs.mkdirSync(pageDir, { recursive: true })
    fs.mkdirSync(path.join(dir, 'books'))
    fs.writeFileSync(path.join(pageDir, 'page.yaml'), 'type: page\nname: p\nslug: p\nlocale: hu\ntitle: P\nsections: [s]\n')
    const section = (locale) => `name: s\nslug: s\nlocale: ${locale}\ntitle: S\nbody: []\n`
    process.env.CONTENT_DIR = dir

    fs.writeFileSync(path.join(pageDir, 's.yaml'), section('hu'))
    assert.equal((await loadRawGraphData()).standalones[0].sections.length, 1)

    fs.writeFileSync(path.join(pageDir, 's.yaml'), section('en'))
    await assert.rejects(loadRawGraphData(), (err) => {
      assert.ok(err instanceof ContentFormatError, `expected a ContentFormatError, got ${err}`)
      assert.match(err.message, /section 's' is in locale 'en', but its page is in 'hu'/)
      return true
    })
  } finally {
    if (saved === undefined) delete process.env.CONTENT_DIR
    else process.env.CONTENT_DIR = saved
  }
})

test('a template that resolves today passes the check for its target type', () => {
  const cases = { hu: ['ine', 'poss'] }
  const ok = (template, type) => assert.deepEqual(checkTemplate(template, [type], { links: 'at-most-one', cases }), [], template)
  ok('{the(target.index)} [{target.index} {capital(target.label.canonical)}]', 'theorem')
  ok("{the(target.index)} [{target.index} {capital(base('ine', target.label))}]{suffix('ine', target.label)}", 'definition')
  ok("{the(target.parent.index)} [{target.parent.index} {capital(base('poss', target.parent.label))}]{suffix('poss', target.parent.label)}", 'claim')
  ok('{the(target.index)} [{target.index} fejezet]', 'chapter')
  ok('[{target.title}]', 'book')
  ok('[modulo $p^{c+1}$ maradékosztály]', 'term')
})

/** The shape of a built context, in the vocabulary of TEMPLATE_CONTEXT_SHAPES. */
function shapeOf(value) {
  if (typeof value === 'string') return 'text'
  if ('canonical' in value && 'cases' in value) return 'label'
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shapeOf(v)]))
}

test('the declared context shapes match what buildContext gives each target type', () => {
  const data = raw()
  data.standalones.push(
    ...['article', 'newsletter', 'page', 'landing'].map((kind) => ({
      kind, name: kind, slug: kind, locale: 'hu', title: kind, abstract: [], prologue: [], sections: [], epilogue: [], references: [],
    })),
  )
  const graph = buildGraphFromRaw(data)
  const fqns = {
    book: 'books.konyv',
    chapter: 'books.konyv.chapters.fejezet',
    section: 'books.konyv.chapters.fejezet.sections.szakasz',
    definition: 'definitions.def-egy',
    theorem: 'theorems.tetel-egy',
    proof: 'theorems.tetel-egy.proofs.biz-egy',
    remark: 'definitions.def-egy.remarks.rem-egy',
    claim: 'definitions.def-egy.claims.def-claim',
    term: 'definitions.def-egy.terms.first-term',
    article: 'articles.article',
    newsletter: 'newsletters.newsletter',
    page: 'pages.page',
    landing: 'landings.landing',
  }
  assert.deepEqual(Object.keys(fqns).sort(), [...TEMPLATE_TARGET_TYPES].sort())
  for (const [type, fqn] of Object.entries(fqns)) {
    const ctx = buildContext(ref('x', fqn).targets[0], graph)
    assert.ok(ctx, `no context for ${type}`)
    assert.deepEqual(shapeOf(ctx.target), TEMPLATE_CONTEXT_SHAPES[type], type)
  }
})
