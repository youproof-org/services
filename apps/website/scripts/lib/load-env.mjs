/**
 * Loads `.env.local` / `.env` for the plain-`node` build scripts.
 *
 * `next dev` and `next build` read these files themselves, but the pre/post
 * scripts in package.json run as bare `node scripts/*.mjs` and get none of it.
 * Without this, `CONTENT_DIR` from `.env.local` is invisible to sync-figures.mjs
 * and gen-content-lastmod.mjs, which then silently fall back to the nonexistent
 * `../content` and no-op — figures never sync in local dev.
 *
 * Precedence mirrors Next.js: a variable already in `process.env` always wins
 * (so CI's exported `CONTENT_DIR` is untouched), then `.env.local`, then `.env`.
 *
 * Mode-specific files (`.env.development`, `.env.production`, …) are
 * deliberately NOT read: these scripts run *before* next, so they cannot know
 * which mode next will pick, and guessing would load the wrong file on
 * `prebuild`. Anything the build scripts need belongs in `.env.local`/`.env`.
 *
 * `${VAR}` and `$VAR` references are expanded from the environment as it stands
 * at that point, matching Next.js's dotenv-expand behavior — `.env.local` here
 * uses `${HOME}`, and Node's own `--env-file` does not expand it.
 */
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Expand `${VAR}` / `$VAR` against process.env; unknown names expand to ''. */
function expand(value) {
  return value.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (_, braced, bare) => process.env[braced ?? bare] ?? '')
}

function parseLine(line) {
  const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (!m) return null
  const key = m[1]
  let raw = m[2].trim()

  if (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2) {
    return [key, raw.slice(1, -1)]           // single quotes → no expansion
  }
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    raw = raw.slice(1, -1).replace(/\\n/g, '\n')
  } else {
    raw = raw.replace(/\s+#.*$/, '').trim()  // unquoted → strip trailing comment
  }
  return [key, expand(raw)]
}

for (const file of ['.env.local', '.env']) {
  const abs = path.join(websiteRoot, file)
  if (!existsSync(abs)) continue
  for (const line of readFileSync(abs, 'utf8').split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const entry = parseLine(line)
    if (!entry) continue
    const [key, value] = entry
    if (process.env[key] === undefined) process.env[key] = value
  }
}
