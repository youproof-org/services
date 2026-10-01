#!/usr/bin/env node
/**
 * Postbuild: every formula in the export must ship its authored LaTeX as text.
 *
 * `mathSource` in `lib/utils/math.ts` serves each formula as its LaTeX source,
 * which `MathEnhancer` typesets in the browser. The source is what a crawler that
 * runs no script reads, and the one form in which a text extractor recovers a
 * formula: KaTeX's glyph run strips `a^{p-1}` to `a p − 1`.
 *
 * Three things are checked:
 *
 *   1. No formula in the export is typeset. A `<span class="katex">` means some
 *      render path bypasses mathSource, and puts KaTeX's markup back into the
 *      page weight that this layout exists to keep out of it.
 *   2. Every source span's LaTeX survives a NAIVE extraction of its page — strip
 *      tags with a regex, decode the XML entities, and the LaTeX must still be
 *      there verbatim. It catches entity mangling, which is not hypothetical — a
 *      column separator `&` ships as `&amp;`.
 *   3. At least one formula as AUTHORED in the content repo appears verbatim in
 *      that naive extraction. 2 reads the spans the build wrote, so it would agree
 *      with itself if the source were ever normalised; this one crosses from the
 *      content YAML to the HTML and would not.
 *
 * Why 3 asserts "at least one" rather than a count: the content tree can hold
 * formulas on pages this export does not build, an unpublished chapter being the
 * obvious case, so full coverage is a property of today's content and not of this
 * code. The figure is printed for information rather than asserted.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
// Populates CONTENT_DIR from .env.local when not already exported (local dev);
// must be imported before it is read below. CI exports it, so this is a no-op there.
import './lib/load-env.mjs'

const websiteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(websiteRoot, 'out')
const contentDir = process.env.CONTENT_DIR
  ? path.resolve(websiteRoot, process.env.CONTENT_DIR)
  : path.resolve(websiteRoot, '../content')

if (!existsSync(OUT)) {
  console.error('[check-mathml] no out/ directory — run after `next build`.')
  process.exit(1)
}

function filesUnder(dir, ext) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...filesUnder(full, ext))
    else if (ext.test(entry.name)) found.push(full)
  }
  return found
}

// `&#x27;` as well as `&#39;`: React writes the hex form, and `\'` is a real
// accent macro in the corpus, so the decimal form alone leaves it unmatched.
const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, '&')

/** What a naive text extractor gets: tags dropped with a regex, entities decoded. */
const asPlainText = (html) => decodeXml(html.replace(/<[^>]*>/g, ' '))

const TYPESET = /<span class="katex">/g
const SOURCE = /<span class="tex-src"(?: data-display)?>([^<]*)<\/span>/g

const pages = filesUnder(OUT, /\.html$/)
let spans = 0
let sources = 0
const typeset = []
const notInText = []
/** Every LaTeX string the export actually serves as text, for check 3. */
const servedTex = new Set()

for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const text = asPlainText(html)
  const page = path.relative(websiteRoot, file)

  for (const m of html.matchAll(TYPESET)) {
    spans++
    typeset.push({ page, excerpt: html.slice(m.index, m.index + 120) })
  }

  for (const m of html.matchAll(SOURCE)) {
    sources++
    const tex = decodeXml(m[1])
    if (!text.includes(tex)) notInText.push({ page, tex })
    else servedTex.add(tex)
  }
}

const authored = new Set()
if (existsSync(contentDir)) {
  const collect = (node) => {
    if (Array.isArray(node)) return node.forEach(collect)
    if (!node || typeof node !== 'object') return
    if (node.type === 'formula' && typeof node.content === 'string') authored.add(node.content.trim())
    for (const value of Object.values(node)) collect(value)
  }
  for (const file of filesUnder(contentDir, /\.ya?ml$/)) {
    try { collect(yaml.load(readFileSync(file, 'utf8'))) } catch { /* not our validator's job */ }
  }
} else {
  console.error(`[check-mathml] CONTENT_DIR does not exist: ${contentDir}`)
  process.exit(1)
}

const authoredAndServed = [...authored].filter((tex) => servedTex.has(tex))

console.log(
  `[check-mathml] ${sources} formula source(s) and ${spans} typeset formula(s) across ${pages.length} page(s), ` +
    `${authoredAndServed.length}/${authored.size} authored formula(s) ` +
    `found verbatim in a tag-strip of the export.`,
)

let failed = false

if (typeset.length > 0) {
  failed = true
  console.error(
    `[check-mathml] ${typeset.length} formula(s) ship typeset by KaTeX instead of as LaTeX source.\n` +
      `  Render formulas through mathSource in lib/utils/math.ts.`,
  )
  for (const m of typeset.slice(0, 5)) console.error(`  ${m.page}: ${m.excerpt}…`)
  if (typeset.length > 5) console.error(`  … and ${typeset.length - 5} more`)
}

if (notInText.length > 0) {
  failed = true
  console.error(`[check-mathml] ${notInText.length} formula source(s) do not survive a tag-strip of their page:`)
  for (const m of notInText.slice(0, 5)) console.error(`  ${m.page}: ${m.tex}`)
  if (notInText.length > 5) console.error(`  … and ${notInText.length - 5} more`)
}

if (sources === 0) {
  failed = true
  console.error('[check-mathml] no formula sources found in the export — the check cannot mean anything.')
}

if (authored.size === 0) {
  failed = true
  console.error(`[check-mathml] no authored formulas found under ${contentDir} — the check cannot mean anything.`)
} else if (authoredAndServed.length === 0) {
  failed = true
  console.error(
    `[check-mathml] not one of the ${authored.size} formulas authored in the content repo appears\n` +
      `  verbatim in a tag-strip of the export. The LaTeX is either absent or rewritten.`,
  )
}

if (failed) process.exit(1)
