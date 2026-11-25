import { segmentsText } from '@youproof.org/display-templates'
import type { ContentBlock, KbNode, RefList, TermMap } from './types'
import { inlineTokens, type InlineToken } from './inline-tokens'

// The meta-description of a knowledge-base entity page: the opening prose of its
// body, as plain text, truncated.
//
// Why derived rather than authored: there are 537 entity pages on a local build and
// 389 on a deployed one, and one `defaultDescription` shared across all of them is a
// duplicate-description finding waiting to happen. No knowledge-base node carries an
// authored `excerpt` — only books, chapters and standalone items do (see types.ts) —
// and authoring several hundred is the same cost the content migration declined for
// titles.
//
// This is NOT a reading surface: it never reaches the page body, only
// `<meta name="description">` and the OpenGraph description. That is what makes
// dropping the mathematics acceptable here (see `plainInline`) — a description is one
// line of prose in a search result, where a formula cannot be rendered at all.

/** Roughly what a search engine shows before it truncates for us. */
const MAX_LENGTH = 160

/** The description of `node`'s page, or undefined if its body carries no prose. */
export function kbExcerpt(node: KbNode): string | undefined {
  const text = firstProse(node.body, node.references, node.terms)
  return text ? truncate(text, MAX_LENGTH) : undefined
}

/**
 * The first prose in a body, in reading order.
 *
 * Not simply the first narrative block: 59 of the 537 nodes have no narrative
 * block anywhere (measured), because a definition or a theorem is often a formula
 * introduced by its lead-in and nothing else. Every one of those 59 does have a
 * lead-in, so taking the first prose of any block covers the whole set — and it is
 * the same sentence a reader meets first either way.
 *
 * A formula's `content`, a list's items and a figure's `src` are deliberately not
 * candidates: they are the mathematics and the assets, not prose about them.
 */
function firstProse(
  blocks: ContentBlock[],
  refs: RefList | undefined,
  terms: TermMap | undefined,
): string | undefined {
  for (const block of blocks) {
    // The LaTeX-only blocks of a body are not what a web page describes.
    if (block.context === 'latex') continue
    const candidates: (string | undefined)[] =
      block.type === 'narrative' ? [block.content]
      : block.type === 'claim' ? [block.content]
      : block.type === 'quote' ? [block.leadIn, block.quote]
      : block.type === 'formula' ? [block.leadIn, block.leadOut]
      : block.type === 'figure' ? [block.leadIn, block.caption]
      : block.type === 'unordered-list' || block.type === 'ordered-list' ? [block.leadIn]
      : block.type === 'typewriter' ? [block.leadIn]
      // A subsection or a details block is a wrapper: its prose is inside it.
      : block.type === 'subsection' || block.type === 'details'
        ? [firstProse(block.blocks, refs, terms)]
        : []
    for (const candidate of candidates) {
      const text = candidate && plainInline(candidate, refs, terms)
      if (text) return text
    }
  }
  return undefined
}

/**
 * The inline markup of `InlineText`, resolved to plain text.
 *
 * Both read the token grammar of `inline-tokens.ts`, so the two cannot disagree
 * about where a token starts.
 *
 * Two decisions specific to a description:
 *
 * - A `[i]` reference and a `[[term]]` become the words they display, so the sentence
 *   stays a sentence. A term's display form may itself mark which part is the
 *   link text (`a [gyűrű] definíciója`), and a ref's resolved segments are joined
 *   without their link markup; any bracket left is markup too and comes out.
 * - `$math$` survives only while it reads as text — a bare symbol like `R` or
 *   `a*b`. Anything with a backslash or a brace is a TeX command that would reach
 *   the search result as `\Z` or `\frac{m}{d}`, so it is dropped instead. The
 *   sentence loses a symbol; it does not gain visible source code.
 */
function plainInline(text: string, refs: RefList | undefined, terms: TermMap | undefined): string {
  const plain = tokens(normalise(text), refs, terms)
  // Authored line breaks and the gaps left by a dropped formula collapse: a
  // description is one line.
  return plain.replace(/\s+/g, ' ').trim()
}

/** The HTML entities the authored text carries, as `InlineText.normalise` reads them. */
function normalise(text: string): string {
  return text
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2663;/g, '♣')
}

function tokens(text: string, refs: RefList | undefined, terms: TermMap | undefined): string {
  let out = ''
  let last = 0
  for (const { token, start, source } of inlineTokens(text)) {
    out += text.slice(last, start) + tokenText(token, source, refs, terms)
    last = start + source.length
  }
  return out + text.slice(last)
}

function tokenText(
  token: InlineToken,
  source: string,
  refs: RefList | undefined,
  terms: TermMap | undefined,
): string {
  switch (token.kind) {
    // Emphasis is emphasis: the markers go, and the words inside are still markup.
    case 'bold-italic':
    case 'bold':
    case 'sup':
      return tokens(token.inner, refs, terms)
    case 'math':
      return /[\\{}]/.test(token.source) ? '' : token.source
    case 'ref': {
      const ref = refs?.[token.index]
      return (ref && display(segmentsText(ref.segments), refs, terms)) ?? source
    }
    case 'legacy-ref':
      return source
    case 'term':
      return display(terms?.[token.key]?.display, refs, terms) ?? source
    // A figure's self-reference resolves against the figure, which a description
    // does not show; the words around it carry the sentence.
    case 'self-ref':
      return ''
  }
}

/**
 * A ref or term display form as plain text.
 *
 * A display form is itself inline markup — `InlineText` parses bold and math
 * inside one, which is where a phrase like `modulo $m$ maradékok` comes from — so
 * it goes through the same pass. Its brackets come out first: there they mark
 * which part of the phrase is the link, not a nested reference.
 */
function display(
  value: string | undefined,
  refs: RefList | undefined,
  terms: TermMap | undefined,
): string | undefined {
  return value === undefined ? undefined : tokens(value.replace(/[[\]]/g, ''), refs, terms)
}

/**
 * Truncate at a word boundary, with an ellipsis.
 *
 * The boundary is a space, not a sentence end: the opening sentence of a theorem
 * runs well past the limit often enough that cutting at the previous full stop
 * would leave many pages with an empty description.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[,;:–-]$/, '').trim()}…`
}
