import React from 'react'
import { capitalizeSegments, linkSegments, segmentsText, type DisplaySegment } from '@youproof.org/display-templates'
import { mathSource } from '@/lib/utils/math'
import { termAnchorId } from '@/lib/content/urls'
import { inlineTokens } from '@/lib/content/inline-tokens'
import type { RefList, RefLinkSegment, RefTarget, TermMap, AnchorParent } from '@/lib/content/types'

interface InlineTextProps {
  text: string
  refs?: RefList
  terms?: TermMap
  termParent?: AnchorParent
  selfRefDisplay?: string
}

/**
 * Parses and renders the custom inline markup used in narrative content:
 *   ***text***  → bold italic
 *   **text**    → bold
 *   $...$       → KaTeX inline math
 *   [i]         → the i-th reference (resolved via refs)
 *   [*]         → self-reference (resolved via selfRefDisplay)
 *   &ndash;     → –
 *   ^text^      → superscript
 *
 * Bold and bold-italic content is parsed recursively, so math and other
 * inline markup inside them is rendered correctly.
 */
export default function InlineText({ text, refs, terms, termParent, selfRefDisplay }: InlineTextProps) {
  const nodes = parseInline(text, refs, terms, termParent, selfRefDisplay)
  return <>{nodes}</>
}

type KeyCounter = { n: number }

function normalise(text: string): string {
  return text
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2663;/g, '♣')
}

// Group indices: 1-2 bold-italic, 3-4 bold
const BOLD_ITALIC_RE = /(\*\*\*)([\s\S]*?)\*\*\*|(\*\*)([\s\S]*?)\*\*/g

function parseBoldItalic(text: string, counter: KeyCounter): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  const re = new RegExp(BOLD_ITALIC_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(...renderChunkWithMath(text.slice(lastIndex, match.index), counter))
    if (match[2] !== undefined) {
      nodes.push(<strong key={counter.n++}><em>{renderChunkWithMath(match[2], counter)}</em></strong>)
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={counter.n++}>{renderChunkWithMath(match[4], counter)}</strong>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) nodes.push(...renderChunkWithMath(text.slice(lastIndex), counter))
  return nodes
}

/**
 * A resolved display: its text segments as inline markup, its link segments as
 * whatever `renderLink` makes of them.
 */
function renderSegments<S extends DisplaySegment<unknown>>(
  segments: readonly S[],
  counter: KeyCounter,
  renderLink: (segment: Extract<S, { kind: 'link' }>, linkText: React.ReactNode[]) => React.ReactElement,
): React.ReactNode {
  const children = segments.map((segment) =>
    segment.kind === 'link'
      ? renderLink(segment as Extract<S, { kind: 'link' }>, parseBoldItalic(segment.text, counter))
      : parseBoldItalic(segment.text, counter),
  )
  return React.createElement(React.Fragment, { key: counter.n++ }, ...children)
}

const CONCEPT_TARGETS: ReadonlySet<RefTarget['type']> = new Set([
  'claim', 'term', 'definition', 'theorem', 'proof', 'remark',
])

const LINKED_TARGETS: ReadonlySet<RefTarget['type']> = new Set([
  ...CONCEPT_TARGETS, 'external', 'book', 'chapter', 'section', 'article', 'newsletter', 'page', 'landing',
])

/*
  What a link points at, in the one form that addresses everything in the content
  model (sub-plan D7). It is written onto every internal link as `data-target-fqn`,
  because a page arrived at from a "Bejövő hivatkozások" row has to be able to find
  the references pointing back at where the reader came from, and the fully
  qualified name is what the row names them by (see `lib/kb/highlight.ts`). Each
  link segment carries its own target, so a reference with several links marks
  each one with its own.

  An external target has no fully qualified name and gets no attribute: it
  addresses something outside the content model, so there is nothing for a
  reference list to point back at.

  Every href is resolved at graph-build time (book and standalone pages via their
  url helpers, never a hardcoded absolute URL; claims via resolveRefHrefs, which
  throws rather than leaving one unset).
*/
function renderRefLink(segment: RefLinkSegment, linkText: React.ReactNode[]): React.ReactElement {
  const { target } = segment
  if (target.type === 'external') {
    return <a href={target.url} target="_blank" rel="noopener noreferrer" className="ref-link">{linkText}</a>
  }
  const className = CONCEPT_TARGETS.has(target.type) ? 'ref-concept' : 'ref-link'
  return <a href={segment.href ?? '#'} target="_blank" data-target-fqn={target.fqn} className={className}>{linkText}</a>
}

