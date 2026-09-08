#!/usr/bin/env node
/**
 * Postbuild: the inbound-reference lists must not be in the served markup.
 *
 * An inbound-reference list is the transpose of edges the citing pages already
 * state in their own markup, so serving it repeats what a crawler can already
 * read — on the busiest entity page it was most of the document. The three panel
 * contents that are such a list (`DEFERRED_PANEL_KINDS` in
 * `components/kb/KbEntityPage.tsx`) therefore reach the page when the reader opens
 * the panel and not before: their rows travel in the RSC payload and are rendered
 * on the client (`components/kb/panels/DeferredPanelContent.tsx`).
 *
 * That is one `<DeferredPanelContent>` wrapper and one list of kinds. Nothing else
 * in the build would notice if either were dropped — the page would look and behave
 * exactly as it does now, and the rows would quietly be back in every page's markup.
 * Hence this gate, against the built HTML.
 *
 * ## Why it is scoped by panel kind rather than by the row class
 *
 * The obvious form of this check — "no `backlinks-panel_link` outside a `<script>`"
 * — is wrong, and would fail on a correct build. `components/kb/panels/
 * ReferencePanel.tsx` renders the same one-row component from the same stylesheet
 * for each OUTGOING reference in the prose, and those are deliberately in the markup:
 * they name a target the body already links to. A correct export carries thousands
 * of them. So the unit here is the SECTION and its `data-kb-panel-kind`, which is
 * the attribute `Panel.tsx` puts on every section precisely so the markup says which
 * is which without being parsed.
 *
 * ## What is asserted
 *
 *   1. **A deferred section carries no content.** Its markup holds nothing but the
 *      optional no-JavaScript line — no row, no list, no link, no text. Stated as
 *      "nothing at all" rather than "no rows" because the rule is about what reaches
 *      a crawler, and a deferred content that grew a second element would be just as
 *      much of a regression as one that kept its rows.
 *   2. **The shells are still served.** Every page with a panel serves its
 *      `incoming` section, and the deferred kinds occur across the export — so
 *      deleting the sections, or the panel, fails this rather than passing it.
 *   3. **The line a reader with no JavaScript is given is there**, exactly once per
 *      page and inside the `incoming` section. One sentence per page and not one per
 *      empty section is the whole design of it (`noJsCss` in `Panel.tsx`), so both
 *      halves of that are counted.
 *   4. **The kinds that are NOT deferred still carry their content.** The context
 *      chain has its links and the reference panels have their rows. This is the
 *      control: without it, a change that emptied every panel on the site would
 *      satisfy 1 and 3 and read as a pass.
 *
 * The list of deferred kinds is read out of `KbEntityPage.tsx` rather than written
 * down again, so the gate cannot drift from the page it is gating. A `.mjs` run by
 * `postbuild` cannot import a `.tsx`, and an import shim to make it able to would be
 * more machinery than the coupling is worth — so the literal is matched in the
 * source, and a shape this cannot read is a failure rather than a silent fallback.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')
const KINDS_SOURCE = path.join(websiteRoot, 'components', 'kb', 'KbEntityPage.tsx')

/** `next.config.ts` names every CSS-module class of ours `<file>_<local>`. */
const NO_JS_NOTE_CLASS = 'panel_noJsNote'
const CONTEXT_LINK_CLASS = 'panel_contextLink'
const ROW_CLASS = 'backlinks-panel_link'
/** `PANEL_ID` in `components/kb/Panel.tsx`, which is a literal there for this reason. */
const PANEL_ID = 'kb-panel'

if (!existsSync(OUT)) {
  console.error('[check-deferred-panels] no out/ directory — run after `next build`.')
  process.exit(1)
}

function deferredKinds() {
  const source = readFileSync(KINDS_SOURCE, 'utf8')
  const match = /export const DEFERRED_PANEL_KINDS[^=]*=\s*\[([^\]]*)\]/.exec(source)
  if (!match) {
    console.error(
      `[check-deferred-panels] could not read DEFERRED_PANEL_KINDS out of ` +
        `${path.relative(websiteRoot, KINDS_SOURCE)}.\n` +
        `  This gate reads the list from there so the two cannot drift. If the constant ` +
        `moved or\n  changed shape, point this script at the new one — do not copy the ` +
        `list in here.`,
    )
    process.exit(1)
  }
  const kinds = [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (kinds.length === 0) {
    console.error('[check-deferred-panels] DEFERRED_PANEL_KINDS is empty — nothing would be gated.')
    process.exit(1)
  }
  return kinds
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

/**
 * Every `<section data-kb-panel-kind="…">` of a page with its inner markup.
 *
 * Depth-counted rather than matched to the next `</section>`: a panel content is
 * authored markup and may hold a `<section>` of its own, and a nesting error here
 * would silently shorten a slice and hide whatever came after it.
 */
function panelSections(html) {
  const opener = /<section\b[^>]*\bdata-kb-panel-kind="([^"]*)"[^>]*>/g
  const boundary = /<section\b|<\/section>/g
  const sections = []
  for (const match of html.matchAll(opener)) {
    const from = match.index + match[0].length
    boundary.lastIndex = from
    let depth = 1
    let end = -1
    for (let token = boundary.exec(html); token; token = boundary.exec(html)) {
      depth += token[0] === '</section>' ? -1 : 1
      if (depth === 0) {
        end = token.index
        break
      }
    }
    if (end === -1) return { sections, unterminated: true }
    sections.push({ kind: match[1], inner: html.slice(from, end) })
  }
  return { sections, unterminated: false }
}

const DEFERRED = deferredKinds()
const files = htmlFiles(OUT)

