/**
 * The token grammar of the inline markup in narrative content, shared by
 * everything that reads it: `InlineText` renders it, `kb-excerpt` flattens it to
 * plain text, and the loader checks the reference tokens in it. One pattern, so
 * the three can't disagree about where a token starts.
 *
 * The alternation order is load-bearing: a `[0]` inside `$[0]_3$` is part of the
 * formula and not a reference, which is what matching math first gives.
 *
 * `legacy-ref` is the `[key]` token of the old keyed `references` dictionary. It
 * matches what that token matched, so text that read as a reference before still
 * reads as one and the loader can reject it instead of rendering it as prose.
 */
export type InlineToken =
  | { kind: 'bold-italic'; inner: string }
  | { kind: 'bold'; inner: string }
  | { kind: 'math'; source: string }
  | { kind: 'ref'; index: number }
  | { kind: 'legacy-ref'; key: string }
  | { kind: 'sup'; inner: string }
  | { kind: 'term'; key: string }
  | { kind: 'self-ref' }

export interface InlineMatch {
  token: InlineToken
  /** Offset of the token in the text it was read from. */
  start: number
  /** The token as written. */
  source: string
}

// No `s` flag: [\s\S]*? matches across newlines.
const INLINE_TOKEN_RE =
  /(\*\*\*)([\s\S]*?)\*\*\*|(\*\*)([\s\S]*?)\*\*|\$([^$]+)\$|\[(\d+)\]|\[([a-zA-Z][a-zA-Z0-9-]*)\]|\^([^^]+)\^|\[\[([a-zA-Z][a-zA-Z0-9-]*)\]\]|(\[\*\])/g

function tokenOf(match: RegExpExecArray): InlineToken {
  const [, , boldItalic, , bold, math, refIndex, legacyKey, sup, termKey] = match
  if (boldItalic !== undefined) return { kind: 'bold-italic', inner: boldItalic }
  if (bold !== undefined) return { kind: 'bold', inner: bold }
  if (math !== undefined) return { kind: 'math', source: math }
  if (refIndex !== undefined) return { kind: 'ref', index: Number(refIndex) }
  if (legacyKey !== undefined) return { kind: 'legacy-ref', key: legacyKey }
  if (sup !== undefined) return { kind: 'sup', inner: sup }
  if (termKey !== undefined) return { kind: 'term', key: termKey }
  return { kind: 'self-ref' }
}

/** The tokens of `text` in order. The text between them is plain. */
export function* inlineTokens(text: string): Generator<InlineMatch> {
  const re = new RegExp(INLINE_TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    yield { token: tokenOf(match), start: match.index, source: match[0] }
  }
}

/**
 * The reference tokens `InlineText` renders from `text`, in reading order: the
 * top level and inside bold, the only markup it parses for references.
 */
export function* referenceTokens(text: string): Generator<Extract<InlineToken, { kind: 'ref' | 'legacy-ref' }>> {
  for (const { token } of inlineTokens(text)) {
    if (token.kind === 'ref' || token.kind === 'legacy-ref') yield token
    else if (token.kind === 'bold-italic' || token.kind === 'bold') yield* referenceTokens(token.inner)
  }
}
