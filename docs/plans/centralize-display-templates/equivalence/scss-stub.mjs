// --import this to load components that import CSS modules: each one loads as an empty object.
import { register } from 'node:module'
register(
  'data:text/javascript,' +
    encodeURIComponent(`export async function load(url, context, next) {
  if (/\\.s?css$/.test(url)) return { format: 'module', source: 'export default new Proxy({}, { get: (_, k) => String(k) })', shortCircuit: true }
  return next(url, context)
}`),
)
