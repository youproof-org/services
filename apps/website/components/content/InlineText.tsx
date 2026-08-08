import React from 'react'
import { renderKatex } from '@/lib/utils/math'
import { claimId } from '@/lib/utils/claim-id'
import { termId } from '@/lib/utils/term-id'
import type { RefMap, TermMap } from '@/lib/content/types'

interface InlineTextProps {
  text: string
  refs?: RefMap
  terms?: TermMap
  termParent?: { type: string; namespace: string; name: string }
  selfRefDisplay?: string
}

/**
 * Parses and renders the custom inline markup used in narrative content:
 *   ***text***  → bold italic
 *   **text**    → bold
 *   $...$       → KaTeX inline math
 *   [slug]      → reference label (resolved via refs)
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

// Note: no `s` flag — use [\s\S]*? to match across newlines (compatible with es2017-)
// Group indices: 1-2 bold-italic, 3-4 bold, 5 math, 6 ref-slug, 7 sup, 8 term-key, 9 self-ref
const TOKEN_RE =
  /(\*\*\*)([\s\S]*?)\*\*\*|(\*\*)([\s\S]*?)\*\*|\$([^$]+)\$|\[([a-zA-Z][a-zA-Z0-9-]*)\]|\^([^^]+)\^|\[\[([a-zA-Z][a-zA-Z0-9-]*)\]\]|(\[\*\])/g

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

function formatSegmentedDisplay(
  display: string,
  counter: KeyCounter,
  renderLink: (linkText: React.ReactNode[]) => React.ReactElement,
): React.ReactNode {
  const open = display.indexOf('[')
  const close = display.lastIndexOf(']')
  if (open !== -1 && close > open) {
    const before = display.slice(0, open)
    const linkText = display.slice(open + 1, close)
    const after = display.slice(close + 1)
    return (
      <React.Fragment key={counter.n++}>
        {parseBoldItalic(before, counter)}
        {renderLink(parseBoldItalic(linkText, counter))}
        {parseBoldItalic(after, counter)}
      </React.Fragment>
    )
  }
  return <React.Fragment key={counter.n++}>{renderLink(parseBoldItalic(display, counter))}</React.Fragment>
}

function parseInline(
  text: string,
  refs?: RefMap,
  terms?: TermMap,
  termParent?: { type: string; namespace: string; name: string },
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
      <span key={counter.n++} dangerouslySetInnerHTML={{ __html: renderKatex(m[1], false) }} className="inline-math" />
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
  refs: RefMap | undefined,
  terms: TermMap | undefined,
  termParent: { type: string; namespace: string; name: string } | undefined,
  counter: KeyCounter,
  selfRefDisplay?: string,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0

  // Create a fresh regex instance per call to avoid lastIndex conflicts when recursing
  const re = new RegExp(TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(text)) !== null) {
    const [fullMatch, , biContent, , bContent, mathContent, refSlug, supContent, termKey, selfRefToken] = match

    // Emit plain text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (biContent !== undefined) {
      const inner = parseNormalized(biContent, refs, terms, termParent, counter, selfRefDisplay)
      nodes.push(<strong key={counter.n++}><em>{inner}</em></strong>)
    } else if (bContent !== undefined) {
      const inner = parseNormalized(bContent, refs, terms, termParent, counter, selfRefDisplay)
      nodes.push(<strong key={counter.n++}>{inner}</strong>)
    } else if (mathContent !== undefined) {
      const html = renderKatex(mathContent, false)
      nodes.push(
        <span
          key={counter.n++}
          dangerouslySetInnerHTML={{ __html: html }}
          className="inline-math"
        />
      )
    } else if (refSlug !== undefined) {
      const ref = refs?.[refSlug]
      if (ref && ref.display) {
        const textBefore = text.slice(0, match.index).trimEnd()
        const sentenceStart = textBefore.length === 0 || /[.!?]$/.test(textBefore)
        const display = sentenceStart
          ? ref.display.charAt(0).toUpperCase() + ref.display.slice(1)
          : ref.display
        if (ref.target.type === 'external') {
          const url = ref.target.url
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={url} target="_blank" rel="noopener noreferrer" className="ref-link">{text}</a>
          ))
        } else if (ref.target.type === 'book') {
          // href (the book's localized index page) is resolved at graph-build
          // time via urlForBook — never a hardcoded absolute URL.
          const href = ref.href ?? '#'
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-link">{text}</a>
          ))
        } else if (ref.target.type === 'chapter') {
          // href is resolved at graph-build time via buildLocalizedUrl.
          const href = ref.href ?? '#'
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-link">{text}</a>
          ))
        } else if (ref.target.type === 'section') {
          // href (localized chapter URL + section-slug anchor) is resolved at
          // graph-build time via buildLocalizedUrl.
          const href = ref.href ?? '#'
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-link">{text}</a>
          ))
        } else if (
          ref.target.type === 'article'  || ref.target.type === 'newsletter' ||
          ref.target.type === 'page'     || ref.target.type === 'landing'
        ) {
          // Standalone item (e.g. one legal page linking to another). href is the
          // locale-prefixed site path, resolved at graph-build time via
          // urlForStandalone — never a hardcoded absolute URL.
          const href = ref.href ?? '#'
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-link">{text}</a>
          ))
        } else if (ref.target.type === 'claim') {
          const href = ref.href ?? `#${claimId(ref.target.name, ref.target.parent)}`
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-concept">{text}</a>
          ))
        } else if (ref.target.type === 'term') {
          const href = ref.href ?? '#'
          nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <a href={href} target="_blank" className="ref-concept">{text}</a>
          ))
        } else if (
          ref.target.type === 'definition' || ref.target.type === 'theorem' ||
          ref.target.type === 'proof'       || ref.target.type === 'remark'
        ) {
          if (display) {
            const href = ref.href ?? '#'
            nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
              <a href={href} target="_blank" className="ref-concept">{text}</a>
            ))
          } else {
            // Fallback if display template is missing or invalid
            nodes.push(<span key={counter.n++} className="ref-error">[{ref.target.name}]</span>)
          }
        } else {
          // Fallback for unrecognised target types
          nodes.push(
            <span key={counter.n++} className="ref-error">
              [{ref.display}]
            </span>
          )
        }
      } else {
        // Fallback for missing reference
        nodes.push(
          <span key={counter.n++} className="ref-error">
            [{refSlug}]
          </span>
        )
      }
    } else if (supContent !== undefined) {
      nodes.push(<sup key={counter.n++}>{supContent}</sup>)
    } else if (termKey !== undefined) {
      const term = terms?.[termKey]
      if (term && termParent) {
        const id = termId(termKey, termParent)
        nodes.push(
          <span key={counter.n++} id={id} className="term">
            {formatTermDisplay(term.display, counter)}
          </span>
        )
      } else {
        nodes.push(`[[${termKey}]]`)
      }
    } else if (selfRefToken !== undefined) {
      if (selfRefDisplay) {
        const textBefore = text.slice(0, match.index).trimEnd()
        const sentenceStart = textBefore.length === 0 || /[.!?]$/.test(textBefore)
        const display = sentenceStart
          ? selfRefDisplay.charAt(0).toUpperCase() + selfRefDisplay.slice(1)
          : selfRefDisplay
        nodes.push(formatSegmentedDisplay(display, counter, (text: React.ReactNode[]) =>
            <strong>{text}</strong>
        ))
      } else {
        // Fallback for self-reference when display template is missing or invalid
        nodes.push(<span key={counter.n++} className="ref-error">[*]</span>)
      }
    }

    lastIndex = match.index + fullMatch.length
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}