function atSentenceStart(text: string, index: number): boolean {
  const textBefore = text.slice(0, index).trimEnd()
  return textBefore.length === 0 || /[.!?]$/.test(textBefore)
}

function parseInline(
  text: string,
  refs?: RefList,
  terms?: TermMap,
  termParent?: AnchorParent,
  selfRefDisplay?: string,
): React.ReactNode[] {
  return parseNormalized(normalise(text), refs, terms, termParent, { n: 0 }, selfRefDisplay)
}

function renderChunkWithMath(text: string, counter: KeyCounter): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const mathRe = /\$([^$]+)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = mathRe.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <span key={counter.n++} dangerouslySetInnerHTML={{ __html: mathSource(m[1], false) }} className="inline-math" />
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

function formatTermDisplay(display: string, counter: KeyCounter): React.ReactNode {
  // If display contains [segment] parts, only those segments are bold-italic
  const segRe = /\[([^\]]+)\]/g
  if (!segRe.test(display)) {
    return <strong key={counter.n++}><em>{renderChunkWithMath(display, counter)}</em></strong>
  }
  // Reset after test
  segRe.lastIndex = 0
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = segRe.exec(display)) !== null) {
    if (m.index > last) parts.push(...renderChunkWithMath(display.slice(last, m.index), counter))
    parts.push(<strong key={counter.n++}><em>{renderChunkWithMath(m[1], counter)}</em></strong>)
    last = m.index + m[0].length
  }
  if (last < display.length) parts.push(...renderChunkWithMath(display.slice(last), counter))
  return <>{parts}</>
}

function parseNormalized(
  text: string,
  refs: RefList | undefined,
  terms: TermMap | undefined,
  termParent: AnchorParent | undefined,
  counter: KeyCounter,
  selfRefDisplay?: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  for (const { token, start, source } of inlineTokens(text)) {
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }

    switch (token.kind) {
      case 'bold-italic': {
        const inner = parseNormalized(token.inner, refs, terms, termParent, counter, selfRefDisplay)
        nodes.push(<strong key={counter.n++}><em>{inner}</em></strong>)
        break
      }
      case 'bold': {
        const inner = parseNormalized(token.inner, refs, terms, termParent, counter, selfRefDisplay)
        nodes.push(<strong key={counter.n++}>{inner}</strong>)
        break
      }
      case 'math':
        nodes.push(
          <span
            key={counter.n++}
            dangerouslySetInnerHTML={{ __html: mathSource(token.source, false) }}
            className="inline-math"
          />
        )
        break
      case 'ref': {
        const ref = refs?.[token.index]
        if (!ref || ref.segments.length === 0) {
          // A missing reference, or a display that resolves to nothing
          nodes.push(<span key={counter.n++} className="ref-error">{source}</span>)
        } else if (ref.segments.every((segment) => segment.kind === 'text' || LINKED_TARGETS.has(segment.target.type))) {
          const segments = atSentenceStart(text, start) ? capitalizeSegments(ref.segments) : ref.segments
          nodes.push(renderSegments(segments, counter, renderRefLink))
        } else {
          // A target type that renders no link
          nodes.push(<span key={counter.n++} className="ref-error">[{segmentsText(ref.segments)}]</span>)
        }
        break
      }
      case 'legacy-ref':
        // A reference by name, which the loader rejects
        nodes.push(<span key={counter.n++} className="ref-error">{source}</span>)
        break
      case 'sup':
        nodes.push(<sup key={counter.n++}>{token.inner}</sup>)
        break
      case 'term': {
        const term = terms?.[token.key]
        if (term && termParent) {
          const id = termAnchorId(termParent, token.key, term)
          nodes.push(
            <span key={counter.n++} id={id} className="term">
              {formatTermDisplay(term.display, counter)}
            </span>
          )
        } else {
          nodes.push(source)
        }
        break
      }
      case 'self-ref':
        if (selfRefDisplay) {
          const segments = linkSegments(selfRefDisplay, undefined)
          nodes.push(renderSegments(
            atSentenceStart(text, start) ? capitalizeSegments(segments) : segments,
            counter,
            (_, linkText) => <strong>{linkText}</strong>,
          ))
        } else {
          // Fallback for self-reference when display template is missing or invalid
          nodes.push(<span key={counter.n++} className="ref-error">[*]</span>)
        }
        break
    }

    lastIndex = start + source.length
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}
