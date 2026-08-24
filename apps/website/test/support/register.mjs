// Test-only shims, loaded via `--import` before anything else.
//
// `server-only` is not an installed package: Next resolves it at bundle time to
// enforce that a module never reaches the client. Under plain Node nothing can
// resolve it, so every module that reaches for the content graph fails to load.
// The guard is a build-time concern with no runtime behaviour, so it is aliased to
// an empty module here.
//
// Both loaders are patched because tsx transpiles TypeScript through the CJS
// require path, while a plain `.mjs` import goes through the ESM resolver.
import Module from 'node:module'
import { register } from 'node:module'

const STUBBED = new Set(['server-only'])

const load = Module._load
Module._load = function (request, ...rest) {
  if (STUBBED.has(request)) return {}
  return load.call(this, request, ...rest)
}

register('./resolve-hooks.mjs', import.meta.url)