let pagesWithPanel = 0
let noJsNotes = 0
let notesOutsideDeferred = 0
const sectionCounts = new Map()
let referenceRows = 0
let contextLinks = 0
const leaked = []
const missingNote = []
const unterminated = []

for (const file of files) {
  const page = path.relative(websiteRoot, file)
  // The rows the reader gets on open live in the `self.__next_f` scripts, which is
  // the copy this gate is NOT about: the whole point is that the markup a crawler
  // reads no longer carries them. So scripts go first, all of them.
  const html = readFileSync(file, 'utf8').replace(/<script\b[\s\S]*?<\/script>/g, '')
  if (!html.includes(`id="${PANEL_ID}"`)) continue
  pagesWithPanel++

  const { sections, unterminated: broken } = panelSections(html)
  if (broken) {
    unterminated.push(page)
    continue
  }

  let noteOnThisPage = 0
  for (const { kind, inner } of sections) {
    sectionCounts.set(kind, (sectionCounts.get(kind) ?? 0) + 1)
    const notes = [...inner.matchAll(new RegExp(`class="${NO_JS_NOTE_CLASS}"`, 'g'))].length
    noteOnThisPage += notes
    if (notes > 0 && !DEFERRED.includes(kind)) notesOutsideDeferred += notes

    if (kind === 'reference') {
      referenceRows += [...inner.matchAll(new RegExp(ROW_CLASS, 'g'))].length
    }
    if (kind === 'context') {
      contextLinks += [...inner.matchAll(new RegExp(CONTEXT_LINK_CLASS, 'g'))].length
    }
    if (!DEFERRED.includes(kind)) continue

    // Everything a deferred section is allowed to hold: the one line, and nothing
    // else — no element and no text of its own.
    const rest = inner
      .replace(new RegExp(`<p class="${NO_JS_NOTE_CLASS}"[^>]*>[\\s\\S]*?</p>`, 'g'), '')
      .trim()
    if (rest !== '') {
      leaked.push({ page, kind, excerpt: rest.slice(0, 160) })
    }
  }
  noJsNotes += noteOnThisPage
  if (noteOnThisPage !== 1) missingNote.push({ page, notes: noteOnThisPage })
}

const census = [...sectionCounts.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([kind, count]) => `${count} ${kind}${DEFERRED.includes(kind) ? '*' : ''}`)
  .join(', ')

console.log(
  `[check-deferred-panels] ${pagesWithPanel} page(s) with a panel, ${census} section(s) ` +
    `(* = held out of the markup: ${DEFERRED.join(', ')}); ${noJsNotes} no-JavaScript line(s), ` +
    `${referenceRows} reference row(s) and ${contextLinks} context link(s) still served.`,
)

let failed = false
const fail = (...lines) => {
  failed = true
  console.error(...lines)
}

if (unterminated.length > 0) {
  fail(
    `[check-deferred-panels] ${unterminated.length} page(s) have an unterminated panel section, ` +
      `so this gate could not read them:\n  ${unterminated.slice(0, 5).join('\n  ')}`,
  )
}

if (pagesWithPanel === 0) {
  fail(
    `[check-deferred-panels] no page in the export carries #${PANEL_ID}. The gate would pass ` +
      `on any build, so it is failing instead.`,
  )
}

for (const kind of DEFERRED) {
  if (!sectionCounts.has(kind)) {
    fail(
      `[check-deferred-panels] no '${kind}' section anywhere in the export. The section shell — ` +
        `its box, its\n  kind and its heading — is served whether or not its content is; ` +
        `losing it takes the panel\n  itself away from the reader.`,
    )
  }
}

if (leaked.length > 0) {
  fail(
    `[check-deferred-panels] ${leaked.length} deferred panel section(s) carry content in the ` +
      `served markup.\n  These are inbound-reference lists: they belong in the RSC payload and ` +
      `on the client, not in\n  the HTML a crawler reads. Check that Panel.tsx still wraps ` +
      `DEFERRED_PANEL_KINDS in\n  DeferredPanelContent.`,
  )
  for (const l of leaked.slice(0, 5)) console.error(`  ${l.page} [${l.kind}]: ${l.excerpt}…`)
  if (leaked.length > 5) console.error(`  … and ${leaked.length - 5} more`)
}

if (missingNote.length > 0) {
  fail(
    `[check-deferred-panels] ${missingNote.length} page(s) do not carry exactly one ` +
      `no-JavaScript line.\n  A reader without JavaScript is shown every section inline and the ` +
      `deferred ones have nothing\n  to show, so one sentence per page says so — and one per ` +
      `empty section is what it must not be.`,
  )
  for (const m of missingNote.slice(0, 5)) console.error(`  ${m.page}: ${m.notes} line(s)`)
  if (missingNote.length > 5) console.error(`  … and ${missingNote.length - 5} more`)
}

if (notesOutsideDeferred > 0) {
  fail(
    `[check-deferred-panels] ${notesOutsideDeferred} no-JavaScript line(s) sit in a section ` +
      `whose content IS served.\n  The line explains an absence; in a section that has its ` +
      `content it states something false.`,
  )
}

// The control: a change that emptied every panel on the site would satisfy everything
// above. These two kinds are deliberately still in the markup — the context chain is
// genuine structure, and a reference panel names an outgoing target the body links to.
if (referenceRows === 0 || contextLinks === 0) {
  fail(
    `[check-deferred-panels] the panel kinds that are NOT deferred have lost their content ` +
      `(${referenceRows} reference row(s), ${contextLinks} context link(s)).\n  Only the inbound ` +
      `lists are held back; everything else a crawler should follow stays in the served markup.`,
  )
}

if (failed) process.exit(1)
