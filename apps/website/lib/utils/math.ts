import katex from 'katex'

/**
 * `htmlAndMathml`, not `html`: with `html` the only text-bearing span KaTeX emits
 * carries `aria-hidden="true"`, so every formula on the site is announced as
 * nothing by a screen reader. The MathML subtree is what a screen reader reads,
 * and it is visually clipped by `.katex-mathml` in `katex.min.css`, so the page
 * looks the same.
 *
 * It also puts the authored LaTeX into the markup as a text node, inside
 * `<annotation encoding="application/x-tex">`, which is the only path by which a
 * text extractor recovers a formula rather than a flattened glyph run — `a^{p-1}`
 * otherwise strips to `a p − 1`, which reads equally as a·p−1.
 *
 * `scripts/check-mathml.mjs` gates both properties over the export.
 */
export function renderKatex(tex: string, display = false): string {
  return katex.renderToString(tex.trim(), {
    displayMode: display,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: false,
  })
}
