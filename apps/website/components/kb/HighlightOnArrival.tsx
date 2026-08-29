'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  HIGHLIGHT_ATTR,
  HIGHLIGHT_PARAM,
  highlightSelector,
  isTargetFqn,
  urlWithHighlight,
} from '@/lib/kb/highlight'
import { prefersReducedMotion } from '@/lib/utils/motion'
import { ArrivalMarks, type ArrivalMark } from './ArrivalMarker'
import { PANEL_ID } from './Panel'

/**
 * The arrival highlight (sub-plan §7.2, D7): follow a "Bejövő hivatkozások" row and
 * the page you land on shows you the places it cites you.
 *
 * A row says "this section references this 5 times". §7.2's objection to dropping the
 * reader at the section heading is that the panel would then have answered a question
 * and withheld the answer — they already know what the section is about; they came for
 * those five places. So on arrival every reference in the page pointing back at what
 * they came from is marked with phase 18's gesture, and the page is scrolled to the
 * first of them rather than to the source's own anchor: on a long section the marks
 * would otherwise animate off-screen and the effect would fire invisibly (D5).
 *
 * ## The three parts of D7, and where each of them is
 *
 *   1. **Every rendered reference carries `data-target-fqn`** —
 *      `components/content/InlineText.tsx`, on all seven of its link branches.
 *   2. **A row appends the parameter at click time** — the click listener below, so
 *      the served HTML keeps clean hrefs and no crawler ever sees the variant. The
 *      row itself only carries `data-highlight-fqn`, which is inert markup.
 *   3. **The arrival validates, applies and scrubs** — the effect below.
 *
 * ## Why the click is intercepted here rather than by the row
 *
 * The row is server-rendered (§2.1 requires it: the rows are the inbound edges of the
 * graph and a crawler has to see them), and the panel it sits in is server-rendered
 * with it. A handler cannot be handed to it from there. So this is the same shape
 * `components/kb/EntityChrome.tsx` uses for the body's reference marks and
 * `components/kb/ArrivalMarker.tsx` for its fourth trigger — one listener on
 * `document`, which decides nothing until something matching is actually pressed.
 *
 * It also keeps the parameter's producer and its consumer in one file: the name, the
 * validation and the shape of the URL are one contract (`lib/kb/highlight.ts`), and a
 * row that appended the parameter itself would be the second place that had to know
 * all three.
 *
 * **In the capture phase**, because the row is a `next/link` and React's own handler
 * would otherwise have already called `router.push` with the clean href by the time a
 * bubbling listener ran. Capture runs first, `preventDefault` there, and next/link's
 * handler then returns without navigating: it checks `defaultPrevented` before doing
 * anything, which is the hook a caller preventing in `onClick` relies on too (read in
 * `next/dist/client/app-dir/link.js` for the installed 15.5.12, and proved by
 * `e2e/kb-highlight.test.ts` — a row arrives at the URL WITH the parameter, so exactly
 * one navigation happened and it was this one).
 *
 * ## Where it mounts
 *
 * In `app/layout.tsx`, outside `.page-root` and after `NewsletterLanding` and
 * `ConsentGate` — with the marker, and for the marker's reason: the frames it draws
 * are `position: fixed`, and `.page-root`'s `transform` would make them position
 * against the document instead of the viewport. Mounted site-wide rather than on the
 * entity chrome because the page that gets highlighted is the SOURCE's page: a
 * chapter, usually, which has no chrome at all.
 */

/**
 * Which part of the arrived-at page the row was talking about.
 *
 * The fragment, when it carries one, and that is not a second parameter: a row's href
 * already names its source — a section row is the section's anchor on its chapter's
 * page, and an entity or chapter row needs no fragment because the page it leads to IS
 * the source. So "where the references are" stays derivable from the URL, which is
 * what D7 asks for.
 *
 * The document when there is no fragment, when the fragment names nothing on this
 * page, or when what it names is not a reference owner at all — a term's anchor, or
 * the newsletter form's section. That keeps one invariant for the filter below: the
 * scope is either a `data-ref-owner` element or the page.
 */
function sourceScope(): Element | Document {
  // Decoded for `ArrivalMarker`'s reason: a copied or pasted URL commonly percent-
  // encodes its fragment, while the `id` it has to match never is.
  const anchor = decodeURIComponent(window.location.hash.slice(1))
  const named = anchor === '' ? null : document.getElementById(anchor)
  return named?.hasAttribute('data-ref-owner') ? named : document
}

