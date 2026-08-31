#!/usr/bin/env node
/**
 * The static file server the browser tests run against.
 *
 * `pnpm test:e2e` must exercise **the artifact that ships** — `out/`, the static
 * export uploaded to R2 — and not `next dev`, whose hydration path, error overlay
 * and on-demand compilation are all different from production's. So the config
 * points Playwright at this, and this serves the directory verbatim: no rewrites
 * beyond the extensionless→`.html` mapping the CDN itself performs, no
 * transformation of the bytes.
 *
 * Dependency-free on purpose. `node:http` and `node:fs` do the whole job, and the
 * repo carries no static-server package — adding one to run tests would put weight
 * in the lockfile that the site itself never uses.
 *
 * It refuses to start without `out/`, rather than building one: a full export is
 * 587 pages and several minutes, which is not something a test command should
 * trigger behind the reader's back.
 *
 * Usage: `node scripts/serve-out.mjs [port]` (default 4321).
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'out')
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4321)

if (!existsSync(OUT)) {
  console.error(
    '[serve-out] no out/ directory — run `pnpm build` first. The browser tests run\n' +
      '            against the static export, and this server does not create one.',
  )
  process.exit(1)
}

const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.xml': 'application/xml; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
  }),
)

/**
 * The candidates a request path may resolve to, in the order the CDN tries them:
 * the file itself, then `<path>.html` (how the export names a leaf page), then
 * `<path>/index.html` (how it names a directory's own page).
 */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath)
  // Normalize away `..` before joining, so no request can read outside out/.
  const rel = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '')
  const base = path.join(OUT, rel)
  if (!base.startsWith(OUT)) return null
  const candidates = [base, `${base}.html`, path.join(base, 'index.html')]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

const server = createServer((req, res) => {
  const urlPath = new URL(req.url ?? '/', 'http://localhost').pathname
  const file = resolveFile(urlPath === '/' ? '/index.html' : urlPath)

  if (!file) {
    const notFound = path.join(OUT, '404.html')
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' })
    if (existsSync(notFound)) createReadStream(notFound).pipe(res)
    else res.end('404')
    return
  }

  res.writeHead(200, {
    'content-type': TYPES.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream',
    // The tests reload and navigate back and forth; a cached response would hide
    // a rebuild between runs.
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(res)
})

server.listen(PORT, () => {
  console.log(`[serve-out] serving ${OUT} on http://127.0.0.1:${PORT}`)
})
