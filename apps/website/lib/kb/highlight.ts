/**
 * The arrival highlight's transport: the query parameter, and the one rule that
 * decides whether a value read out of a URL is allowed anywhere near the DOM
 * (sub-plan §7.2, D7).
 *
 * A "Bejövő hivatkozások" row leads to a source, and on arrival every reference in
 * that source pointing back at what the reader came from is marked. What is pointed
 * at travels as a fully qualified name in a query parameter, because arrival can be
 * a cold load in a fresh tab — that is D7's reasoning, and it is why nothing here
 * may assume the value was produced by this site. It may equally have been typed.
 *
 * ## Why this is a module of its own rather than part of the component
 *
 * Two reasons, and the second is the load-bearing one:
 *
 *   - The parameter has a producer (the click that appends it) and a consumer (the
 *     page it lands on). Both live in `components/kb/HighlightOnArrival.tsx` today,
 *     but the name of the parameter and the shape of the value are a contract rather
 *     than an implementation detail of either half.
 *   - **The validation is a security rule and has to be testable as one.** D7 makes
 *     it the one place a URL value reaches a selector, so `test/highlight-param.test.mjs`
 *     runs hostile inputs against it directly. `pnpm test` is plain Node with tsx: it
 *     cannot import a client component (React, a `.scss` import), so a rule that only
 *     existed inside the component could not be tested at all.
 */

/**
 * The query parameter's name.
 *
 * Namespaced like the two families already in the URL vocabulary
 * (`newsletter_ask`, `ga_debug` — see `components/newsletter/NewsletterLanding.tsx`
 * and `components/consent/ConsentGate.tsx`), so it is recognisably one of ours and
 * cannot collide with theirs when two arrive together.
 */
export const HIGHLIGHT_PARAM = 'kb_highlight'

/**
 * What a rendered reference says it points at, on every reference in the built HTML
 * (`components/content/InlineText.tsx`). This is the attribute the arrival matches
 * against, and the reason the FQN was chosen as the transported value: it is already
 * the canonical target string and the graph's map key, so nothing has to be computed
 * at render time (D7).
 */
export const TARGET_ATTR = 'data-target-fqn'

/**
 * What a source row says should be highlighted once it has been followed
 * (`components/kb/panels/BacklinksPanel.tsx`).
 *
 * A second attribute rather than a reuse of `TARGET_ATTR`: a row's own link target
 * is the source's page, and what it wants highlighted there is something else
 * entirely — the entity, term or claim whose list the row is a member of.
 */
export const HIGHLIGHT_ATTR = 'data-highlight-fqn'

/**
 * The character rule, from the identifiers sub-plan by way of D7: a fully qualified
 * name is `[a-z0-9-]` segments joined by dots. Nothing else, ever.
 *
 * Deliberately narrower than `parseFqn` (`lib/content/fqn.ts`), which is the
 * authoring-time grammar and throws with a message naming what an author got wrong.
 * This is the arrival-time gate on an untrusted string, and its only answer is yes
 * or no: no uppercase, no percent-encoding (the caller decodes first, so an escape
 * that survives here is a character that is not allowed), no whitespace, no empty
 * segment, no leading or trailing dot.
 */
const TARGET_FQN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/

/**
 * And a length cap, so an absurd value is rejected before it is looked at rather
 * than being searched for and not found.
 *
 * The longest fully qualified name the local export actually contains is 155
 * characters — `theorems.peano-nullosszeg-tagjai.proofs.….remarks.….terms.reductio-ad-absurdum`,
 * measured with `grep -rho 'data-target-fqn="[^"]*"' out` — so this is more than
 * three times the deepest name authored: a bound on the absurd rather than a limit
 * anyone writing content will meet.
 */
const MAX_LENGTH = 512

/**
 * Is this string a fully qualified name this site would have produced?
 *
 * The gate on the whole feature, in both directions: an arrival that answers false
 * does nothing at all, and a click that would produce a false value navigates as an
 * ordinary link instead of appending anything.
 */
export function isTargetFqn(value: string): boolean {
  return value.length <= MAX_LENGTH && TARGET_FQN.test(value)
}

/**
 * The selector that finds every reference pointing at `fqn` — or at something
 * inside it.
 *
 * **It throws rather than escaping.** D7 asks for the value to be rejected, not
 * made safe, and a builder that quietly escaped would let a caller skip the check
 * above and still get a selector. Every caller checks first; this is the guard that
 * makes forgetting to a crash rather than an injection.
 *
 * **Two clauses, because "pointing back at the origin" includes pointing inside
 * it.** The unfiltered Bejövő hivatkozások list is the entity's, and §7.2's "all
 * incoming means all" puts references aimed at the entity's claims and terms in it
 * — those carry `{entity}.terms.{t}`, not `{entity}`. The trailing dot is what keeps
 * the prefix clause on a segment boundary, so `definitions.gyuru` cannot match
 * `definitions.gyuru-test`.
 */
export function highlightSelector(fqn: string): string {
  if (!isTargetFqn(fqn)) {
    throw new Error(`highlightSelector: '${fqn}' is not a fully qualified name.`)
  }
  return `[${TARGET_ATTR}="${fqn}"], [${TARGET_ATTR}^="${fqn}."]`
}

/**
 * The URL a source row leads to once it has been pressed: its own href, plus the
 * parameter.
 *
 * `base` is only there to resolve the relative href — the row's `href` is a
 * site-absolute path (`lib/content/urls.ts` builds every one of them) — and the
 * result comes back absolute, which `router.push` takes as readily as a path.
 *
 * The fragment is left exactly as the row wrote it. A parameter is what D7 chose
 * partly for that reason: the fragment is already spent on the source's own anchor,
 * and a reader whose JavaScript never runs still lands on the section rather than at
 * the top of the chapter.
 */
export function urlWithHighlight(href: string, fqn: string, base: string): string {
  const url = new URL(href, base)
  url.searchParams.set(HIGHLIGHT_PARAM, fqn)
  return url.toString()
}