/**
 * Every reference the SOURCE makes at `fqn`, as rendered on this page.
 *
 * Three filters, and the middle one is the substance of it.
 *
 * **The scope**, above: a section row's marks are inside that section. Without it,
 * following a row about one section of `alice-bob-es-a-kinaiak` would mark all 108 of
 * that chapter's references to the term and scroll the reader to the first of them,
 * which is in a different section from the one they pressed.
 *
 * **The owner boundary.** A reference belongs to whatever wrote it, and the same
 * boundaries the graph counts by (`refOwners` in `lib/content/graph.ts`) are in the
 * markup as `data-ref-owner`: a chapter's sections (`components/content/SectionView.tsx`)
 * and every embedded entity (`components/content/EmbeddedEntity.tsx`). A match belongs
 * to the source only if the nearest boundary above it IS the scope — so the references
 * an embedded theorem makes are not attributed to the section it sits in, and a
 * chapter row does not claim its sections' references. Both of those have rows of
 * their own in the same list, leading to their own pages; marking them here would be
 * this page answering a question the reader did not press.
 *
 * Measured on §7.2's worked case — section `a-kinai-maradektetel` of
 * `alice-bob-es-a-kinaiak`, whose row reports 5 references to
 * `theorems.egesz-szamok-maradekosztalyai.terms.residue-class-modulo-m`: 108 matches
 * on the page, 22 inside that section, **9 the section itself made**. Nine rather than
 * five because a row's count is over reference ENTRIES while a mark is a rendered
 * link: the section has five entries aiming at that term and writes them 3, 3, 1, 1
 * and 1 times in its narrative. All five are marked; the nine marks are their
 * renderings.
 *
 * **Not the panel.** §2.1 puts every panel's content in the served HTML, so an entity
 * page carries a second, hidden copy of any reference inside a claim or a term panel
 * (`components/kb/panels/ClaimPanel.tsx`). Marking one would draw a rectangle around
 * a thing behind a closed sheet.
 */
function findMarks(fqn: string): ArrivalMark[] {
  const scope = sourceScope()
  // Document order, which is what `querySelectorAll` returns, and what makes
  // "the first of them" below mean the first one the reader would meet.
  const matches = [...scope.querySelectorAll<HTMLElement>(highlightSelector(fqn))]
  return matches
    .filter((element) => {
      if (element.closest(`#${PANEL_ID}`)) return false
      const owner = element.closest('[data-ref-owner]')
      return owner === (scope instanceof Element ? scope : null)
    })
    .map((element) => ({ element, name: fqn }))
}

