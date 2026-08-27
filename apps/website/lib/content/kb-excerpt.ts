import type { ContentBlock, KbNode, RefMap, TermMap } from './types'

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
  refs: RefMap | undefined,
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
 * The token grammar of `InlineText`, in that component's own alternation order:
 * bold-italic, bold, math, ref, superscript, term, self-reference. The order is
 * load-bearing rather than cosmetic — a `[a]` inside `$[a]_n$` must be read as part
 * of the formula and not as a reference, which is exactly what matching the math
 * alternative first gives — so it is copied rather than re-derived.
 */
const TOKEN_RE =
  /(\*\*\*)([\s\S]*?)\*\*\*|(\*\*)([\s\S]*?)\*\*|\$([^$]+)\$|\[([a-zA-Z][a-zA-Z0-9-]*)\]|\^([^^]+)\^|\[\[([a-zA-Z][a-zA-Z0-9-]*)\]\]|(\[\*\])/g

/**
 * The inline markup of `InlineText`, resolved to plain text.
 *
 * That component is the only other place this markup is interpreted, so a token
 * added there has to be added here too — and this reads the same single pass over
 * the same alternation, so the two cannot disagree about where a token starts.
 *
 * Two decisions specific to a description:
 *
 * - A `[ref]` and a `[[term]]` become the words they display, so the sentence
 *   stays a sentence. A display form may itself mark which part is the link text
 *   (`a [gyűrű] definíciója`, see `formatSegmentedDisplay`); those brackets are
 *   markup and come out.
 * - `$math$` survives only while it reads as text — a bare symbol like `R` or
 *   `a*b`. Anything with a backslash or a brace is a TeX command that would reach
 *   the search result as `\Z` or `\frac{m}{d}`, so it is dropped instead. The
 *   sentence loses a symbol; it does not gain visible source code.
 */
function plainInline(text: string, refs: RefMap | undefined, terms: TermMap | undefined): string {
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

function tokens(text: string, refs: RefMap | undefined, terms: TermMap | undefined): string {
  type Group = string | undefined
  return text.replace(TOKEN_RE, (
    whole: string,
    _boldItalicMarker: Group, boldItalic: Group,
    _boldMarker: Group, bold: Group,
    math: Group, refSlug: Group, sup: Group, termKey: Group, selfRef: Group,
  ) => {
    // Emphasis is emphasis: the markers go, and the words inside are still markup.
    if (boldItalic !== undefined) return tokens(boldItalic, refs, terms)
    if (bold !== undefined) return tokens(bold, refs, terms)
    if (math !== undefined) return /[\\{}]/.test(math) ? '' : math
    if (refSlug !== undefined) return display(refs?.[refSlug]?.display, refs, terms) ?? whole
    if (sup !== undefined) return tokens(sup, refs, terms)
    if (termKey !== undefined) return display(terms?.[termKey]?.display, refs, terms) ?? whole
    // A figure's self-reference resolves against the figure, which a description
    // does not show; the words around it carry the sentence.
    if (selfRef !== undefined) return ''
    return whole
  })
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
  refs: RefMap | undefined,
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
