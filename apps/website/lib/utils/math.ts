import katex from 'katex'

export function renderKatex(tex: string, display = false): string {
  return katex.renderToString(tex.trim(), {
    displayMode: display,
    throwOnError: false,
    output: 'html',
    strict: false,
  })
}
