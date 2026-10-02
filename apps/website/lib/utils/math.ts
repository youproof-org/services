import katex, { type KatexOptions } from 'katex'

export const TEX_SOURCE_CLASS = 'tex-src'

const options = (display: boolean, throwOnError: boolean): KatexOptions => ({
  displayMode: display,
  throwOnError,
  strict: false,
})

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A formula as its authored LaTeX, which `MathEnhancer` typesets in the browser.
 * Crawlers that run no script read the source as text, which is the one form a
 * text extractor recovers a formula in: KaTeX's glyph run strips `a^{p-1}` to
 * `a p − 1`, which reads equally as a·p−1.
 *
 * The formula is still parsed here, so LaTeX that KaTeX rejects ships as KaTeX's
 * own `katex-error` span, as it did when the server typeset everything, and the
 * smoke crawler keeps finding it in the served HTML.
 */
export function mathSource(tex: string, display = false): string {
  const source = tex.trim()
  try {
    katex.renderToString(source, { ...options(display, true), output: 'mathml' })
  } catch {
    return katex.renderToString(source, options(display, false))
  }
  const displayAttr = display ? ' data-display' : ''
  return `<span class="${TEX_SOURCE_CLASS}"${displayAttr}>${escapeHtml(source)}</span>`
}

export function typeset(tex: string, display: boolean): string {
  return katex.renderToString(tex, options(display, false))
}
