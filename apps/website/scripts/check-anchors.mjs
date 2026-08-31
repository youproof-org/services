#!/usr/bin/env node
/**
 * Postbuild: every internal fragment link in the export must resolve to an element
 * that actually exists on the target page.
 *
 * This is the check `validateAnchors` in the content graph CANNOT be: that one
 * compares hrefs against the anchors the graph says a page will render, and both
 * sides come from the same builder, so it agrees with itself by construction. It
 * catches a reference to something that does not exist; it does NOT catch a
 * component rendering a different `id` than the builder put in the href.
 *
 * This script closes that gap by reading the built HTML — hrefs on one side, `id`
 * attributes on the other, nothing derived from the graph. Change the anchor
 * builder without changing the component that renders the id (or vice versa) and
 * this fails.
 *
 * Cross-page fragments are followed to the target file, so a link from chapter 12
 * into chapter 11's section anchor is checked against chapter 11's ids. Fragments
 * pointing at a page the export does not contain are skipped: an unpublished
 * chapter or a not-yet-routed knowledge-base page is a different concern, owned by
 * validateKbLinks and the crawler.
 *
 * An unpublished chapter is skipped the same way even though its page IS in the
 * export, because that page is a stub (`data-stub`) — it renders the "not yet
 * migrated" notice and a link to the legacy site, and none of the chapter's own
 * anchors. A forward reference into a section of such a chapter is correct content
 * whose target simply is not built yet, which is the same concern as above and not
 * id drift. Nothing is masked: a stub renders no anchors at all, so there is no
 * mismatch it could hide.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'out')

if (!existsSync(OUT)) {
  console.error('[check-anchors] no out/ directory — run after `next build`.')
  process.exit(1)
}

function htmlFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...htmlFiles(full))
    else if (entry.name.endsWith('.html')) found.push(full)
  }
  return found
}

/** URL pathname -> the set of element ids that page renders. */
const idsByPath = new Map()
/** URL pathname -> the file it came from, for error messages. */
const fileByPath = new Map()
/** URL pathnames whose page is a stub, and so renders no content anchors. */
const stubPaths = new Set()

const toPathname = (file) => {
  const rel = path.relative(OUT, file).replace(/\\/g, '/')
  return '/' + rel.replace(/\.html$/, '').replace(/\/index$/, '')
}

const files = htmlFiles(OUT)
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const ids = new Set()
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1])
  const pathname = toPathname(file)
  idsByPath.set(pathname, ids)
  fileByPath.set(pathname, file)
  if (/\sdata-stub="/.test(html)) stubPaths.add(pathname)
}

let checked = 0
let skippedAbsent = 0
let skippedStub = 0
const broken = []

for (const file of files) {
  const from = toPathname(file)
  const html = readFileSync(file, 'utf8')
  for (const m of html.matchAll(/href="([^"]*#[^"]*)"/g)) {
    const href = m[1]
    // Only internal links: an absolute URL is someone else's page.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) continue
    const hash = href.indexOf('#')
    const target = href.slice(0, hash) || from
    const fragment = href.slice(hash + 1)
    if (!fragment) continue

    const ids = idsByPath.get(target)
    if (!ids) { skippedAbsent++; continue }
    if (stubPaths.has(target)) { skippedStub++; continue }

    checked++
    if (!ids.has(fragment)) {
      broken.push({ from, target, fragment })
    }
  }
}

// Group by (target, fragment): one broken anchor cited 400 times is one problem,
// and printing it 400 times buries the others.
const grouped = new Map()
for (const b of broken) {
  const key = `${b.target}#${b.fragment}`
  const g = grouped.get(key)
  if (g) g.count++
  else grouped.set(key, { ...b, count: 1 })
}

const skips = [
  skippedAbsent ? `${skippedAbsent} target page not in this export` : '',
  skippedStub ? `${skippedStub} target page is a stub` : '',
].filter(Boolean)

console.log(
  `[check-anchors] ${checked} internal fragment link(s) checked across ${files.length} page(s)` +
    `${skips.length ? `, skipped: ${skips.join(', ')}` : ''}.`,
)

if (grouped.size > 0) {
  console.error(`[check-anchors] ${grouped.size} broken anchor target(s):`)
  for (const g of [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 20)) {
    console.error(`  ${g.target}#${g.fragment} — no such id (cited ${g.count}×, e.g. from ${g.from})`)
  }
  if (grouped.size > 20) console.error(`  … and ${grouped.size - 20} more`)
  process.exit(1)
}
