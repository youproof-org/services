/**
 * The one place a script asks whether the reader wants motion.
 *
 * A stylesheet asks with `@media (prefers-reduced-motion: reduce)` — three of them
 * already do (`app/root-page.module.scss`, `components/kb/panel.module.scss`,
 * `components/consent/consent-banner.module.scss`). A frame-driven movement cannot:
 * `components/kb/Panel.tsx`'s selection scroll and `components/kb/ArrivalMarker.tsx`'s
 * shrink both compute positions in JavaScript, so both have to read the query
 * themselves. This was `EntityChrome`'s private helper until the marker needed the
 * same answer; it is here rather than duplicated so the two cannot come to disagree
 * about what the reader asked for.
 *
 * Browser-only, and deliberately not guarded: every caller is inside an effect.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
