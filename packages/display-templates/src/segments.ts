import type { DisplaySegment } from './types'

/**
 * A resolved single-target display as segments. The span from the first `[` to
 * the last `]` is the link and the brackets come out. The text on either side of
 * it is kept even when empty. A display without such a span is a link as a whole.
 * An empty display has no segments.
 */
export function linkSegments<T>(display: string, target: T): DisplaySegment<T>[] {
  if (display === '') return []
  const open = display.indexOf('[')
  const close = display.lastIndexOf(']')
  if (open === -1 || close < open) return [{ kind: 'link', text: display, target }]
  return [
    { kind: 'text', text: display.slice(0, open) },
    { kind: 'link', text: display.slice(open + 1, close), target },
    { kind: 'text', text: display.slice(close + 1) },
  ]
}

/** Joins neighbouring text segments. */
export function joinSegments<T>(parts: readonly DisplaySegment<T>[]): DisplaySegment<T>[] {
  const out: DisplaySegment<T>[] = []
  for (const part of parts) {
    const prev = out[out.length - 1]
    if (part.kind === 'text' && prev?.kind === 'text') out[out.length - 1] = { kind: 'text', text: prev.text + part.text }
    else out.push(part)
  }
  return out
}

/**
 * The display at the start of a sentence: its first visible character upper-cased,
 * in whichever segment holds it. Empty segments and leading whitespace are skipped,
 * so a display that starts with its link capitalizes the link.
 */
export function capitalizeSegments<S extends { text: string }>(segments: readonly S[]): S[] {
  const out = [...segments]
  for (let i = 0; i < out.length; i++) {
    const { text } = out[i]
    const at = text.search(/\S/)
    if (at === -1) continue
    out[i] = { ...out[i], text: text.slice(0, at) + text.charAt(at).toUpperCase() + text.slice(at + 1) }
    break
  }
  return out
}

/** The words of a display, without link markup. */
export function segmentsText(segments: readonly { text: string }[]): string {
  return segments.map((segment) => segment.text).join('')
}
