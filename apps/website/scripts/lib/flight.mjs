/**
 * Pure string functions over the RSC Flight payload an exported page carries:
 * moving it out of the HTML into one external script (externalize-flight.mjs), and
 * reading it back to prove nothing was lost (check-flight.mjs).
 *
 * Split out of those two scripts so the unit tests can run them on fixture pages
 * with no static export present — see test/flight.test.mjs.
 *
 * ## What Next.js emits, and what the rewrite relies on
 *
 * Every App Router page ends with the async runtime, one init script, a contiguous
 * run of push scripts, and `</body></html>`:
 *
 *     <script>(self.__next_f=self.__next_f||[]).push([0])</script>
 *     <script>self.__next_f.push([1,"…"])</script>
 *     …
 *     </body></html>
 *
 * The client feeds every entry pushed onto the global `self.__next_f` into the
 * stream React hydrates from, and closes that stream at `DOMContentLoaded`
 * (`next/dist/client/app-index.js`). A classic, parser-blocking `<script src>` runs
 * before that event, exactly like the inline scripts it replaces, so the same
 * statements moved into one external file hydrate the same way. A `fetch` of the
 * page's `.txt` would resolve after the stream closed.
 *
 * Nothing is decoded or re-encoded on the way out: each statement is copied byte
 * for byte, and only the `<script>` wrappers change. Each of the three shape
 * assumptions below is checked on every page, and a page that breaks one throws a
 * `FlightShapeError` naming it, so a Next.js change stops the build rather than
 * shipping a page that half-hydrates. The fourth assumption — nothing lost or
 * reordered — is what `checkFlightPage` proves against the page's `.txt`.
 */
import { createHash } from 'node:crypto'

export const FLIGHT_INIT_STATEMENT = '(self.__next_f=self.__next_f||[]).push([0])'
export const FLIGHT_URL_PREFIX = '/_next/static/flight/'

const INIT_SCRIPT = `<script>${FLIGHT_INIT_STATEMENT}</script>`
const PUSH_OPEN = '<script>self.__next_f.push('
const PUSH_CLOSE = ')</script>'
const DOCUMENT_END = '</body></html>'
const HASH_LENGTH = 20
const FLIGHT_SCRIPT = /<script src="\/_next\/static\/flight\/([0-9a-f]+)\.js"><\/script>/g

export const ASSUMPTIONS = {
  oneInit: 'exactly one `(self.__next_f=self.__next_f||[]).push([0])` init script',
  contiguousBlock: 'the pushes form one contiguous block ending at `</body></html>`',
  jsonArguments: 'each push argument is a JSON array starting with a number',
  completePayload: 'the payload is complete: nothing is lost or reordered',
}

export class FlightShapeError extends Error {
  constructor(assumption, detail) {
    super(`${ASSUMPTIONS[assumption]} — ${detail}`)
    this.assumption = assumption
  }
}

const excerpt = (text, at) => JSON.stringify(text.slice(at, at + 80))

function countOccurrences(text, needle) {
  let count = 0
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) count++
  return count
}

function parsePushArgument(argument, index) {
  let parsed
  try {
    parsed = JSON.parse(argument)
  } catch {
    throw new FlightShapeError('jsonArguments', `push #${index + 1} does not parse as JSON: ${excerpt(argument, 0)}`)
  }
  if (!Array.isArray(parsed) || typeof parsed[0] !== 'number') {
    throw new FlightShapeError('jsonArguments', `push #${index + 1} is not an array starting with a number: ${excerpt(argument, 0)}`)
  }
  return parsed
}

/**
 * The page split into the markup before the payload and the payload's statements,
 * in document order, the init statement first.
 */
export function extractFlight(html) {
  const inits = countOccurrences(html, INIT_SCRIPT)
  if (inits === 0) {
    const alreadyRewritten = [...html.matchAll(FLIGHT_SCRIPT)].length > 0
    throw new FlightShapeError(
      'oneInit',
      alreadyRewritten
        ? 'found none, and the page already loads an external flight script: this export was ' +
            'rewritten before. Rebuild it with `pnpm build` instead of re-running `postbuild`.'
        : 'found none.',
    )
  }
  if (inits > 1) throw new FlightShapeError('oneInit', `found ${inits}.`)

  const initAt = html.indexOf(INIT_SCRIPT)
  const strayBefore = html.lastIndexOf('__next_f', initAt - 1)
  if (strayBefore !== -1) {
    throw new FlightShapeError('contiguousBlock', `\`__next_f\` appears before the init script: ${excerpt(html, strayBefore)}`)
  }

  const statements = [FLIGHT_INIT_STATEMENT]
  let cursor = initAt + INIT_SCRIPT.length
  while (html.startsWith(PUSH_OPEN, cursor)) {
    const argumentStart = cursor + PUSH_OPEN.length
    const close = html.indexOf(PUSH_CLOSE, argumentStart)
    if (close === -1) {
      throw new FlightShapeError('contiguousBlock', `push #${statements.length} is never closed: ${excerpt(html, cursor)}`)
    }
    const argument = html.slice(argumentStart, close)
    parsePushArgument(argument, statements.length - 1)
    statements.push(`self.__next_f.push(${argument})`)
    cursor = close + PUSH_CLOSE.length
  }

  if (html.slice(cursor) !== DOCUMENT_END) {
    throw new FlightShapeError(
      'contiguousBlock',
      `after ${statements.length - 1} push(es) the page continues with ${excerpt(html, cursor)} instead of ending at \`${DOCUMENT_END}\`.`,
    )
  }

  return { before: html.slice(0, initAt), statements }
}

