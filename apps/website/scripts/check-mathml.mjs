#!/usr/bin/env node
/**
 * Postbuild: every formula in the export must ship its authored LaTeX as text.
 *
 * KaTeX's `output: 'html'` emits only a glyph run whose one text-bearing span is
 * `aria-hidden="true"` — unreadable to a screen reader, and to a text extractor
 * `a^{p-1}` flattens to `a p − 1`, which reads equally as a·p−1. `renderKatex`
 * therefore asks for `htmlAndMathml`, which adds a MathML subtree carrying the
 * source in `<annotation encoding="application/x-tex">`. That is a one-word
 * setting in `lib/utils/math.ts` that nothing else in the build would notice if
 * it were reverted, so it is gated here, against the built HTML.
 *
 * Three things are checked:
 *
 *   1. Every `<span class="katex">` in the export carries an annotation. Catches
 *      the setting being reverted, and any render path that bypasses renderKatex.
 *   2. Every annotation's LaTeX survives a NAIVE extraction of its page — strip
 *      tags with a regex, decode the XML entities, and the LaTeX must still
 *      be there verbatim. This is the path `data-tex` attributes failed: an
 *      attribute is not text. It also catches entity mangling, which is not
 *      hypothetical — a column separator `&` ships as `&amp;`.
 *   3. At least one formula as AUTHORED in the content repo appears verbatim in
 *      that naive extraction. 1 and 2 both read the annotation the build wrote,
 *      so they would agree with themselves if KaTeX ever normalised the source;
 *      this one crosses from the content YAML to the HTML and would not.
 *
 * Why 3 asserts "at least one" rather than a count: the expectation is derived
 * from the content repo rather than pinned to a literal, so it cannot rot. A
 * threshold could — the content tree can hold formulas on pages this export does
 * not build, an unpublished chapter being the obvious case, so full coverage is
 * a property of today's content and not of this code. It happens to be 1601 of
 * 1601 as this is written; that figure is printed for information rather than
 * asserted, and checks 1 and 2 are what make the gate exhaustive.
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

const KATEX_SPAN = /<span class="katex">/g
const ANNOTATION = /<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g

const pages = filesUnder(OUT, /\.html$/)
let spans = 0
let annotations = 0
const missingAnnotation = []
const notInText = []
/** Every LaTeX string the export actually serves as text, for check 3. */
const servedTex = new Set()

for (const file of pages) {
  const html = readFileSync(file, 'utf8')
  const text = asPlainText(html)
  const page = path.relative(websiteRoot, file)

  // A formula's annotation always precedes the next `<span class="katex">`, so
  // the slice from one span opener to the next contains its own annotation and
  // no other's. Nesting the spans properly would need a parser and buys nothing.
  const openers = [...html.matchAll(KATEX_SPAN)].map((m) => m.index)
  spans += openers.length
  for (let i = 0; i < openers.length; i++) {
    const slice = html.slice(openers[i], openers[i + 1] ?? html.length)
    if (!/<annotation encoding="application\/x-tex">/.test(slice)) {
      missingAnnotation.push({ page, excerpt: slice.slice(0, 120) })
    }
  }

  for (const m of html.matchAll(ANNOTATION)) {
    annotations++
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
  `[check-mathml] ${spans} formula(s) across ${pages.length} page(s), ` +
    `${annotations} annotation(s), ${authoredAndServed.length}/${authored.size} authored formula(s) ` +
    `found verbatim in a tag-strip of the export.`,
)

let failed = false

if (missingAnnotation.length > 0) {
  failed = true
  console.error(
    `[check-mathml] ${missingAnnotation.length} formula(s) ship no <annotation encoding="application/x-tex">.\n` +
      `  The LaTeX source is then absent from the served bytes and the formula is announced as\n` +
      `  nothing by a screen reader. Check output: 'htmlAndMathml' in lib/utils/math.ts.`,
  )
  for (const m of missingAnnotation.slice(0, 5)) console.error(`  ${m.page}: ${m.excerpt}…`)
  if (missingAnnotation.length > 5) console.error(`  … and ${missingAnnotation.length - 5} more`)
}

if (notInText.length > 0) {
  failed = true
  console.error(`[check-mathml] ${notInText.length} annotation(s) do not survive a tag-strip of their page:`)
  for (const m of notInText.slice(0, 5)) console.error(`  ${m.page}: ${m.tex}`)
  if (notInText.length > 5) console.error(`  … and ${notInText.length - 5} more`)
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
