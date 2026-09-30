// The postbuild move of the RSC payload out of the HTML (externalize-flight.mjs) and
// the check that reads it back (check-flight.mjs).
//
// These prove the guards fire and the rewrite is lossless on the shapes below. They
// cannot see what a new Next.js version emits: only a build can, which is why both
// scripts also run over the real export in `postbuild`.
//
// `page-tail.html` is the real end of an exported page, from the footer on, and
// `page-tail.txt` is the `.txt` Next.js wrote beside it. Every other fixture breaks
// exactly one assumption the rewrite relies on.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  ASSUMPTIONS,
  checkFlightPage,
  decodeFlightSource,
  externalizeFlight,
  extractFlight,
  FLIGHT_INIT_STATEMENT,
  flightHashOf,
  flightScriptsOf,
  FlightShapeError,
} from '../scripts/lib/flight.mjs'

const fixture = (name) => readFileSync(new URL(`./fixtures/flight/${name}`, import.meta.url), 'utf8')

const PAGE = fixture('page-tail.html')
const PAGE_TXT = fixture('page-tail.txt')

const inlineScriptsOf = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])

const rejects = (html, assumption, detail) =>
  assert.throws(
    () => externalizeFlight(html),
    (error) => {
      assert.ok(error instanceof FlightShapeError)
      assert.equal(error.assumption, assumption)
      assert.ok(error.message.startsWith(ASSUMPTIONS[assumption]), error.message)
      if (detail) assert.match(error.message, detail)
      return true
    },
  )

test('the real page tail moves into one external script, statement for statement', () => {
  const inline = inlineScriptsOf(PAGE)
  const { fileName, source, pushCount } = externalizeFlight(PAGE)

  assert.equal(inline[0], FLIGHT_INIT_STATEMENT)
  assert.equal(pushCount, inline.length - 1)
  assert.equal(source, inline.map((statement) => `${statement};\n`).join(''))
  assert.equal(fileName, `${flightHashOf(source)}.js`)
  assert.match(fileName, /^[0-9a-f]{20}\.js$/)
})

test('the rewritten page keeps everything before the payload and ends at the one flight script', () => {
  const { html, fileName } = externalizeFlight(PAGE)
  const payloadStart = PAGE.indexOf(`<script>${FLIGHT_INIT_STATEMENT}</script>`)

  assert.ok(html.startsWith(PAGE.slice(0, payloadStart)))
  assert.ok(html.endsWith(`<script src="/_next/static/flight/${fileName}"></script></body></html>`))
  assert.equal(html.includes('__next_f'), false)
  assert.deepEqual(flightScriptsOf(html), [fileName])
})

test('the async runtime stays ahead of the flight script, which is neither async nor deferred', () => {
  const { html } = externalizeFlight(PAGE)
  const runtime = html.indexOf('/_next/static/chunks/webpack-')
  const flight = html.indexOf('<script src="/_next/static/flight/')
  assert.ok(runtime !== -1 && runtime < flight)
  assert.doesNotMatch(html.slice(flight), /\b(async|defer|type=)/)
})

test('the external file decodes to exactly the .txt Next.js wrote for the page', () => {
  assert.equal(decodeFlightSource(externalizeFlight(PAGE).source), PAGE_TXT)
})

test('the same payload always gets the same file name, and a different one another', () => {
  const again = externalizeFlight(PAGE)
  assert.equal(again.fileName, externalizeFlight(PAGE).fileName)

  const edited = PAGE.replace('self.__next_f.push([1,"', 'self.__next_f.push([1,"x')
  assert.notEqual(externalizeFlight(edited).fileName, again.fileName)
})

test('extractFlight returns the statements in document order, the init first', () => {
  const { statements } = extractFlight(PAGE)
  assert.equal(statements[0], FLIGHT_INIT_STATEMENT)
  assert.deepEqual(statements.slice(1), inlineScriptsOf(PAGE).slice(1))
})

test('a page with no init script is rejected', () => {
  rejects(fixture('no-init.html'), 'oneInit', /found none\.$/)
})

test('a page already rewritten is rejected with a pointer to rebuild', () => {
  const { html } = externalizeFlight(PAGE)
  rejects(html, 'oneInit', /rewritten before/)
})

test('a page with two init scripts is rejected', () => {
  rejects(fixture('two-inits.html'), 'oneInit', /found 2\./)
})

test('`__next_f` before the init script is rejected', () => {
  rejects(fixture('next-f-before-init.html'), 'contiguousBlock', /before the init script/)
})

test('other markup inside the push block is rejected', () => {
  rejects(fixture('markup-inside-block.html'), 'contiguousBlock', /<div hidden>/)
})

test('anything after the push block but `</body></html>` is rejected', () => {
  rejects(PAGE.replace(/<\/body><\/html>$/, '</body></html>\n'), 'contiguousBlock', /instead of ending/)
  rejects(PAGE.replace(/<\/body><\/html>$/, '<script>1</script></body></html>'), 'contiguousBlock')
})

test('a push that is never closed is rejected', () => {
  rejects(PAGE.replace(/\)<\/script><\/body><\/html>$/, '</body></html>'), 'contiguousBlock', /never closed/)
})