export const flightSourceOf = (statements) => statements.map((statement) => `${statement};\n`).join('')

export const flightHashOf = (source) => createHash('sha256').update(source).digest('hex').slice(0, HASH_LENGTH)

/**
 * The rewritten page, and the external script it now loads. The file is named by a
 * hash of its content, so a cached copy can never pair a new page with an old payload.
 */
export function externalizeFlight(html) {
  const { before, statements } = extractFlight(html)
  const source = flightSourceOf(statements)
  const fileName = `${flightHashOf(source)}.js`
  return {
    html: `${before}<script src="${FLIGHT_URL_PREFIX}${fileName}"></script>${DOCUMENT_END}`,
    fileName,
    source,
    pushCount: statements.length - 1,
  }
}

export const flightScriptsOf = (html) => [...html.matchAll(FLIGHT_SCRIPT)].map((match) => `${match[1]}.js`)

/**
 * The RSC payload an external flight file carries: the text of its `[1, …]` chunks,
 * concatenated in order. This is the same string Next.js writes to the page's
 * `.txt` for client navigation, which is what makes the two comparable.
 */
export function decodeFlightSource(source) {
  const lines = source.split('\n')
  if (lines.pop() !== '') throw new Error('the file does not end with a newline.')
  if (lines[0] !== `${FLIGHT_INIT_STATEMENT};`) throw new Error('the file does not start with the init statement.')

  let payload = ''
  lines.slice(1).forEach((line, index) => {
    const argument = /^self\.__next_f\.push\((.*)\);$/.exec(line)?.[1]
    if (argument === undefined) throw new Error(`line ${index + 2} is not a push statement: ${excerpt(line, 0)}`)
    const [kind, chunk] = parsePushArgument(argument, index)
    if (kind !== 1 || typeof chunk !== 'string') {
      throw new Error(`push #${index + 1} is kind ${JSON.stringify(kind)}, not a [1, "…"] text chunk, so it cannot be compared with the \`.txt\`.`)
    }
    payload += chunk
  })
  return payload
}

/**
 * Every way a rewritten page can fail to carry its whole payload. `readFlight`
 * returns a flight file's source by name, or `undefined` when it does not exist;
 * `txt` is the page's `.txt`, or `null` for a page Next.js writes none for.
 */
export function checkFlightPage({ html, readFlight, txt }) {
  const problems = []
  if (html.includes('__next_f')) problems.push('an inline `__next_f` script is still in the HTML.')

  const scripts = flightScriptsOf(html)
  if (scripts.length !== 1) {
    problems.push(`expected exactly one flight script, found ${scripts.length}.`)
    return problems
  }

  const [fileName] = scripts
  const source = readFlight(fileName)
  if (source === undefined) return [...problems, `${FLIGHT_URL_PREFIX}${fileName} does not exist.`]
  if (`${flightHashOf(source)}.js` !== fileName) {
    problems.push(`${FLIGHT_URL_PREFIX}${fileName} is not named by the hash of its content.`)
  }

  let payload
  try {
    payload = decodeFlightSource(source)
  } catch (error) {
    return [...problems, `${FLIGHT_URL_PREFIX}${fileName}: ${error.message}`]
  }
  if (txt !== null && payload !== txt) {
    problems.push(`${ASSUMPTIONS.completePayload} — ${FLIGHT_URL_PREFIX}${fileName} decodes to a payload ${describeDifference(payload, txt)}.`)
  }
  return problems
}

function describeDifference(payload, txt) {
  let at = 0
  while (at < payload.length && at < txt.length && payload[at] === txt[at]) at++
  return `of ${payload.length} characters where the \`.txt\` has ${txt.length}; they first differ at character ${at}`
}
