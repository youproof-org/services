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
 *
 * ## Both channels a page serves its links in
 *
 * Hrefs are read from the markup AND from the RSC payload — the `self.__next_f.push`
 * scripts every App Router page carries, which is how a panel's content reaches the
 * browser at all. That is not belt-and-braces over the same data: the inbound
 * reference lists are deliberately absent from the markup and present only in the
 * payload (`components/kb/panels/DeferredPanelContent.tsx`), and they are thousands
 * of fragment links whose targets nothing else verifies. A link the export serves is
 * a promise the export makes, whichever of the two copies carries it, so the check
 * follows them there rather than losing 16% of its coverage to the channel change.
 *
 * The payload's own hrefs are read as `"href":"…"` props out of the Flight chunks:
 * the push arguments are JSON, so they are parsed rather than pattern-matched, and a
 * chunk that does not parse is counted and reported rather than passed over. Ids are
 * still taken from the markup only — an id in the payload is an element the client
 * will render, and the point of this check is what is actually in the built pages.
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

/**
 * The RSC payload of one page as one string: the Flight chunks its
 * `self.__next_f.push([kind, chunk])` calls carry, concatenated in document order.
 *
 * `JSON.parse` on the push argument rather than a regex over its contents, because
 * the chunk is a JSON string literal — escaped quotes, escaped slashes and all — and
 * an href pulled out of it unparsed would be the escaped form rather than the URL.
 */
function payloadOf(html, unparsed) {
  let chunks = ''
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const [, chunk] = JSON.parse(m[1])
      if (typeof chunk === 'string') chunks += chunk
    } catch {
      unparsed.count++
    }
  }
  return chunks
}

let checkedInMarkup = 0
let checkedInPayload = 0
let skippedAbsent = 0
let skippedStub = 0
const unparsedChunks = { count: 0 }
const broken = []

for (const file of files) {
  const from = toPathname(file)
  const html = readFileSync(file, 'utf8')
  // `href="…"` in the markup, `"href":"…"` in the payload — the same links written
  // as an attribute and as a prop. Counted separately so the log says which channel
  // each is in, and so a channel falling silent is visible rather than absorbed.
  const sources = [
    { hrefs: html.matchAll(/href="([^"]*#[^"]*)"/g), count: () => checkedInMarkup++ },
    {
      hrefs: payloadOf(html, unparsedChunks).matchAll(/"href":"([^"]*#[^"]*)"/g),
      count: () => checkedInPayload++,
    },
  ]

  for (const source of sources) {
    for (const m of source.hrefs) {
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

      source.count()
      if (!ids.has(fragment)) {
        broken.push({ from, target, fragment })
      }
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
  `[check-anchors] ${checkedInMarkup + checkedInPayload} internal fragment link(s) checked ` +
    `across ${files.length} page(s) — ${checkedInMarkup} in the markup, ` +
    `${checkedInPayload} in the RSC payload` +
    `${skips.length ? `, skipped: ${skips.join(', ')}` : ''}.`,
)

// Not a warning: an unreadable chunk is a page whose payload went unchecked, and
// silently checking less is the failure this whole extension exists to avoid.
if (unparsedChunks.count > 0) {
  console.error(
    `[check-anchors] ${unparsedChunks.count} RSC payload chunk(s) did not parse as JSON, so the ` +
      `links in them\n  went unchecked. The push argument's shape has changed — read it the new ` +
      `way rather than\n  dropping the payload pass.`,
  )
  process.exit(1)
}

if (grouped.size > 0) {
  console.error(`[check-anchors] ${grouped.size} broken anchor target(s):`)
  for (const g of [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 20)) {
    console.error(`  ${g.target}#${g.fragment} — no such id (cited ${g.count}×, e.g. from ${g.from})`)
  }
  if (grouped.size > 20) console.error(`  … and ${grouped.size - 20} more`)
  process.exit(1)
}
