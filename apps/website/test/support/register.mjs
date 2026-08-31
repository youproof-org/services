// Test-only shims, loaded via `--import` before anything else.
//
// `server-only` is not an installed package: Next resolves it at bundle time to
// enforce that a module never reaches the client. Under plain Node nothing can
// resolve it, so every module that reaches for the content graph fails to load.
// The guard is a build-time concern with no runtime behaviour, so it is aliased to
// an empty module here.
//
// THREE hooks, because a TypeScript module reaches Node's CJS layer differently
// depending on the Node and tsx version:
//
//   - `Module._load` — the classic `require()` entry point.
//   - `Module._resolveFilename` — what tsx's ESM→CJS translator goes through on
//     Node 24. It bypasses `_load` entirely, so without this hook the suite fails
//     to load at all with `Cannot find module 'server-only'`. It must return a real
//     resolvable path, hence the empty-module.cjs stub rather than an object.
//   - the ESM `resolve` hook — for a plain `.mjs` import.
//
// Covering all three keeps the suite runnable across Node versions instead of
// silently pinning it to one.
import Module from 'node:module'
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'

const STUBBED = new Set(['server-only'])
const STUB_PATH = fileURLToPath(new URL('./empty-module.cjs', import.meta.url))

const load = Module._load
Module._load = function (request, ...rest) {
  if (STUBBED.has(request)) return {}
  return load.call(this, request, ...rest)
}

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (STUBBED.has(request)) return STUB_PATH
  return resolveFilename.call(this, request, ...rest)
}

register('./resolve-hooks.mjs', import.meta.url)