test('a push argument that is not JSON is rejected', () => {
  rejects(fixture('argument-not-json.html'), 'jsonArguments', /push #2 does not parse as JSON/)
})

test('a push argument that is not an array starting with a number is rejected', () => {
  rejects(fixture('argument-not-number-array.html'), 'jsonArguments', /push #2 is not an array starting with a number/)
})

const rewritten = externalizeFlight(PAGE)
const readFlightFrom = (files) => (fileName) => files[fileName]
const intact = readFlightFrom({ [rewritten.fileName]: rewritten.source })

test('check-flight: a correctly rewritten page has no problems', () => {
  assert.deepEqual(checkFlightPage({ html: rewritten.html, readFlight: intact, txt: PAGE_TXT }), [])
})

test('check-flight: a page without a .txt still gets the structural checks', () => {
  assert.deepEqual(checkFlightPage({ html: rewritten.html, readFlight: intact, txt: null }), [])
  assert.equal(checkFlightPage({ html: rewritten.html, readFlight: () => undefined, txt: null }).length, 1)
})

test('check-flight: a lost chunk is reported against the completeness assumption', () => {
  const lines = rewritten.source.split('\n')
  const lossy = [...lines.slice(0, 2), ...lines.slice(3)].join('\n')
  const fileName = `${flightHashOf(lossy)}.js`
  const html = rewritten.html.replace(rewritten.fileName, fileName)

  const [problem, ...rest] = checkFlightPage({ html, readFlight: readFlightFrom({ [fileName]: lossy }), txt: PAGE_TXT })
  assert.deepEqual(rest, [])
  assert.ok(problem.startsWith(ASSUMPTIONS.completePayload), problem)
})

test('check-flight: reordered chunks are reported', () => {
  const lines = rewritten.source.split('\n')
  const reordered = [lines[0], lines[2], lines[1], ...lines.slice(3)].join('\n')
  const fileName = `${flightHashOf(reordered)}.js`
  const html = rewritten.html.replace(rewritten.fileName, fileName)

  const problems = checkFlightPage({ html, readFlight: readFlightFrom({ [fileName]: reordered }), txt: PAGE_TXT })
  assert.equal(problems.length, 1)
  assert.match(problems[0], /first differ at character 0/)
})

test('check-flight: an inline payload left in the HTML is reported', () => {
  const html = rewritten.html.replace('</body>', '<script>self.__next_f.push([1,""])</script></body>')
  assert.match(checkFlightPage({ html, readFlight: intact, txt: PAGE_TXT })[0], /inline `__next_f`/)
})

test('check-flight: a page with no flight script, or two, is reported', () => {
  const none = rewritten.html.replace(/<script src="\/_next\/static\/flight\/[^"]+"><\/script>/, '')
  assert.deepEqual(checkFlightPage({ html: none, readFlight: intact, txt: PAGE_TXT }), [
    'expected exactly one flight script, found 0.',
  ])

  const tag = `<script src="/_next/static/flight/${rewritten.fileName}"></script>`
  const twice = rewritten.html.replace(tag, tag + tag)
  assert.deepEqual(checkFlightPage({ html: twice, readFlight: intact, txt: PAGE_TXT }), [
    'expected exactly one flight script, found 2.',
  ])
})

test('check-flight: a missing flight file is reported', () => {
  assert.deepEqual(checkFlightPage({ html: rewritten.html, readFlight: () => undefined, txt: PAGE_TXT }), [
    `/_next/static/flight/${rewritten.fileName} does not exist.`,
  ])
})

test('check-flight: a file whose name is not its content hash is reported', () => {
  const tampered = rewritten.source.replace('self.__next_f.push([1,"', 'self.__next_f.push([1,"x')
  const problems = checkFlightPage({
    html: rewritten.html,
    readFlight: readFlightFrom({ [rewritten.fileName]: tampered }),
    txt: PAGE_TXT,
  })
  assert.match(problems[0], /not named by the hash of its content/)
  assert.ok(problems[1].startsWith(ASSUMPTIONS.completePayload))
})

test('check-flight: a chunk kind the .txt cannot hold is reported rather than skipped', () => {
  const withFormState = rewritten.source + 'self.__next_f.push([2,null]);\n'
  const fileName = `${flightHashOf(withFormState)}.js`
  const html = rewritten.html.replace(rewritten.fileName, fileName)
  const [problem] = checkFlightPage({ html, readFlight: readFlightFrom({ [fileName]: withFormState }), txt: PAGE_TXT })
  assert.match(problem, /is kind 2, not a \[1, "…"\] text chunk/)
})

test('decodeFlightSource rejects a file that does not start with the init statement', () => {
  assert.throws(() => decodeFlightSource('self.__next_f.push([1,"a"]);\n'), /init statement/)
})

test('decodeFlightSource rejects a line that is not a push statement', () => {
  assert.throws(
    () => decodeFlightSource(`${FLIGHT_INIT_STATEMENT};\nconsole.log(1);\n`),
    /line 2 is not a push statement/,
  )
})