export default function HighlightOnArrival() {
  const pathname = usePathname()
  const router = useRouter()
  const [marks, setMarks] = useState<readonly ArrivalMark[] | null>(null)

  /** Stable, so handing it to the gesture does not restart the gesture. */
  const finished = useCallback(() => setMarks(null), [])

  /**
   * The producer: a source row, pressed, navigates to its own href plus the parameter.
   *
   * **At click time and nowhere else.** Not at render time, which would put the
   * parameter in the served HTML for a crawler to index (D7); and not on hydration
   * either, which would leave it on the element for the reader to copy out of a
   * context menu. The `href` attribute is never touched, so "copy link address" on a
   * row copies the clean URL.
   *
   * A modified click is left entirely alone — it is the reader asking their browser
   * for a new tab or a download, and D1 accepted that a modified click does something
   * different. It navigates to the clean href and simply arrives without a highlight.
   */
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      if (!(event.target instanceof Element)) return
      const row = event.target.closest(`a[${HIGHLIGHT_ATTR}]`)
      if (!(row instanceof HTMLAnchorElement)) return
      const fqn = row.getAttribute(HIGHLIGHT_ATTR)
      // Validated on the way out as well as on the way in. This value comes from our
      // own markup, so a failure here is a bug rather than an attack — and the
      // response is to let the row navigate as the ordinary link it is, which is the
      // behaviour with no JavaScript at all.
      if (!fqn || !isTargetFqn(fqn)) return
      event.preventDefault()
      router.push(urlWithHighlight(row.getAttribute('href') ?? row.href, fqn, window.location.href))
    }
    // Capture, so this runs before next/link's own handler — see the note above.
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [router])

  /**
   * The consumer: read the parameter, validate it, mark and scroll, scrub.
   *
   * **One frame late**, for `ArrivalMarker`'s reason: on a route change the App Router
   * has both the new URL and the new DOM to settle, and the marks are elements of the
   * page being arrived at. It is NOT a wait for the scroll — waiting for that is the
   * gesture's own job (`SETTLE_FRAMES`).
   *
   * **`pathname` is a dependency, not just a mount**, because the row above navigates
   * with the router: the parameter arrives on a client-side route change as readily as
   * on a cold load, and this component stays mounted across the former. Both are real
   * — a fresh tab or a pasted URL is the cold case D7 chose a query parameter for.
   *
   * **The scrub is unconditional once a parameter was seen**, valid or not: a value
   * this page will not act on is exactly a value that should not be left in the
   * address bar, in a copied link, or in an index (D7).
   */
  useEffect(() => {
    function apply(raw: string) {
      /*
        The security rule, and the only place it can be applied: `raw` came out of a
        URL and is about to become a selector (D7). Strictly `[a-z0-9-]` segments
        joined by dots — anything else is rejected outright rather than escaped, so a
        crafted parameter is ignored rather than acted on. `lib/kb/highlight.ts` owns
        the rule and `test/highlight-param.test.mjs` runs the hostile inputs against
        it.

        The rule is applied to the DECODED value — `URLSearchParams` decodes what it
        hands back — so no escape can smuggle a character past it: `%22` is a quote by
        the time it is tested, and rejected as one.
      */
      if (!isTargetFqn(raw)) return
      const found = findMarks(raw)
      if (found.length === 0) return

      /*
        To the first of them, not to the fragment (§7.2, D5). `center` rather than the
        top: a reference is a few words inside a sentence, and the sentence around it is
        the reason the reader was sent there. It also puts the mark clear of the sticky
        header without depending on `scroll-padding-top`.

        This overrides the browser's own scroll to the fragment the row carried. The
        fragment stays in the URL on purpose — it is where a reader with no JavaScript
        lands — so both scrolls happen, and the last one issued is the one that wins.
      */
      found[0].element.scrollIntoView({
        block: 'center',
        // The site scrolls smoothly (`scroll-behavior` on `:root` in
        // `app/globals.scss`), and this is the one place a script decides that rather
        // than a stylesheet, so it has to ask. Same helper as the gesture's own
        // reduced-motion decision, deliberately: one answer per reader.
        behavior: prefersReducedMotion() ? 'instant' : 'smooth',
      })
      setMarks(found)
    }

    function scrub() {
      /*
        `window.location.search` re-read here rather than reused from above, and only
        this parameter deleted, so that a newsletter or consent parameter arriving in
        the same URL survives. That is the arrangement `app/layout.tsx` records for
        `NewsletterLanding` and `ConsentGate`, and this is the third scrubber joining
        it — do not "optimise" any of the three into caching the search string.

        `null` for the state, as both of them pass: the App Router patches
        `history.replaceState` to copy its own internal state onto the new entry and to
        keep `usePathname` in step, so the entry is not left without a router tree.
        That patch is installed in an effect of the router above this one, which is one
        more reason this runs a frame late.
      */
      const params = new URLSearchParams(window.location.search)
      params.delete(HIGHLIGHT_PARAM)
      const qs = params.toString()
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
      )
    }

    const frame = requestAnimationFrame(() => {
      const raw = new URLSearchParams(window.location.search).get(HIGHLIGHT_PARAM)
      if (raw === null) return
      apply(raw)
      scrub()
    })
    /*
      The marks go with the page they were about. A mark plays when the reader scrolls
      its target into view (`ArrivalMarks`), so an arrival can have marks outstanding
      for as long as the reader stays — and the elements they measure belong to THIS
      page. Leaving the list up across a route change would leave boxes pointing at
      detached nodes. This runs on the navigation away, before the next page's own
      pass, because `pathname` is the dependency.
    */
    return () => {
      cancelAnimationFrame(frame)
      setMarks(null)
    }
  }, [pathname])

  if (!marks) return null
  return <ArrivalMarks marks={marks} onFinished={finished} />
}
