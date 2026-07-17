# YP-122 — Final Checks Implementation Plan

**Ticket:** [YP-122 — Release to production](https://sytesbook.atlassian.net/browse/YP-122)
**Scope:** Only the "Final Checks" section of YP-122. The "Release Process" steps later in the ticket are out of scope for this plan.
**Repos involved:** `youproof-org/content` (YAML content files only), `youproof-org/services` (Next.js frontend, Cloudflare Worker, CI/CD, tooling — including the manifest generator).
**Out of scope:** `youproof-org/editor` is not to be touched as part of this plan.

This is a punch-list of 10 independent items. They can mostly be worked in any order. Each item below gives the symptom/context and acceptance criteria — no prescribed implementation. You have enough context from the repositories to investigate root cause and choose the right fix yourself.

David has already opened a feature branch for these fixes — work on that branch. Use a separate commit per item (or per logical sub-part, e.g. 5a/5b) rather than one giant commit, so each fix can be reviewed/reverted independently.

---

## 1. Cross-reference scroll offset

**Symptom:** Clicking an inline cross-reference navigates to the target element, but the scroll position is often wrong — the target ends up partially or fully out of view.

**Check first:**
- Whether the sticky header's height is being accounted for in the scroll target.
- Whether math rendering or any async content (images, collapsible sections) finishes rendering *after* the scroll happens, shifting the page height and leaving the scroll position stale.
- Whether target elements can be inside collapsed/lazy-mounted UI (accordions, tabs) that might not be expanded/mounted at the time of the scroll.

**Acceptance criteria:**
- Clicking a cross-reference on both short and long pages (including math-heavy ones) lands with the target fully visible, not clipped by the sticky header or anything else.
- Works on both desktop and mobile viewport widths.
- No layout jump/flash after the scroll settles.

---

## 2. Newsletter content cleanup

**Scope:** Mechanical cleanup only — David will write the actual first newsletter content manually. Do not write real newsletter content or create a placeholder "first" entry.

**Context:** Dummy/placeholder newsletter entities currently exist in `youproof-org/content` and need to be removed, along with any dummy references to them. After removal there will be zero real newsletter entries until David adds the first one.

**Acceptance criteria:**
- No dummy newsletter entities remain in content or in generated output.
- Newsletter listing (and any homepage component referencing it) renders a sane empty state with zero entries — no broken UI, no crash.
- Manifest generation doesn't error on zero newsletter entries.

---

## 3. Footer legal links wrapping (mobile)

**Symptom:** The footer legal links live in a flexbox row. On narrow viewports the *individual link items* are wrapping their own text content (line-breaking mid-link), instead of the flexbox itself wrapping items onto new lines.

**Check first:**
- Whether the flex container allows wrapping at all, versus the individual link items being allowed to shrink and wrap their own text.

**Acceptance criteria:**
- At common mobile widths (test at least 320px, 375px, 414px), each legal link renders as a single unbroken line of text, and the set of links wraps onto multiple rows as needed.
- No regression on desktop widths (links still render in a single row where there's room).

---

## 4. Header logo size on mobile

**Context:** The branding logo in the header should be a bit smaller on mobile.

**Check first:**
- Where the logo's sizing is currently controlled (fixed size vs. breakpoint-driven) so the mobile reduction doesn't fight the desktop sizing or break vertical alignment with the nav/search elements.

Pick a reasonable size — David will review and may ask for a follow-up tweak, so flag the value/selector you used in the PR description for easy adjustment.

**Acceptance criteria:**
- Logo is visibly smaller on mobile widths, without breaking header alignment/vertical centering relative to the nav/search elements.
- Desktop sizing untouched.

---

## 5. Hero section down arrow

Two separate problems here:

**5a. Placement:** The down arrow should be positioned directly below the motto string ("There is no royal road, just better maps…"), not wherever it currently sits.

**5b. Load-time size flash:** Right after page load, the arrow briefly renders at a very large size, then snaps down to its correct size a moment later.

**Check first:**
- Whether the arrow has explicit intrinsic sizing on the element itself, or only relies on a CSS class/animation that applies after some delay (a common cause of flash-of-oversized-content).
- Whether there's a CSS animation/transition on the arrow whose starting keyframe is larger than its resting size.

**Acceptance criteria:**
- Arrow is positioned immediately below the motto on both first load and subsequent client-side navigations back to the homepage.
- No visible oversized flash at any point after load (check under network throttling, since load-order issues are often more visible there).

---

## 6. "Hamarosan nyomtatott formában is" per-card badge

**Scope:** Per-card badge on the `Könyvek` (books) section grid — shown only on books that don't yet have a print edition. `youproof-org/editor` is out of scope; if any editor-side tooling would ideally also be updated, just note it as a follow-up rather than implementing it now.

**Check first:**
- Whether the book content schema already has a flag for print-edition availability, or whether one needs to be added.

**Acceptance criteria:**
- Books without a print edition show the badge on their card in the 3-column grid.
- Books with a print edition show no badge.
- Badge styling is consistent with existing card design language (doesn't crowd out title/cover art).

---

## 7. Not-found stub pages return real 404s

**Scope:** Test-writing and verification.

**Context:** "Not-found stub" pages are content that's referenced but not yet migrated/authored. Need to confirm they return a real HTTP `404`, not a soft-404 (a `200` that happens to render a "not found" looking page) — check both the Next.js static export output and the Worker-fronted routing, since the Worker's legacy-proxy/redirect logic could mask this.

**Acceptance criteria:**
- Automated check exists and passes, confirming stub pages return true 404 status codes.
- Check is runnable locally / in CI, not a one-off manual script (even if it's not yet wired into the CI quality-gate pipeline — that's covered under item 10 if you think it belongs there).

---

## 8. Cache pruning validation — analysis & proposal

**Scope:** Analysis and proposal only.

**Context:** Per the existing CI/CD plan, the manifest is bundled directly into the Worker script and the Worker is always fully redeployed on content changes (no Workers KV manifest storage). Need an analysis of what "cache pruning" actually means in this system (edge/CDN cache invalidation for removed or renamed content) and how to validate it's working. Some of this may only realistically be testable manually — if so, say so explicitly rather than writing a test that gives false confidence.

**Deliverable:**
- A short written analysis (as a doc in the repo — check for an existing docs location before creating a new one) covering how cache pruning currently works, what can be automatically tested vs. what can only be validated manually, and a recommended manual verification procedure for the latter.
- If there's a cheap, reliable automatable check, propose and implement it. If not, the manual checklist is a legitimate deliverable on its own.

**Acceptance criteria:**
- Analysis doc exists and is accurate to how the system actually works (not assumed).
- Any automated check implemented actually reflects a real signal, not a superficial one.
- A clear, followable manual verification procedure exists for whatever can't be automated.

---

## 9. `__next_f` script tag investigation

**Symptom:** Hundreds of near-identical `<script>(self.__next_f=self.__next_f||[]).push([0])</script>` tags appear in generated HTML output.

**Scope:** Investigation, not a blind fix. This pattern is part of Next.js's RSC streaming/hydration payload mechanism, so some number is normal — the question is whether the volume here is expected for the page's complexity or a sign of misconfiguration/bug.

**Deliverable:**
- A short written finding (PR description or short doc) stating whether this is expected static-export/RSC boilerplate or an actual issue. If it's an actual issue, fix it. If expected, document why so it isn't re-flagged as a mystery later.

**Acceptance criteria:**
- Clear written conclusion on whether the volume is expected or not, backed by real investigation.
- If a real issue is found, it's fixed and the tag count drops accordingly with no loss of functionality (hydration still works correctly).

---

## 10. Quality gates review + `gen-manifest` empty-content hardening

Two parts:

### 10a. Quality gates documentation & proposal

**Deliverable:** A document (check for an existing process-docs location in `youproof-org/services` before creating a new one) that:
- Catalogues every quality gate currently in place across the pipeline, verified against what's actually implemented (not just what the CI/CD plan describes).
- Notes any gaps between the plan and current enforcement.
- Proposes any additional gates or hardening worth considering before/shortly after this first production release.

This is a documentation/analysis deliverable — only implement new gates if they're cheap and clearly correct; otherwise list them as proposals for David to prioritize.

### 10b. `gen-manifest` robustness on empty/missing content

**Context:** This is the first real production release pairing `youproof-org/services` and `youproof-org/content`. The `content` repo's `stable/released` branch is still at its initial commit — there is no actual content on it yet. The manifest generator must not crash when given empty or missing content.

**Acceptance criteria:**
- `gen-manifest` run against an empty/near-empty content tree completes successfully and produces a valid, loadable manifest.
- Worker build/deploy pipeline succeeds end-to-end with this empty manifest (no downstream crash from consuming an empty manifest).
- Test coverage exists for the empty-content case so this can't silently regress.

---

## Suggested working order

1, 5, 4, 3, then the rest (2, 6, 7, 8, 9, 10) in any order.

## Out of scope for this plan

The "Release Process" and "Definition of Done" sections of YP-122 (branch promotions, legacy notification banner, Search Console setup, branch protection rules, Stage-B/Stage-C SEO verification) are not covered here — let me know if you want a separate planfile for those.
