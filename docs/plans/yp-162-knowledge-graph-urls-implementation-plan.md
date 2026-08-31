# YP-162: Knowledge Graph Node URLs — Implementation Plan

**Companion to:** [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md) (the design; §-references below point into it)
**Sub-plans:**
- [`yp-162-identifiers-and-anchors-sub-plan.md`](yp-162-identifiers-and-anchors-sub-plan.md) — name/slug constraints, the hierarchical anchor grammar, and fully qualified reference targets. **Shipped**, between phase 4 and phase 5; it supersedes [D4](#d4--replace-the-base64-anchor-ids-with-readable-ones-settled--shipped-in-phase-4)'s flat prefixed anchors and E.3's slug-uniqueness table.
- [`yp-162-page-layout-sub-plan.md`](yp-162-page-layout-sub-plan.md) — the knowledge-base page layout. **Shipped**, as phase 5: all 21 of its phases are built. It replaced §7 of the design plan and the layout half of phase 5, and its §10 was the build order for §H below; **[its §12](yp-162-page-layout-sub-plan.md#12-what-actually-landed) is what actually landed there**, and §Shipped below summarizes it.
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`
**Status:** Revision 4 — **all nine phases are built**; every decision below is
settled. §Shipped indexes all nine, and §§C–L carry their close-outs. **One item is
open in the whole plan: §K item 5**, a crawl of a live staging deploy, which cannot
run until this branch reaches `development`. The
phases were renumbered in revision 3: the URL layer, planned as its own phase, had to
be absorbed into phase 4 (see §Shipped), so what follows counts one lower than in
revision 2.

**The identifiers-and-anchors sub-plan has shipped.** It replaced the flat
`fogalom-{slug}` anchors of phase 4 with a hierarchical
`definiciok.{d}.fogalmak.{f}` grammar, turned reference targets into fully qualified
names, made those names the graph's map keys, and put a character rule and a
uniqueness scope on every name and slug. It also **removed the backlink index** —
see the note on phase 5 below, which is where that matters.

**Phase 5 has shipped.** The [page-layout sub-plan](yp-162-page-layout-sub-plan.md) broke it
into 21 narrow phases and all of them are built: the four list pages, the 537 entity
pages, the context menu, the overlay, the panel in five forms, the selection modes, the
outgoing-reference panel, the arrival marker, and the print / no-JavaScript /
reduced-motion sweep. §H below is marked done; H.1 and H.4 survived as requirements,
H.2's component table and H.3's interaction sketch did not.

**Phases 6–9 have shipped**, in four commits: the sitemap index (§I, `e75d4ee`), the
nav item and homepage block that make the knowledge base reachable from the homepage
at all (§J, `529f953`), the deploy gate and the environment-agnostic browser tests
(§K, `30005db`), and the documentation (§L). Each of those four sections was rewritten
as a close-out during phase 9 — what was asked, what landed, and where the two
diverged — and the numbers in them were measured for that pass rather than carried
forward. Two predictions in this plan turned out to be wrong and are corrected there:
the sitemap's child file list is not fixed (§I item 2) and the deepest page is 3 hops
from the homepage, not 5 (§K item 1).

> ### Working agreement
>
> **Nothing is committed or pushed without approval.** Do the work, post a short
> summary of what changed and how it was verified, and wait for an explicit go
> before running `git commit`/`git push`.
>
> **Every phase also ends with a review gate.** After a phase is committed, stop and
> wait for separate approval before starting the next one — do not begin it, not
> even reading files. Where a phase produces a **review artifact** (as phase 1's
> generated title and slug tables did), the artifact is what gets reviewed; the
> derived content files are not written until it is approved.

§A is what the code and content looked like when this plan was written, measured
against the design — kept as the record of why each choice was made, not as a
description of the code today. §B is the decision log. §Shipped is the one-line-per-
phase index of what landed, and §§C–L are the phases themselves — each one now a
close-out of what was asked, what landed and where the two diverged, rather than a
prediction.

---

## Shipped — all nine phases

| phase | what landed | commits |
|---|---|---|
| 1 | Generated title + slug review tables (178 / 150 / 217 rows) | `content cef7759`, reviewed in `d56fcbb` |
| 2 | Editor preserves claim/term slugs; stops deleting a proof's `terms`; round-trip test harness | `editor 960e7cf`, `1da3504`, `0058c19` |
| 3 | 537 entity slugs, 178 titles, 367 claim/term slugs, content-model doc | `content 72fcfab`, `883267b`, `a9459b9`, `e01e56d`, `21f61d0` |
| 4 | KB node URLs, localized anchors, graph derivation, 20 tests, version 2.2.0 | `services ccd5322`, `caace9c`, `51469c5` |
| 5 | Every knowledge-base page and its whole interactive layer — the 21 phases of the [page-layout sub-plan](yp-162-page-layout-sub-plan.md#10-phases) | `services 629c8b9` … `d4aa639`, 24 commits on `feat/yp-162-page-layout-design`; per-phase table in [its §12.1](yp-162-page-layout-sub-plan.md#121-the-21-phases-and-their-commits) |
| 6 | The 541 KB URLs in the sitemap, the postbuild splitter and its `<sitemapindex>`, type-aware single-pass `lastmod` (§I) | `services e75d4ee` |
| 7 | The Tudásbázis nav item and the homepage KB block — 434 of 439 pages now reachable from `/hu` (§J) | `services 529f953` |
| 8 | Crawler caps + fatal truncation, the orphan check under a sitemap index, environment-agnostic browser tests, both suites in CI (§K) — **item 5, the live staging crawl, still open** | `services 30005db` |
| 9 | The two normal docs, the content model's page gate, and the close-outs for 6–9 (§L) | *this change* |

Plus three follow-ups: `content 4167543` (two mistyped reference targets),
`content 8a9a364` (renamed the generated tables off the ticket number), and
`content fb76f03` (a term listing its own canonical form among its synonyms — which is
why every glossary row count in these plans written before it is one too high; 341 rows
over 217 terms and 124 synonyms is the figure).

### Divergences from the plan, and why

- **The URL layer was absorbed into phase 4.** Phase 4's `resolveRefHrefs` and
  `buildGlossary` cannot compile without `urlForDefinition` &c., so the 4/5 split
  in revision 2 was not real. Everything the old phase 5 listed is done.
- **The anchor rework moved from the page phase into phase 4.** Once the graph
  emits `#allitas-{slug}` hrefs, leaving the components rendering base64 ids
  breaks every in-chapter anchor, so both halves had to land together.
- **Anchor prefixes are localized** — this was not in the plan at all. A fragment
  is URL text the reader sees and copies, so `claim-`/`term-`/`{type}-` became a
  per-locale `anchors` dictionary in `locales.json`: `allitas-`, `fogalom-`,
  `definicio-`, `tetel-`, `bizonyitas-`, `megjegyzes-`. Singular, and therefore
  distinct from the plural container segments. The helpers take the **owning node**
  rather than a locale string, so the locale cannot drift from the node the anchor
  lives on; a shared `AnchorParent` type then let the compiler find all seven block
  components that thread it through.
- **Phase 4 shipped as 3 commits, not 5.** `graph.ts` changed pervasively;
  splitting it further would have meant hand-reconstructing intermediate states of
  a 500-line diff, i.e. committing code that was never built. Each of the three was
  verified to typecheck in isolation.
- **`slug` sits after `name`, not after `locale`** (already folded into §E) —
  otherwise the first save in the editor moves 537 lines.
- **A latent bug fixed on the way:** `display-template`'s `buildContext` took the
  embedding map as an *optional* argument, so calling it without one compiled fine
  and silently dropped every `{target.index}`. It now reads `graph.embedding`.
- **A content bug found and fixed:** two proofs referenced a theorem as
  `type: definition`. Harmless in output — the graph resolves by namespace+name and
  ignores the declared type — but it was also what made an earlier
  inbound-reference count off by one.
- **Generated artifacts must not be named after the ticket.** Naming the review
  tables `yp-162-generated-*.md` forced three scripts to embed the ticket number in
  a hardcoded path. Renamed to `generated-kb-*.md`; the rule is now: name a
  generated file after its contents.

**Phase 5's divergences are in [the sub-plan's §12.2](yp-162-page-layout-sub-plan.md#122-divergences-from-the-phases-and-why)**,
which is the same shape as this list. The four that matter to a reader of *this*
document:

- **Playwright was added mid-run**, in the phase that built the menu. The chrome's
  "one back step, four ways in" contract is about `pushState`/`popstate` in a real
  browser and no unit test can assert it. The run ends with **114 browser tests in 8
  files** where the baseline had none, plus `playwright.config.ts` and
  `scripts/serve-out.mjs`. `pnpm test:e2e` is deliberately not part of `pnpm test`: it
  needs a browser binary and a built `out/`.
- **An owner ruling replaced the sub-plan's §7.1 per-target-kind panel table.** It had
  given each kind its own treatment — an entity's full body, the claim itself, a term's
  synonyms — and combined with §2.1's served-HTML rule that meant every citing page
  carried a copy of everything it cited. **Every kind now renders label, title and a
  link.** One arrangement replaces five. Measured cost of the previews: roughly a third
  of every knowledge-base page.
- **Two more owner rulings**: identity comes first in every panel (the sub-plan's §7.2
  wording was wrong, the code was right), and a backlink row carries a **visible kind
  label**, because 57 same-title groups in the data span more than one kind.
- **§H.3's "all panel content is server-rendered" commitment was made stricter.**
  Serving the content and leaving it `hidden` satisfies the letter of the rule but
  leaves a reader without JavaScript looking at invisible panels. The final phase ruled
  that inline means *visible* and implemented it with a stylesheet inside `<noscript>`.
  **The served bytes did not change**, so a crawler reads identical HTML.

### Measured on the real content (not fixtures)

*Phase 4, at the time it shipped:*

- 537 KB nodes, all embedded exactly once, all inside a section.
- **389 nodes get a page under `SITE_ENV=staging`** (63 definitions, 136 theorems,
  136 proofs, 54 remarks); 537 locally. Matches the A9/D9 prediction exactly.
- 217 glossary rows; 6090 backlinks — the latter independently equal to a direct
  count of KB-directed references in the content.
- **11 085 internal fragment hrefs in the built output, 0 broken**, and no English
  anchor prefix anywhere. *(The page-layout sub-plan's own baseline, taken later on its
  branch, measured 11 086. One href appeared between the two points and why is
  unrecorded; both are 0 broken, and neither figure is load-bearing.)*
- Build unchanged at ~12 s / 46 pages; 59/59 tests pass.

*Phase 5, at the end of the run — the full table is
[§12.3 of the sub-plan](yp-162-page-layout-sub-plan.md#123-the-measurements):*

| | before phase 5 | local | `SITE_ENV=staging` |
|---|---|---|---|
| HTML pages | 46 | **587** | **439** |
| `pnpm build` wall, incl. `prebuild` + `postbuild` | 14.3 s | **22.780 s** | **21.811 s** |
| unit tests | 96 | **202** | — |
| browser tests | none (no Playwright) | **114 in 8 files** | — |
| `check-anchors` fragment links | 11 086 / 0 broken | **22 594 / 0 broken / 0 skipped** | **22 335 / 2 accepted broken** |
| `du -sh out/` | — | **234M** | 171M |

- **537 entity pages locally, 389 on staging** — A9/D9 still exact, now as rendered
  pages rather than as a prediction.
- **341 glossary rows** over 217 canonical terms and 124 synonyms (see the `fb76f03`
  note above), 83 terms carrying at least one.
- **3789 distinct (target, source) backlink pairs.** `gyuru-test` is the extreme at
  **222 sources / 548 references** locally and **207 / 533** on staging; the median
  entity shows **1**; the empty state is reached by **244 of 537** locally and
  **168 of 389** on staging.
- **17 902 `data-target-fqn` DOM attributes** across the export, over 651 distinct
  values.
- **The staging build exits 1, by design** — exactly two accepted broken anchors, both
  into `alice-es-bob-atlepi-a-celvonalat`, citing content not yet migrated. The owner
  ruled they stay; the condition is *exactly these two*. See
  [§12.4](yp-162-page-layout-sub-plan.md#124-accepted-states--recorded-so-nobody-fixes-them).

### Closed without action

- **486 references carry no `display`** and render as a visible `ref-error`. They
  sit entirely in the five *unpublished* chapters: a local build shows 5 affected
  pages, a `SITE_ENV=staging` build shows **0**, because unpublished chapters render
  as stubs on deployed environments. They resolve as those chapters are finalized.
- **Three pre-existing ticket references** in source (`quality-gate.mjs`,
  `report.mjs`, `notify-services.yml`) stay, by decision.

---

## A. Findings — current state vs. the design

### A1. Knowledge-base entities are deliberately non-addressable today

`docs/i18n-design.md` §4a records the current decision verbatim: *"KB entities and
namespaces … get a `locale` field only — no `slug`"*, and its field-summary table
classifies `definition`/`theorem`/`proof`/`remark` as **"Inline / structural (no
URL, no anchor)"**. `content/docs/content-model.md` says the same ("Types
**without** a `slug` … are never addressable"). This plan supersedes that
decision, so both documents must be amended, not silently contradicted.

### A2. An entity's address today is `{embedding-chapter-url}#{base64-id}`

- [graph.ts:871-923](../../apps/website/lib/content/graph.ts#L871-L923)
  (`buildEntityChapterInfo`) maps each entity to the URL of the chapter whose
  `embed` block renders it, and to a chapter-scoped index (`"11.3."`).
- [graph.ts:925-999](../../apps/website/lib/content/graph.ts#L925-L999)
  (`resolveRefHrefs`) turns every entity/claim/term reference into
  `{chapterUrl}#{id}`, where the id is base64-of-JSON from
  [entity-id.ts](../../apps/website/lib/utils/entity-id.ts),
  [claim-id.ts](../../apps/website/lib/utils/claim-id.ts) and
  [term-id.ts](../../apps/website/lib/utils/term-id.ts).
- `resolveRefHrefs` **throws** if a referenced entity is embedded in no chapter.
  Currently unreachable — see A2b — and per [D9](#d9--which-entities-get-a-page-settled)
  it stays a hard error rather than becoming a fallback.

### A2b. Embedding is universal, single, and always inside a section

**Every one of the 537 entities is embedded exactly once**, always inside a
`section` body (never a chapter prologue/epilogue/abstract). One exception:
theorem `rsa-algoritmus-helyes-mukodese` is embedded in two chapters;
`buildEntityChapterInfo` keeps the first in iteration order (deterministic, driven
by `episodes.yaml`).

Consequence: §7's *"Embedding context"* block (`book → chapter → section`) has
complete data for every node, and — given [D9](#d9--which-entities-get-a-page-settled)
— it is **non-optional** on every generated KB page. The chapter-scoped index
(`"11.3."`, A17) is likewise always available.

### A3. KB graph nodes carry no `locale` — every URL helper needs it

All 551 KB YAML files carry `locale: hu`, but the four KB loaders
([loader.ts:208-274](../../apps/website/lib/content/loader.ts#L208-L274)) never
read it, and `DefinitionNode`/`TheoremNode`/`ProofNode`/`RemarkNode`
([types.ts:215-263](../../apps/website/lib/content/types.ts#L215-L263)) have no
`locale` field. `buildLocalizedUrl(locale, …)` needs one per node, exactly as
`urlForBook`/`urlForChapter` read `node.locale` today.

### A4. No `slug` exists anywhere in the knowledge base

`grep -rl '^slug:' content/knowledge-base` → 0 of 551 files.

### A5. `title` is missing on 468 of the 537 entities

| type | has `title` | missing (all) | missing **and** on a published-embedded node |
|---|---|---|---|
| definition | 62 / 84 | 22 | **1** |
| theorem | 35 / 191 | **156** | **101** |
| proof | 0 / 190 | 190 | 136 |
| remark | 0 / 72 | 72 | 54 |

A display title **cannot** be derived mechanically from `name`, because `name` is
diacritic-stripped kebab-case (`gyuru-reszbenrendezesenek-tulajdonsagai` → "gyuru
reszbenrendezesenek tulajdonsagai", not "Gyűrű részbenrendezésének tulajdonságai").
It has to be reconstructed from the name **plus the mathematical content of the
node** — which is what Phase 1 does.

The right-hand column matters: under [D9](#d9--which-entities-get-a-page-settled)
only nodes in *published* chapters get a page on staging/production, so the titles
that actually gate the launch are **1 definition + 101 theorems**, not 178. The
remaining 76 become live when those five chapters publish. Resolved by
[D1](#d1--titles-settled).

### A6. Entity names are globally unique — a flat slug space is safe

All 537 `name` values are unique across every type *and* namespace (0 collisions).
§3.1 asks for uniqueness within `(locale, type)`; the data is in fact unique across
all types, which is stricter. So seeding entity slugs from `name` collides with
nothing.

### A7. Compositional ownership is clean and strictly 1:1

- 190/190 proofs have exactly one owning theorem. 0 orphans.
- 72/72 remarks have exactly one owner: 36 definitions, 28 theorems, 8 proofs. 0 orphans, 0 shared.
- **No theorem has more than one proof; no parent has more than one remark.**

So §7.2's *"otherwise a neutral label (e.g. `1. bizonyítás`)"* disambiguation has no
data exercising it yet — implement it, but it is untestable against real content.
There are also currently **zero "independent" remarks**, so the
`attachedTo === undefined` branch in `buildEntityChapterInfo`'s `isIndexed` and in
[index-helpers.ts:46-59](../../apps/website/lib/utils/index-helpers.ts#L46-L59) is
dead code today. Keep both paths — the model permits them.

### A8. Claims and terms

- **150 `claim` blocks**: 92 in theorems, 30 in definitions, 28 in remarks.
- **217 term definitions** across 82 entities: 172 on definitions, 38 on theorems,
  7 on remarks.
- **Claims on proofs and terms on proofs are both currently zero, but neither is a
  constraint to build on.** David has stated that defining terms directly in proofs
  is wanted later. The *code* already supports it — `ProofNode.terms` exists
  ([types.ts:245](../../apps/website/lib/content/types.ts#L245)), `loadProof` reads
  it, `EmbeddedEntity` passes `terms`/`termParent` for proofs, and
  `TermRefTarget.parent` / `ClaimRefTarget.parent` are typed as
  `KnowledgeBaseRefTarget`, which already includes `'proof'`. Only
  `content/docs/content-model.md` claims otherwise ("`terms` is a dictionary … on
  definitions, theorems, and remarks") and its `proof` example omits `terms`. So
  the work here is: fix the doc, and make the **proof page** (§7.3) render a
  "Defined terms" block and term anchors on the same footing as the other three
  types, with the glossary sourcing terms from all four types. No special-casing
  that treats proofs as term-free.
- Claim `name`s and term keys are **English** kebab-case
  (`ring-multiplication-is-distributive-over-addition`, `integer-number`).
  Resolved by [D2](#d2--where-slugs-come-from-settled) — Hungarian slugs get
  authored via a reviewed table.
- **§3.3 says a term is defined by one node. It is not.** 8 term keys are defined
  in more than one entity, and 9 `canonical` forms are duplicated — `reprezentáns`
  and `reprezentáció` are each defined in **3** different entities;
  `is-at-most`/`is-at-least`/`is-less-than`/`is-greater-than` each in 2. Still open:
  [D5](#d5--glossary-grouping-for-duplicate-terms-settled--shipped-in-phase-4).
- ~~One term is missing `canonical`~~ — fixed in content (`proper-containment` in
  `reszhalmaz` now has `canonical: szigorú tartalmazás`). No action.

### A9. The reverse-reference graph is dense; roughly half the nodes have no inbound links

Reference targets across the whole corpus:

| target type | count |
|---|---|
| term | 4150 |
| theorem | 752 |
| definition | 666 |
| claim | 460 |
| section | 180 |
| chapter | 152 |
| external | 78 |
| remark | 45 |
| proof | 17 |

- 281 of 537 entities have ≥1 inbound entity reference; 256 have none (proofs are
  referenced 17 times in total across 190 proofs, remarks 45 times across 72). So
  the "Referenced by" section is empty on most proof and remark pages.
  **Accepted — David: not a problem for now.** Tracked as R2, not as a blocker.
- Referrers are **not** only KB nodes: 152 chapter-owned and 180 section-owned
  references point into the KB — see [D7](#d7--do-chapter-and-section-referrers-appear-in-referenced-by-settled).
- 197/217 terms have ≥1 inbound reference (top counts 166 / 151 / 129), and
  118/150 claims do — confirming §9's corrected premise that claim references are a
  common pattern. That is why the entity page gives terms and claims a way to show
  what cites *them* specifically — the "Fogalmak" and "Állítások" modes of the
  page-layout sub-plan, which replaced the F2 sketch this finding originally motivated
  (§H.3).

### A10. "Consequences" has no backing data — block removed

The complete set of top-level fields present anywhere in `content/knowledge-base`
is: `type`, `name`, `locale`, `body`, `references`, `remarks`, `proofs`, `title`,
`labels`, `terms`, `children` (the last only on 3 `namespace.yaml` files). There is
**no** `consequences`, `follows-from`, `implies` or equivalent relation, and
consequence is not derivable from `references` — a proof citing theorem Y says Y was
*used*, not that anything is a consequence of it.

**Settled ([D6](#d6--the-consequences-block-settled)): the "Consequences" block is
removed from §7.2.** It would duplicate "Referenced by".

### A11. The URL layer only supports one-segment containers at `path[0]`

- `ContainerKey` is `book | chapter | article | newsletter | landing`
  ([config.ts:14](../../apps/website/lib/i18n/config.ts#L14)); `resolveContainerKey`
  maps a single segment.
- `buildLocalizedUrl` ([url.ts:33-59](../../apps/website/lib/i18n/url.ts#L33-L59))
  has one `case` per `UrlKey`, and `req()` enforces an **exact** slug-segment count.
- `resolvePath` ([page.tsx:74-120](../../apps/website/app/[locale]/[[...path]]/page.tsx#L74-L120))
  branches on `resolveContainerKey(locale, path[0])` and handles at most 4 segments.

The KB needs a two-level container (`tudasbazis/definiciok`) and up to **six**
segments (`/hu/tudasbazis/tetelek/{t}/bizonyitasok/{p}/megjegyzesek/{r}`). The
catch-all route itself is fine; `resolvePath`, `generateStaticParams` and
`generateMetadata` each need a KB branch.

Useful side effect: adding `knowledge-base: 'tudasbazis'` to the `containers`
dictionary automatically extends the existing custom-page collision guard
([page.tsx:169](../../apps/website/app/[locale]/[[...path]]/page.tsx#L169)), so a
page slugged `tudasbazis` becomes a build error for free. Conversely, adding
`definiciok`/`tetelek`/… as container segments makes `/hu/definiciok` resolve to a
container key at top level, which `resolvePath` must reject — exactly as it already
rejects a bare `fejezetek` ([page.tsx:100](../../apps/website/app/[locale]/[[...path]]/page.tsx#L100)).

### A12. **Next.js 15.5 cannot emit a `<sitemapindex>`** — §6.4 needs a different mechanism

Verified in the installed Next: `resolveSitemap` in
`node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js`
serializes **only** `<urlset>`, and `generateSitemaps`
(`.../loaders/next-metadata-route-loader.js`) emits `/sitemap/{id}.xml` files
**without** an index. §6.4's "per-type files + sitemap index" therefore cannot be
expressed through the `app/sitemap.ts` metadata convention.

Mechanism (Phase 7): keep `app/sitemap.ts` as the single enumerator of every URL,
and add a `postbuild` splitter that reads `out/sitemap.xml`, buckets `<url>` entries
by URL shape into `out/sitemap-{type}.xml`, and rewrites `out/sitemap.xml` as the
`<sitemapindex>`. Precedent for a postbuild rewrite of the export exists
(`scripts/set-html-lang.mjs`). Bucketing is deterministic from the path prefix,
derived from `locales.json` — the same file `gen-content-lastmod.mjs` and the
migration-worker manifest generator already read. `robots.ts` keeps pointing at
`/sitemap.xml`, which becomes the index. No Terraform change: `.xml` is already in
`zone/locals.tf`'s `asset_extensions`, so the new files are served directly and skip
the `.html`-append transform.

### A13. `gen-content-lastmod.mjs` will not see KB files

[gen-content-lastmod.mjs:30-33](../../apps/website/scripts/gen-content-lastmod.mjs#L30-L33)
keys off **fixed filenames** (`book.yaml`, `chapter.yaml`, …). KB filenames are
arbitrary (`csoport.yaml`), so no KB entity would get a `lastmod`. It also spawns one
`git log` per matched file; adding 537 files means 537 extra subprocesses. Both fixed
in Phase 7.

### A14. Crawler: it already visits each page once — the caps are the problem

[crawl.mjs](../../tools/smoke-tests/scripts/crawl.mjs) already dedupes: an
`enqueued` Set (L128) is checked before every push (L340), so **each internal page is
fetched exactly once today**. A depth-first refactor would not change that property,
so it is not needed. Two real constraints remain:

- **`MAX_PAGES = 500`** (L62). Page counts under [D9](#d9--which-entities-get-a-page-settled):

  | | entity pages | + KB root/indexes/glossary | + existing export | total |
  |---|---|---|---|---|
  | development | 537 | 541 | 46 | **587** |
  | staging / production (today) | 389 | 393 | 46 | **439** |
  | staging / production (all 5 chapters published) | 537 | 541 | 46 | **587** |

  Staging fits under 500 *today* with ~12% headroom, and blows through it the moment
  the five unpublished chapters ship. Because the orphan check compares
  `/sitemap.xml` against pages actually **visited**, a truncated crawl reports
  hundreds of false orphans and fails the gate. Raise the cap now, and assert
  `cappedAtMaxPages === false` so a future overflow fails loudly instead of silently.
- **`MAX_DEPTH = 5`** (L63). The deepest URL sits at depth 5 from the `/hu` seed
  (home → KB root → theorems index → theorem → proof → remark), i.e. **exactly** at
  the limit with zero margin. One extra hop anywhere in the nav path silently drops
  every remark-under-proof page from the crawl. Raise to 7.

Crawl wall-clock grows ~10× at `CONCURRENCY = 5`; measure before deciding whether to
raise concurrency.

### A15. The editor silently deletes new sub-fields on claims and terms

In `youproof-org/editor`, `src/handlers.ts` rebuilds claim blocks and term entries
**field by field** on save:

- claim (`case 'claim'`, ~L658) writes only `name`, `content`, `formula`;
- terms (~L533) write only `display`, `canonical`, `synonyms`.

A `slug` on a claim block or term entry is therefore **destroyed the first time an
author saves that file in the editor**. Since [D2](#d2--where-slugs-come-from-settled)
now authors 367 such slugs, this is a **hard prerequisite**, not a follow-up — the
editor fix (Phase 2) must land and be installed before Phase 3 writes any content.

A top-level `slug` on a KB entity *does* survive (`saveFromModel` mutates the loaded
YAML document, and `reorderYamlKeys` preserves unlisted keys) but would be appended
at the end of the file unless added to `CANONICAL_ORDER`.

### A16. Localizable strings are hardcoded in the current shell

`locales.json` has a `labels` block, but `SiteHeader` hardcodes the nav labels
`'Cikkek'`/`'Hírek'`
([SiteHeader.tsx:22-25](../../apps/website/components/layout/SiteHeader.tsx#L22-L25))
and `page.tsx` hardcodes `'Főoldal'`, `'Cikkek'`, `'Hírek'` in breadcrumbs. New KB
labels go in `locales.json.labels` per the i18n guiding principle ("hardcoding lives
only in *data*"); Phase 8 touches the same lines, so fixing the existing offenders is
nearly free.

### A17. Entity numbering (`"11.3."`) is chapter-scoped

`buildChapterEmbedIndices` / `buildEntityChapterInfo` derive `"11.3."` from `embed`
order inside the embedding chapter. Per A2b + D9 every KB page has an embedding
chapter, so the index is always available to borrow for the page kicker.

### A18. Build-cost baseline (measured)

`next build`: **16.66 s wall** for 52 static pages; content graph built in 302–533 ms
per webpack context. Extrapolating to ~590 pages gives roughly 2–3 min, dominated by
server-side KaTeX. Not a blocker; re-measure at the end of Phase 6.

### A19. The dev raw-graph cache has no shape version

[graph-cache.ts](../../apps/website/lib/content/graph-cache.ts) writes
`RawGraphData` to `.next/cache/content-graph.json` and `readRawCache` deserializes it
with no version check. Phase 4 adds fields to `RawDefinitionEntry` &co., so a cache
written before the change would rehydrate nodes missing `locale`/`slug`. Add a
`version` constant to `RawGraphData` and return `null` on mismatch.

### A20. `RefEntry.href` is a single mutated field — D3 now needs two

`resolveRefHrefs` mutates `entry.href` **in place** on the live node object
([graph.ts:807-810](../../apps/website/lib/content/graph.ts#L807-L810) documents this
deliberately). Under [D3](#d3--where-internal-entity-cross-references-point-settled)
the *same* `references` map is now rendered in two contexts — embedded inside a
chapter page, and on the node's own KB page — and must produce **different hrefs** in
each. One mutated field can no longer serve both.

Solution (Phase 4/6): resolve **both** at build time — keep `href` as today's
chapter-context value and add `kbHref` for the KB-page context — then, at the single
boundary where a KB page hands its `refs` to `ContentBlocks`, pass a shallow-remapped
RefMap (`{...entry, href: entry.kbHref ?? entry.href}`). That is one helper call at
the page boundary instead of threading a new prop through `ContentBlocks` →
`Narrative`/`Formula`/`List`/`Quote`/`Claim`/`Figure`/`Subsection`/`Details` →
`InlineText`. Nested `subsection`/`details` blocks inherit the same `refs` prop, so
they are covered for free.

---

## B. Decision log

### D1 — Titles (settled)

**Decision:** generate a proposed `title` for **every definition and theorem that
lacks one** (22 + 156 = 178), derived from the `name` field *and the node's
mathematical content*. Deliver as a review table; David reviews and overrides where
needed; the finalized table is then applied to the content files.

Proofs and remarks are **not** given authored titles. They use derived display
titles: `"Bizonyítás: {theorem-title}"` and `"Megjegyzés: {owner-title}"`. §7.3/§7.4
already sanction a neutral label; an owner-derived one is strictly better.

Implementation note: the fallback chain still exists in code
(`title ?? ownerDerived ?? "{index} {Label}" ?? "{Label}"`) so the build never
depends on a title being present, but after Phase 3 no definition or theorem should
reach the `"{index} {Label}"` rung.

### D2 — Where slugs come from (settled)

- **Entities (537):** `slug` backfilled from `name` by a one-off script. `name` is
  already Hungarian kebab-case, URL-safe and globally unique (A6). This is the
  precedent set by `content/scripts/migrate-locale-slug.mjs`, which seeded
  chapter/section slugs the same way.
- **Claims (150) and terms (217):** Hungarian slugs **authored**, produced the same
  way as titles — derived from the English `name`/key plus mathematical context,
  delivered as a review table, reviewed and overridden by David, then applied.

The anchor is `#claim-{slug}` / `#term-{slug}`, with a `slug ?? name` fallback kept
in code so an un-slugged node (e.g. one added between migrations) still renders a
working anchor rather than crashing.

**Prerequisite:** the editor fix (A15, Phase 2) must ship before Phase 3 writes these
slugs, or the first editor save destroys them.

### D3 — Where internal entity cross-references point (settled)

Keyed on the **rendering context**, not on the target:

| reference rendered on… | resolves to |
|---|---|
| a chapter page — including references inside an entity embedded on that page | the **in-page anchor** (today's `{embedding-chapter-url}#{anchor}`), unchanged |
| a standalone KB page | the **canonical KB page** of the target (+ claim/term anchor) |

See A20 for the `href` / `kbHref` mechanism this requires.

Edge case this creates: on staging/production a KB page may reference an entity that
has **no** KB page (its embedding chapter is unpublished — 148 such entities today).
`kbHref` must then fall back to the chapter anchor, which lands on the chapter's
not-migrated/unavailable stub. That mirrors the existing standalone-reference policy
(link to the stub, log a build warning) rather than emitting a dead link.

### D4 — Replace the base64 anchor ids with readable ones (settled — shipped in phase 4)

§3.3 specifies `#claim-{slug}` and `#term-{slug}`; today the ids are base64-of-JSON.
Done, and extended: the *prefix* is localized too, which the plan had not
considered. See §Shipped. The three base64 helpers are deleted.

### D5 — Glossary grouping for duplicate terms (settled — shipped in phase 4)

Per A8, 8 term keys and 9 `canonical` forms have multiple defining nodes.
Shipped as recommended: **one entry per (defining node, term key)**, sorted by
`canonical` then owner title, each carrying its defining node's title so duplicates
are visibly disambiguated. 217 rows. Grouping by `canonical` would have hidden that
these are genuinely different definitions in different contexts.

### D6 — The "Consequences" block (settled)

**Removed.** It has no backing data (A10) and would duplicate "Referenced by".
§7.2 loses the bullet; nothing replaces it.

### D7 — Do chapter and section referrers appear in "Referenced by"? (settled)

332 references into the KB come from chapters and sections (A9).
The backlink index already carries them — a chapter or section citation is indexed
exactly like a KB one, with `ownerKind` distinguishing it (370 chapter-owned and
1826 section-owned citations).

**Settled by the page-layout sub-plan's
[§7.2](yp-162-page-layout-sub-plan.md#72-incoming-references): yes, in the same list.** There is
no separate grouping for them. The list is grouped **by source** — one row per source,
whatever kind it is, carrying a count of how many times that source cites this entity —
and a chapter or a section is a source like any other. A reader asking "where is this
used?" wants the chapter as much as the theorem. A section row links to the chapter
page at the section's anchor; an entity row links to the entity's own page.

Two implementation consequences, both in sub-plan phase 2: sources whose page does not
exist on a deployed build are **dropped** (353 of the 3789 (target, source) pairs would
otherwise be a 404), and the 114 pairs whose source sits in an unpublished chapter are
a judgement call recorded in that phase.

### D8 — Container segments and labels (settled — shipped in phase 4)

Add to `ContainerKey` / `locales.json.containers`: `knowledge-base → tudasbazis`,
`definition → definiciok`, `theorem → tetelek`, `proof → bizonyitasok`,
`remark → megjegyzesek`, `term → fogalmak`; and to `locales.json.labels`:
`knowledgeBase`, `definitionsIndex`, `theoremsIndex`, `glossary`.

### D9 — Which entities get a page (settled)

A KB entity gets a standalone page **iff it is embedded in a chapter section**, and:

- **development** — that is the only condition; the embedding chapter's published
  state is ignored (matching how unpublished chapters already render normally
  locally, `isDeployedEnv` in `page.tsx`).
- **staging / production** — the embedding chapter must **also be published**.

Today: 22 published chapters, 5 unpublished; **389 of 537 entities qualify on
staging/production**, 148 do not (55 theorems, 54 proofs, 21 definitions, 18 remarks).
All 217 terms and all 150 claims live on qualifying nodes, so the glossary is
complete in every environment.

This rule must be applied at **one** place and consumed everywhere:
`generateStaticParams`, both type indexes, the glossary, the sitemap, backlink
rendering, and `kbHref` resolution (D3's edge case). An un-embedded entity gets no
page and `resolveRefHrefs` keeps **throwing** on a reference to it — a reference to a
node rendered nowhere is a content error, and that is the right place to catch it.

Testing hazard this creates: the local page set differs from the deployed one, so a
KB link that works locally can 404 on staging. Mitigated by a build-time
"no dangling KB link" validator (Phase 4) plus the crawler (Phase 9).

---

## C. Phase 1 — Generated title and slug tables *(DONE — see §Shipped)*

Produces three reviewable tables under `docs/plans/`, in the **content** repo (they
describe content, and David reviews them alongside the YAML they will become):

1. **`yp-162-generated-titles.md`** — 178 rows (22 definitions, 156 theorems), columns:
   `type` · `namespace` · `name` · **proposed title** · one-line rationale (what in the
   body the title was drawn from) · `override` (blank, for David).
   Ordered by type then namespace so related nodes are reviewed together, and marked
   with whether the node is currently published-embedded (A5's right-hand column) so
   the 102 launch-gating rows can be reviewed first.
2. **`yp-162-generated-claim-slugs.md`** — 150 rows: `parent type/name` ·
   `claim name` (English) · `claim index` · claim text excerpt · **proposed Hungarian
   slug** · `override`.
3. **`yp-162-generated-term-slugs.md`** — 217 rows: `defining node` · `term key`
   (English) · `canonical` (Hungarian) · **proposed Hungarian slug** · `override`.
   Term slugs derive primarily from `canonical`, which is already the Hungarian base
   form — so most rows should be a mechanical slugification of `canonical`, with the
   8 duplicate keys and 9 duplicate canonicals (A8) explicitly flagged since they will
   need disambiguating suffixes to stay unique within their parent.

Generation is scripted (a throwaway script under `content/scripts/`, not committed as
a permanent tool) so the tables can be regenerated if content moves before review
finishes. **No YAML is modified in this phase.**

**Review gate:** David reviews the three tables and fills in overrides. Phase 2 may
start in parallel (it touches only the editor repo), but Phase 3 must not.

---

## D. Phase 2 — Editor: preserve claim/term slugs (`youproof-org/editor`) *(DONE — see §Shipped)*

Hard prerequisite for Phase 3 (A15).

1. `src/handlers.ts` — preserve `slug` in the claim-block serializer (`case 'claim'`)
   and in the term-entry serializer.
2. `CANONICAL_ORDER` — add `slug` after `name` for `definition`, `theorem`, `proof`,
   `remark`, so the backfilled entity slug keeps a stable position instead of being
   appended at the end of the file.
3. `src/content/model.ts` — update the "`slug` is intentionally NOT modelled" comment
   to record that it is now *preserved* on KB entities, claims and terms.
4. Round-trip test: load a KB entity with entity/claim/term slugs, save without
   editing, assert the file is byte-identical.

**Review gate.** Also: the updated editor must be installed before Phase 3 begins —
`pnpm editor:install-dev` from the content repo, **not** `editor:install`. The
latter is release mode: it downloads the latest released VSIX from the editor's
GitHub releases, so it would install the old published editor and silently discard
this phase's fix. `install-dev` symlinks the local `../editor` working copy, which
is where the fix lives until it is released. Run `npm run build` in the editor
first (dev mode warns, but does not fail, when `out/extension.js`, `media/panel.js`
or `media/editor.js` are missing), and reload the VS Code window afterwards —
VS Code does not hot-reload installed extensions.

---

## E. Phase 3 — Content schema + backfill (`youproof-org/content`) *(DONE — see §Shipped)*

1. **Apply the approved tables** from Phase 1 — titles into the 178 definition/theorem
   files, claim slugs into the 150 claim blocks, term slugs into the 217 term entries.
   Scripted from the finalized tables, line-based (not a YAML re-dump), idempotent,
   dry-run by default. Commit titles and slugs **separately** so either can be reverted
   alone.
2. **`scripts/migrate-kb-slug.mjs`** — one-off entity slug backfill, modelled on the
   existing `scripts/migrate-locale-slug.mjs`: line-based, idempotent, `--write` to
   apply. Inserts `slug: <name>` immediately after the `name:` line — i.e. *before*
   `locale:` — for the 537 entity files. Separate commit again.

   > Position settled in Phase 2: the editor's `CANONICAL_ORDER` now lists `slug`
   > right after `name` for all four knowledge-base types, matching where it already
   > sits for `chapter`/`section`. Inserting it after `locale:` instead would make
   > the first editor save move every line. The same rule applies to the sub-field
   > slugs: `slug` is the first key of a `terms:` entry (the map key is the name)
   > and comes right after `name` in a `claim` block.
3. **`docs/content-model.md`**
   - Add `slug` to the `definition`/`theorem`/`proof`/`remark` examples and to the
     `locale` & `slug` field table; move those four types out of the "never
     addressable" sentence.
   - Document `slug` on `claim` blocks and on `TermMap` entries.
   - **Correct the Terms System section: `terms` applies to definitions, theorems,
     proofs *and* remarks** (A8), and add `terms` to the `proof` example.
   - Extend the **slug uniqueness** table: `definition`/`theorem` unique across all
     nodes of that type in the locale; `proof`/`remark` unique within their owning
     parent; claim/term slugs unique within their owning node.
   - State that `title` is required in practice for `definition`/`theorem`, and
     derived for `proof`/`remark`, with the derivation rule spelled out.

**Review gate.** Verify: re-running every script is a no-op; opening and saving a
migrated file in the editor is byte-identical.

---

## F. Phase 4 — Loader, graph model, reverse index, URL layer (`services`) *(DONE — see §Shipped)*

### F.1 Types — `lib/content/types.ts`

- Add `locale: string` and `slug: string` to `DefinitionNode`, `TheoremNode`,
  `ProofNode`, `RemarkNode`.
- Add `slug?: string` to `ClaimBlock` and to `TermDefinition`.
- Add `kbHref?: string` to `RefEntry` (A20).
- New: `KbBacklink { owner; ownerKind; ownerUrl; label; refKey; targetAnchor?: string }`
  — `targetAnchor` is what F2's cross-highlighting keys on; `EmbeddingContext { book; chapter; section }`;
  `GlossaryEntry`.

### F.2 Loader — `lib/content/loader.ts`

- Call the existing `readLocale(raw)` / `readSlug(raw, name)` in `loadDefinition`,
  `loadTheorem`, `loadProof`, `loadRemark`. `readSlug` already falls back to
  `name.toLowerCase()`, so this is safe to land before Phase 3 reaches `stable/*`.
- Read the optional `slug` on claim blocks (`normalizeBlock` already kebab→camels
  every key, so no special case) and on term entries (`toTermMap` passes the object
  through, likewise).

### F.3 Graph — `lib/content/graph.ts`

- Thread `locale`/`slug` through `RawDefinitionEntry`/`RawTheoremEntry`/
  `RawProofEntry`/`RawRemarkEntry` and their `buildGraphFromRaw` constructions.
- **`RawGraphData.version`** + a mismatch check in `graph-cache.ts` (A19).
- **`buildEntityChapterInfo` → `buildEmbeddingContext`:** widen the value from
  `{ chapterUrl, index? }` to `{ chapter: ChapterNode; section: SectionNode; index?: string }`.
  `scanForUrl` currently receives only a URL string; give it the owning
  `ChapterNode`/`SectionNode`. Every embed lives in a section body (A2b), so `section`
  is always present today — still model it as optional for a future chapter
  prologue/epilogue embed.
- **New `kbPageExists(entity, env)`** — the single implementation of D9, exported for
  every consumer.
- **New `buildBacklinkIndex(graph)`** — iterate `refOwners(graph)` (already documented
  as *the* seam for this) and build `Map<nodeKey, KbBacklink[]>` for entity, claim and
  term targets, recording `targetAnchor` for claim/term targets. Key on the existing
  `entityKey(namespace, name)`: the "permanent internal node ID" §4 asks for is already
  in the graph, so no new identifier is minted.
- **New `validateKbSlugs(graph)`** — enforce the Phase 3.3 uniqueness table; fail the
  build on collision, matching `validateReferences` / `validateTermInsertions`.
- **New `validateKbLinks(graph)`** — the "no dangling KB link" check from D9: every
  `kbHref` must point at a page that `kbPageExists` says will be generated in this
  environment, or have fallen back to a chapter anchor.
- **`resolveRefHrefs`** — set both `href` (chapter context, unchanged) and `kbHref`
  (KB-page context) per D3, with the D3 unpublished-target fallback + warning. Keep the
  existing `throw` for an un-embedded entity (D9).
- **New `buildGlossary(graph)`** — one entry per (defining node, term key) per D5,
  sourcing terms from **all four** entity types including proofs (A8), carrying
  `canonical`, the defining node's URL + term anchor, and the inbound count from the
  backlink index; filtered by `kbPageExists`.

### F.4 Anchors — `lib/utils/{entity,claim,term}-id.ts` *(deleted; replaced by helpers in `lib/content/urls.ts`)*

Per D4, replace the three base64 helpers with slug-based ones: `#claim-{slug ?? name}`,
`#term-{slug ?? name}`, and `#{type}-{slug}` for an entity embedded in a chapter. Call
sites: `EmbeddedEntity`, `ClaimBlock`, `InlineText`, `resolveRefHrefs`. Keep three
small modules so the import graph is unchanged.

**Review gate.** Unit tests for `validateKbSlugs`, `kbPageExists`,
`buildBacklinkIndex`, `buildGlossary` and the anchor helpers; `next build` green with
no page-layer change yet.

---

## G. ~~Phase 5 — URL layer~~ — absorbed into phase 4 *(DONE)*

Kept as a heading only so the numbering change is visible. Everything below shipped
with phase 4: the KB `ContainerKey`s and labels, the ten KB `UrlKey`s (three of them
for a remark, so the segment-count check stays exact), the node→URL helpers, and
`kbRefs`. The `anchors` dictionary and the three anchor helpers were added on top —
see §Shipped.

<details><summary>Original phase-5 text</summary>


1. **`lib/i18n/locales.json` + `config.ts`** — the new `ContainerKey`s and `LabelKey`s
   from D8.
2. **`lib/i18n/url.ts`** — new `UrlKey`s: `kb-root`, `definitions-index`,
   `theorems-index`, `glossary`, `definition`, `theorem`, `proof`, and — because
   `req()` enforces an exact segment count while a remark's parent chain is
   variable-length — **three** remark keys: `definition-remark` (2 slugs),
   `theorem-remark` (2 slugs), `proof-remark` (3 slugs). Splitting the key keeps
   `req()`'s exactness rather than weakening it for one case.
3. **`lib/content/urls.ts`** — `urlForDefinition`, `urlForTheorem`, `urlForProof`,
   `urlForRemark` (dispatching on `attachedTo.type`), `urlForKbRoot`,
   `urlForDefinitionsIndex`, `urlForTheoremsIndex`, `urlForGlossary`, plus
   `anchorForClaim(node, claim)` / `anchorForTerm(node, termKey)` returning
   `{canonicalUrl}#{anchor}`. Each reads `node.locale`, like `urlForChapter` today.
4. **`kbRefs(refs)`** helper (A20) — shallow-remap a RefMap to KB-page hrefs.

**Review gate.** Unit tests asserting each helper against the §3 examples, and that no
KB URL is constructed outside `buildLocalizedUrl` (the i18n doc §5 invariant-test
pattern).

---

</details>

---

## H. Phase 5 — Routing and pages (`services`) *(DONE — see §Shipped)*

> **DONE.** All 21 phases of the
> [page-layout sub-plan](yp-162-page-layout-sub-plan.md) are built, on
> `feat/yp-162-page-layout-design`. **What actually landed is
> [its §12](yp-162-page-layout-sub-plan.md#12-what-actually-landed)** — the commits, the
> divergences, the final measurements and what is still outstanding — and §Shipped above
> summarizes it. This section is kept as the record of the requirements phase 5 was held
> to, not as a description of the code.
>
> **This section was never the specification of the pages.** The
> [page-layout sub-plan](yp-162-page-layout-sub-plan.md) settled what every
> knowledge-base page contains and how it is arranged, and
> **[its §10](yp-162-page-layout-sub-plan.md#10-phases) was the build order for this phase** —
> 21 narrow phases, from the two data shapes it needed, through the four list pages, to
> the entity page and one interaction at a time.
>
> What survived below: **H.1** (routing) and **H.4** (titles), as the requirements they
> are, each annotated with the sub-plan phase that owned it, and both discharged. What
> did not: **H.2**'s component table and **H.3**'s interaction sketch, both written
> against the pre-sub-plan design and replaced in place by a pointer. **Neither is a
> description of anything that exists, and neither is work anybody still owes.**
>
> **The [identifiers-and-anchors sub-plan](yp-162-identifiers-and-anchors-sub-plan.md)
> is complete**, so this is no longer gated on it. What it settled and shipped, which
> the knowledge-base pages render: anchors are localized dotted paths
> (`definiciok.{d}.fogalmak.{f}`), reference targets are fully qualified names
> (`theorems.{t}.proofs.{p}`), the graph's map keys are those same names, and every
> name and slug obeys one character rule and one uniqueness scope.
>
> **The backlink index no longer exists**, and the page-layout sub-plan rebuilds it.
> `graph.backlinks`, `KbBacklink`, `targetAnchor` and `GlossaryEntry.referencedBy` were
> removed in the identifiers sub-plan's S4: nothing rendered them, and they were
> written against the reference-target shape that sub-plan replaces. **Sub-plan phase 2**
> rebuilds the index — a pure fold over `refOwners`, keyed on fully qualified name
> targets rather than the old composite shape, grouped by source with a count per
> source and filtered by `kbPageExists` — and **sub-plan phase 3** puts `synonyms` back
> on the glossary projection. Everything that reads that data waits on those two
> phases: the "Bejövő hivatkozások" panel, its per-term and per-claim variants, and
> [D7](#d7--do-chapter-and-section-referrers-appear-in-referenced-by-settled).
> **The glossary's inbound count (F.3) is not rebuilt at all** — the sub-plan's §4 drops
> the "referenced by N nodes" figure from the page, so nothing needs it.
>
> *Both are done.* Sub-plan phase 2 rebuilt the index as described — `graph.backlinks`
> is a `Map<string, KbBacklinks>` with an `all` list and a `byTarget` map, grouped by
> source, count-ordered, `kbPageExists`-filtered — and phase 3 put `synonyms` back on
> `GlossaryEntry`. The glossary's inbound count was not rebuilt, as planned.


### H.1 Routing — `app/[locale]/[[...path]]/page.tsx` *(DONE)*

*Discharged by **sub-plan phases 5 and 9**: phase 5 did depths 1–3 —
the KB root and the three index pages, `ogType: 'website'`, and the `ROUTABLE_AT_ROOT`
flip for `knowledge-base` (the other KB keys stay `false`, which is what keeps
`/hu/definiciok` a 404); phase 9 did depths 4–6 — the four entity kinds,
`generateStaticParams` filtered by `kbPageExists`, `ogType: 'article'`, and the
per-node excerpt (`lib/content/kb-excerpt.ts`, 17 tests). The split was forced by the
postbuild anchor gate, which starts checking fragments into an entity page the moment
that page exists — and it worked: both phases shipped with a green gate.*

- Extend `Resolved` with `kb-root`, `definitions-index`, `theorems-index`, `glossary`,
  `definition`, `theorem`, `proof`, `remark`.
- `resolvePath`: a `key0 === 'knowledge-base'` branch handling depths 1–6, plus early
  rejection of `definition`/`theorem`/`proof`/`remark`/`term` at `path[0]` (mirroring
  the existing `if (key0 === 'chapter') return null`).
- `generateStaticParams`: entity paths filtered by `kbPageExists` (D9) + the 4 index
  paths, all derived from node `locale`/`slug`, never from on-disk names.
- `generateMetadata`: map each new kind to its `UrlKey` + `slugPath`; `ogType`
  `'article'` for entity pages, `'website'` for indexes and glossary. Entity nodes have
  no `thumbnail`, so `buildPageMeta` falls back to the generic OG image unchanged.
  **Supply a per-node `excerpt`** for the meta description (first narrative block,
  truncated) — otherwise all 389+ pages share `locale.defaultDescription`, which the
  SEO check will flag as duplicate descriptions.

### H.2 Components — ~~a ten-component table~~ superseded *(not built, and not owed)*

**Replaced wholesale by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md), and the
sub-plan has shipped — so the ten components below were never built and nobody owes
them.** What exists instead is in `apps/website/components/kb/`: `KbPageShell`,
`KbRootPage`, `KbTypeIndexPage`, `GlossaryPage`, `ListFilter`, `KbEntityPage`,
`OwnershipLinks`, `EntityChrome`, `MenuStack`, `Overlay`, `Panel`, `ArrivalMarker`,
`HighlightOnArrival`, and five panel contents under `panels/` — `ContextPanel`,
`BacklinksPanel`, `TermPanel`, `ClaimPanel`, `ReferencePanel`.
[The sub-plan's §12.1](yp-162-page-layout-sub-plan.md#121-the-21-phases-and-their-commits)
maps each to the phase and commit that added it.

The ten components listed here were never the structure being built. They assumed the
stacked arrangement of design-plan §7 — a `ReferencedBy` block, an `EmbeddingContext` block, a
per-type page component each — and the sub-plan arranges the same information
differently: one entity-page component with a header, a body and ownership-chain links
below it ([§6.1](yp-162-page-layout-sub-plan.md#61-the-header-and-the-content)), plus a context
menu, an overlay and a single panel whose contents vary
([§6.2–§6.4](yp-162-page-layout-sub-plan.md#62-the-context-menu)). Its
[phase table](yp-162-page-layout-sub-plan.md#10-phases) is the file-by-file list, and each phase
there names the components it adds.

**One requirement from this subsection still held**, and sub-plan phase 9 discharged it:
bodies reuse `ContentBlocks` / `EmbeddedEntity` / `InlineText` verbatim, with `refs`
passed through `kbRefs()` (A20), and the chapter-scoped `embedIndices`/`figureIndices`
borrowed from the node's embedding chapter (A17).

### H.3 F2 — ~~claim/term ↔ backlink cross-highlighting~~ superseded *(not built, and not owed)*

**Replaced wholesale by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md), and the
sub-plan has shipped.** The sketch here — every term span and claim block rendered with
`button` semantics and `aria-pressed`, bidirectional highlighting against a flat
"Referenced by" list keyed by `data-target-anchor` — **was not built and is not owed.**
Nothing in the code has an `aria-pressed` attribute on a term or a claim; terms are
`<span class="term">`, claims are `<div>`s, and the selection model is the context
menu's two modes. See the sub-plan's
[§11](yp-162-page-layout-sub-plan.md#11-out-of-scope), which defers keyboard and screen-reader
access to the entity-page chrome as its own piece of work, and records that terms stay
non-focusable `<span>`s and claims stay `<div>`s.

What the sub-plan built instead, for the same purpose of connecting a term or claim to
what cites it — all of it now in the code:

- The context menu's **"Fogalmak"** and **"Állítások"** modes dim the page, reveal the
  terms (or claims) in the body, and let the reader pick one; the panel then shows that
  one's inbound references
  ([§6.2, §6.3](yp-162-page-layout-sub-plan.md#62-the-context-menu)). Pointer interaction only.
  Sub-plan phase 15 is the reveal, phase 16 the panels: `TermPanel` and `ClaimPanel`.
- The correspondence is keyed on the **fully qualified name**, not on an anchor id:
  every rendered reference carries `data-target-fqn`, a source row appends the FQN to
  highlight as a query parameter at click time, and the arrival page marks the matching
  references and scrubs the parameter — sub-plan
  [D7](yp-162-page-layout-sub-plan.md#8-decision-log), built in its phase 19 as
  `lib/kb/highlight.ts` + `components/kb/HighlightOnArrival.tsx`. **17 902**
  `data-target-fqn` attributes across the export, over 651 distinct values.
- Nothing is JS-gated, which was the one commitment worth keeping from this
  subsection: **all panel content is server-rendered** and merely revealed (sub-plan
  §2.1, D6), so crawlers and no-JS readers still see every body and every
  inbound-reference list. Sub-plan phase 20 tightened this from "served" to "served
  *and visible*" for the no-JavaScript reader, without changing the served bytes.

The two details flagged here as assumptions went with the sketch.

### H.4 Titles *(DONE)*

*Discharged, with the correction below, by **sub-plan phases 5 and 9**.*

Implement the D1 fallback chain in one helper so every consumer (`<title>`,
breadcrumb leaf, index row, backlink row) agrees:
`title ?? ownerDerivedTitle ?? "{index} {Label}" ?? "{Label}"`. That helper is
`kbNodeTitle`, and it is what every place a node needs a **standalone** name uses.

**The page's own H1 is the exception.** The entity page's header is two lines — the
label, then the title — so a proof, which carries no authored title, would print
`BIZONYÍTÁS` above `Bizonyítás: {theorem title}`: the derived title is built from the
same word as the label. The header therefore reads `node.title` directly and shows the
label alone when there is none (sub-plan
[§6.1](yp-162-page-layout-sub-plan.md#61-the-header-and-the-content) and its §9.1 note 9,
which measures this at 262 of the 537 pages). Phase 9 made that call explicitly, and
262 is exact: **190 of 190 proofs and 72 of 72 remarks carry no authored `title`**,
while all 84 definitions and all 191 theorems do.

**Review gate.** **21 gates, not one** — each sub-plan phase carried its own, and all
21 passed their command half. The two that moved the page count were its phase 5 (46 → **50** in both env
modes) and its phase 9 (**439** with `SITE_ENV=staging` / **587** locally); both landed
on those numbers exactly. The A18 baseline quoted here is stale: measured on the layout
branch, the pre-phase-5 build was **14.3 s for 46 pages** in both modes, not 16.66 s for
52. **Measured at the end of the run: 22.780 s for 587 pages locally and 21.811 s for
439 on staging** — see R8 and
[the sub-plan's §12.3](yp-162-page-layout-sub-plan.md#123-the-measurements).

**Four of the 21 gates have not had their human half.** The interaction reviews for
sub-plan phases 15–18 — the level-1 reveal, level 2 on a long body, modified-click
behaviour, and a real cross-chapter arrival — all have browser tests asserting the
mechanics and none has been looked at by a person. They are **outstanding, not passed**;
recorded in [the sub-plan's §12.5](yp-162-page-layout-sub-plan.md#125-unresolved--stated-not-fixed).

---

## I. Phase 6 — Sitemaps, robots, lastmod (`services`) — **DONE** (`e75d4ee`)

> **Where it started.** At the end of phase 5 `out/sitemap.xml` carried **31** `<loc>`
> entries against **587** pages, `app/sitemap.ts` contained no knowledge-base URLs and
> `scripts/split-sitemap.mjs` did not exist — the sitemap was the first thing standing
> between 541 knowledge-base pages and being indexed at all. It now carries **572**
> URLs locally and **424** on staging, behind an index of 8 child sitemaps.

1. **`app/sitemap.ts`** — **done as specified.** The entity pages are filtered by
   `kbPageExists`, and the knowledge-base root, both type indexes and the glossary are
   listed alongside them; landing pages stay excluded and claims and terms are not
   separately sitemapped, each being a fragment of a page that is. One addition the
   item did not ask for: those four pages have no source file of their own, so each
   carries the **latest `lastmod` of what it lists** (`latestOf`) rather than none —
   the glossary's is computed over the nodes that actually define a term.
2. **`scripts/split-sitemap.mjs`** — **done, and split in two.** The postbuild script
   is a thin wrapper; the grouping rules and the group table live in a pure
   **`scripts/lib/sitemap-split.mjs`**, which is what let the **11 unit tests** run on
   a fixture XML with no export present. Four divergences from the prediction, all in
   the same direction — nothing about a particular language ended up in the script:
   - **The file list is not fixed.** Each group's file is named after that group's
     segment *in the URL's own locale*, so a second locale writes its own files
     instead of sharing `hu`'s words. `sitemap-cikkek.xml` does not exist today
     because no article is published — **8 children, not the 9 predicted**.
   - **Grouping is by depth, not by "URL shape".** Outside the knowledge base a URL
     groups with the container it *opens* with (a chapter lists with its book); inside
     it, with its **deepest** container — the type whose index page lists it — so a
     proof groups with proofs and not with the theorem it proves.
   - **`locales.json` gained a `sitemapGroups` block** (typed in `lib/i18n/config.ts`).
     The `page` group covers the home page, the knowledge-base root and the standalone
     pages, none of which carry a container segment, so there was no name to derive its
     file from. Unforeseen, and the only new data this phase added.
   - **An unclassifiable URL is a hard error**, not a silent drop. The predicted
     allowlist exists as `SITEMAP_GROUPS` with `landing` present and `inIndex: false`,
     so a landing page reaching the sitemap is held out rather than indexed by
     accident; and the script is idempotent — a `postbuild` re-run over an
     already-split export detects the index and exits.
3. **`scripts/gen-content-lastmod.mjs`** — **done as specified.** The type comes from
   the document's own `type` field (a knowledge-base file is named after its entity, so
   a filename map saw none of them) and the per-file `git log` is now a single
   `git log --name-only --format=%x00%cI` pass, with the date line NUL-prefixed so it
   cannot be mistaken for a path. **806 entries**, knowledge-base entities included.
4. **`app/robots.ts`** — **unchanged, as predicted.** `/sitemap.xml` is still the
   entry point; it is now the index.
5. **No Terraform change** — confirmed: `.xml` is already an asset extension, so the
   child sitemaps are served without the `.html`-append transform.

**Review gate — passed, re-verified for §L.** On the staging export: `out/sitemap.xml`
is a `<sitemapindex>` listing **8** children, the children hold **424** unique `<loc>`
entries, **every one of them resolves to a file in the export**, and 424 is exactly the
pre-split count the splitter reported. Locally the same holds at 572.

---

## J. Phase 7 — Navigation, discovery, internal linking (`services`) — **DONE** (`529f953`)

> **Where it started.** At the end of phase 5 no knowledge-base page was reachable from
> the site's navigation or its homepage: `SiteHeader`'s `navLinks` were the two
> hardcoded literals `'Cikkek'` and `'Hírek'`, and the locale homepage had no
> knowledge-base block. J.1 and J.2 were the difference between 541 *built* pages and
> 541 *discoverable* ones, and they gated §K as well — the crawl seeds at the homepage
> and cannot reach what nothing links to. **Measured now on the staging export: 434 of
> its 439 pages are reachable from `/hu` by following links, and the deepest sits 3 hops
> from it.**

1. **`SiteHeader`** — **done, and generalized further than asked.** The nav is a
   `NAV_ITEMS` table of `{ labelKey, urlKey }` pairs — the knowledge base first, as on
   the homepage — so every label comes from the locale dictionary and every href from
   `buildLocalizedUrl`: nothing in the component spells a word or a path. That
   discharges A16 for the nav.
2. **`RootHome`** — **done, as three cards rather than a link.** The homepage block is
   the same card set the knowledge-base root page offers, which is why the phase also
   produced **`lib/content/kb-sections.ts`**: the set is derived once and rendered
   twice (`KbSectionCards`), so the two surfaces cannot disagree about what the
   knowledge base contains. The counts come from `kbPageExists`, the same predicate the
   entity routes are gated on, so a card cannot advertise a number the page it links to
   contradicts. Plain links throughout — nothing here needs JavaScript. `SectionHeading`
   gained a `labelHref` so the heading itself leads to the knowledge-base root, which
   makes the root **one** hop from the homepage and each index two.
   **7 new unit tests** (`kb-sections`, plus `kb-sections-deployed` for the
   environment-gated counts).
3. ~~Breadcrumbs~~ — **moved to sub-plan phase 5 and discharged there**, as
   `lib/content/kb-breadcrumbs.ts` with 7 tests covering all seven chains. This phase
   added the piece that was left: **`lib/content/breadcrumbs.ts`**, so the three crumbs
   that are nobody's own page — the site root and the two standalone index pages — take
   their labels from the locale dictionary in one place instead of as literals at each
   call site. That is the rest of A16.
4. **Verify D3 end-to-end** — **done**; it is R6, discharged in §N. The end-to-end
   evidence is now larger than when that was written: `check-anchors` resolves
   **23 958** internal fragment links across the 587-page local export with **0 broken**.

**Review gate — passed, re-verified for §L.** A link-graph walk of the staging export
from `/hu`: **434 pages reachable, maximum depth 3, zero sitemap URLs unreachable
(no orphans), and zero link targets with no exported page.** The 5 unreachable files are
all deliberate — `404.html`, the root redirect stub, the two noindex container roots
(`/hu/konyvek`, `/hu/landing`) and the unlisted landing page — and none of them is
sitemapped, so none would surface as an orphan finding.

---

## K. Phase 8 — Quality gate and tests — **items 1–4 DONE (`30005db`); item 5 REMAINS**

> **The test half of this phase happened during phase 5 instead**, phase by phase, and
> came out larger than this list ever asked for. The counts as of this close-out:
> **223 unit tests** against a baseline of 96, and **126 browser tests in 10 files**
> that this list never anticipated — Playwright was added mid-run because the menu's
> history contract cannot be asserted outside a browser. What this phase itself did is
> the deploy-facing half: the crawler caps, the orphan check under a sitemap index, the
> SEO confirmation, and the CI wiring for both suites. **Only item 5 — a crawl of a live
> staging deploy — is still owed, and it is the last thing this whole plan owes.**

1. **`tools/smoke-tests/scripts/crawl.mjs`** — **done, and the prediction behind the
   depth number was wrong.** `MAX_PAGES` is `1000` (against 439 pages on staging, 587
   once the five unpublished chapters ship) and `MAX_DEPTH` is `7`. But the reason
   given here for 7 does not hold: the shortest chain to the deepest entity page is
   *not* 5 hops down the ownership chain, because **the type index lists link every
   entity page directly**. Measured on the staging export, **every one of its 434 linked
   pages sits within 3 hops of `/hu`** (17 at depth 1, 230 at depth 2, 186 at depth 3),
   so 7 is headroom for a nav that grows rather than a fix for an at-the-limit depth.
   `cappedAtMaxPages` is gone: truncation is now a **`crawlLimits` finding**, summed
   into `buildCrawlerSuite`'s fatal count and printed in the quality-gate summary, so it
   lands in the JSON artifact and fails the suite instead of being a `console.log`.
   `CONCURRENCY` stayed at 5 — the crawl did not become slow.

   **And one thing this list did not foresee, which phase 6 made mandatory: the orphan
   check had to learn the sitemap index.** An index's `<loc>` values are child
   *sitemaps*, not pages, so cross-referencing them against crawled pages would have
   matched nothing and reported **every child sitemap as an orphan** — the gate would
   have gone red on a correct site. `collectSitemapPages` follows the index one level
   down and unions the children's pages, re-basing each child URL onto the crawl's own
   origin (the sitemap advertises the canonical host; the crawl may be running against a
   per-environment one), and it *reports* an unusable child rather than dropping it.
   `isSitemapIndex` in `lib/extract.mjs` is the branch, because a `<urlset>` and a
   `<sitemapindex>` are indistinguishable from their `<loc>` elements alone. **6 new
   tests** in `tools/smoke-tests/tests/orphan-check.test.mjs`, and `report.test.mjs`
   extended for the new fatal category.
2. **Confirm `checkSeo` passes on each new page kind** — **the fatal half passes; the
   warning half does not, for a reason that predates the knowledge base.** Replaying the
   crawler's own rules over the staging export: **435 of 439 pages carry a canonical and
   were checked, with 0 fatal findings** — across all six entity-page shapes and the
   four list pages, no page is missing a `<title>`, a meta description, an
   `hreflang`, the `x-default`, or any of the seven required OpenGraph properties, and
   every `og:image` resolves to a file in the export.

   The thresholds are the finding. **341 of those 435 pages have a `<title>` over the
   70-character warning threshold, 307 of them knowledge-base pages** — and that is structural rather than a
   content problem: the `<title>` is `{page title} | {brand}`, the brand string alone is
   39 characters, so 42 of the 70 are spent before the page's own title begins and
   anything over 28 characters warns. It is pre-existing — **34 of the 44
   non-knowledge-base pages under `/hu` already warn**, every chapter of the book among
   them — and the knowledge base took the count from 34 to 341. Descriptions, by
   contrast, are almost all in band — **20 of 435 out of range** (11 over 160, 9 under
   50; 17 of the 20 knowledge-base), which discharges the duplicate-description risk
   H.1 flagged: `lib/content/kb-excerpt.ts` is producing distinct, correctly sized
   descriptions. None of this fails the gate — they are warnings — so shortening the
   brand suffix or raising the crawler's threshold is a backlog item, not a blocker.
3. **New unit tests in `apps/website/test/`** — **done, and the one gap is closed.** The
   sitemap splitter now has the 11 tests it could not have before §I existed. The
   reconciliation table below still holds; the total is **223 tests in 18 files**, up
   from the 202 in 15 recorded when this list was written.
4. **Assert `<html lang>` on the new pages** — **unchanged: covered, not asserted at
   build time.** `set-html-lang.mjs` reports `scanned 587 HTML file(s), rewrote lang on
   0` locally and 439/0 on staging — every page already carries the right `lang`, which
   is evidence rather than an assertion. The live crawler asserts it per page, fatally,
   which is where the guarantee actually lives.
5. **Run the crawler against a staging deploy** — **NOT DONE, and it is the only item
   left in this plan.** It cannot be done from here: no CI deploy has run since
   2026-08-18 and this branch has never been deployed, so no staging environment
   contains any of phases 5–8. Everything about it that *can* be checked offline has
   been, and is clean — the link-graph walk in §J found **zero orphans and zero link
   targets with no exported page** on the staging export, which is what the crawl's two
   fatal categories look for. What only the live crawl can add is HTTP-level truth:
   real status codes, redirect behaviour, `<html lang>` as served through R2 and the
   CDN, `og:image` fetches, response times, and the caps under real concurrency.

**Three things this list did not ask for, which the phase delivered anyway:**

- **`check-anchors.mjs` stopped failing the build on a correct forward reference.** An
  unpublished chapter's page *is* in the export, but it renders the not-migrated stub
  and none of the chapter's own anchors — so a reference into a section of such a
  chapter was being reported as id drift. It is now skipped by detecting `data-stub`,
  and counted in its own skip category. This is what retired **the two accepted anchors**
  §N/R5 records: on the staging export the script now reports **23 429 fragment links
  checked, 0 broken, 2 skipped because the target page is a stub**, and exits 0.
- **The browser suite became environment-agnostic.** `e2e/support/derive-fixtures.mjs`
  plus a Playwright `globalSetup` derive the expected row counts and the fixture
  entities from the content graph under the same `SITE_ENV` that built the export, so
  the same 126 tests pass against a 587-page local export and a 439-page deployed one.
  They previously hardcoded entities that exist only locally, which is why they could
  not run in CI at all. **Confirmed for §L: 126/126 pass in 53 s against a
  `SITE_ENV=staging` export**, which is the case that did not work before.
- **Both suites are now wired into CI.** The consent-only unit step became the whole
  `node:test` suite in `deploy.yml` and `deploy-to-cloudflare.yml`, and the browser
  suite runs inside the deploy's website job — between the build and the R2 upload, so
  a failure blocks the deploy rather than merely reporting it — with the Playwright
  report uploaded as an artifact on failure. It is deliberately absent from
  `deploy-to-cloudflare.yml`, which has neither a content clone nor TeX Live to build an
  export from.

**Item 3's reconciliation table, with its one gap now closed:**

| this list asked for | where it landed |
|---|---|
| URL-helper shapes | `kb-graph.test.mjs` — flat vs. nested URLs, no namespace in a URL |
| KB slug uniqueness | `kb-graph.test.mjs` + `identifiers.test.mjs` (23) — two definitions sharing a slug fails the build; two proofs of *different* theorems may share one |
| `kbPageExists` in both env modes | `kb-graph.test.mjs` — embedded-in-published has a page, embedded-nowhere never does, and a source/child whose page this build omits is dropped |
| anchor helpers | `identifiers.test.mjs` + `anchor-kind.test.mjs` (7) — localized dotted paths, page-relative claim/term anchors, no English segment survives |
| sitemap splitter | `sitemap-split.test.mjs` (11) — grouping by opening vs. deepest container, per-locale file names, a held-out group, and four inputs it refuses to guess at |
| `kbRefs` remapping | `kb-graph.test.mjs` — two hrefs per reference, and `kbRefs` swaps in the KB one and leaves other entries alone (R6) |
| backlink index (moved to sub-plan phase 2) | `kb-graph.test.mjs` — grouping and count order, claim/term references counting for their owner, row hrefs, no entry at all when nothing cites, page-existence filtering |
| glossary (moved to sub-plan phases 3–4) | `kb-graph.test.mjs` + `glossary-rows.test.mjs` (9) — synonyms on the projection, one row per name, Hungarian collation, and the six strings that are both a synonym and someone's canonical form |

**And ten test files this list did not ask for**, one per phase that needed one:
`kb-chrome` (32 — the chrome state machine and D2's one-back-step contract),
`kb-excerpt` (17), `highlight-param` (8 — D7's validation, the one place a URL value
reaches a selector), `locale-labels` (7), `kb-breadcrumbs` (7), `filter-text` (6),
`kb-sections` (5) and `kb-sections-deployed` (2) from §J, plus `fqn` (14) and
`doc-examples` (1) from earlier phases. On the smoke-test side, `orphan-check` (6) is
new and `report` (6) grew.

**One trap found while re-running the browser suite for §L, worth knowing before
someone loses an afternoon to it.** Every one of those tests dismisses the cookie
banner unconditionally (`settleConsent` clicks *Elutasítom* and waits for it to
disappear), so the suite **requires an export built with a GA measurement id**. Build
with `NEXT_PUBLIC_GA_MEASUREMENT_ID=` — the documented way to disable analytics — and
the banner is compiled out entirely, the click waits for a button that will never
exist, and **85 tests fail on a 30-second timeout each** for a reason that has nothing
to do with what they assert. CI is unaffected (the id is a per-environment variable),
and the failure is loud rather than silent, so this is a note and not a defect.

**Review gate.** Items 1 and 2 are discharged above. **Item 5 is the open one**, and it
unblocks the moment this branch reaches `development` and the staging deploy runs.

**One gate this run never had, and it is worth knowing: `pnpm lint` is unusable.**
`next lint` is deprecated in this Next version and drops into an interactive ESLint
setup prompt, exiting 1 on an untouched tree. Pre-existing, so **no phase of the 21 had
a lint gate**. Migrating to the ESLint CLI is its own piece of work, not this one.

**And one build-script gap found on the way.** `scripts/check-analytics-build.mjs` does
not `import './lib/load-env.mjs'`, unlike `gen-cookie-policy-version.mjs`,
`gen-content-lastmod.mjs` and `set-html-lang.mjs` — so a local `SITE_ENV=staging` build
needs `NEXT_PUBLIC_GA_MEASUREMENT_ID` passed on the command line or the check reports a
mismatch against an unset id. Out of scope this run.

---

## L. Phase 9 — Documentation — **DONE**

> **The premise at the head of this phase was half wrong by the time it ran.**
> `docs/i18n-design.md` no longer described non-addressable entities: its §4a, its
> field-summary table and its §9 uniqueness table were corrected mid-run by the
> [identifiers-and-anchors sub-plan](yp-162-identifiers-and-anchors-sub-plan.md)
> (`570460d`, `0770d54`). What was actually owed there was different, and larger:
> **five other parts of that document had gone stale or incomplete** — §2 and §3
> against the URL layer of phases 4–5, §7 against phase 6's sitemap index, §9 against
> the widened reserved-slug set, and §1 against a `locales.json` key that never
> existed. Only reading the document against the shipped code surfaced them.

1. **`docs/i18n-design.md`** — the two items as listed were already done (above). Six
   corrections were owed instead:
   - **§2's URL-shape table listed none of the ten knowledge-base shapes**, though
     `lib/i18n/url.ts` cites §2 as where they are stated. Added, with the `hu`
     examples and a pointer to the `UrlKey` union — one key per shape, which is why a
     remark has three.
   - **§3's container dictionary listed 6 of the 14 keys.** Completed, with a column
     saying whether each appears in a URL, an anchor, or both, and the `locales.json`
     snippet extended to match.
   - §3 gained `isRoutableAtRoot` — the rule that makes `/hu/definiciok` a 404 while
     `definiciok` is still a reserved, localized segment.
   - **§7's "Sitemap" still said "a single sitemap".** Rewritten for what phase 6
     built: one enumerator, a postbuild splitter, the `<sitemapindex>`, the
     deepest-container grouping rule, `sitemapGroups`, the held-out `landing` group,
     and the eight `hu` children.
   - §9's rejected-slug example named three reserved anchor segments; the reserved set
     is the whole container dictionary, knowledge-base segments included.
   - Two **pre-existing errors**, unrelated to this ticket and fixed on the way:
     `locales.json` has no `defaultLocale` key — `DEFAULT_LOCALE` is a build-time env
     var, shared with the Cloudflare apex redirect — but §1 and the data-shape snippet
     both said it did.
2. **`docs/content-site-and-static-generation.md`** — this one was as stale as the
   phase predicted: it still said "the routes that would serve them are not generated
   yet, so the export currently contains no knowledge-base pages". Replaced by a
   **"Knowledge-base pages, and which entities get one"** section carrying the
   two-address model, D9's two conditions and the single function they live in, the
   measured page-set table, and the three layers that stop the divergence from
   producing dead links. The canonical-URL table gained seven knowledge-base rows;
   `SITE_ENV` and the chapter `published` field now say they gate the page set and not
   only the noindex; the noindex section points at the sitemap index. Both of
   `docs/README.md`'s summary rows were updated with it.
3. **`content/docs/content-model.md`** — re-verified against the shipped behaviour
   and found accurate, including the four URL shapes, the uniqueness table and the
   correction that `terms` applies to proofs. Two additions: the **page gate** an
   author needs (publishing the embedding chapter is what publishes the entity's
   page), and the proof/remark **title derivation spelled out** — the type label is
   the authored `labels.canonical` when there is one, an untitled remark on an
   untitled proof reads `Megjegyzés: Bizonyítás: {tétel címe}`, and an owner-less
   remark falls back to its narrative label.
4. **The plan documents.** Two pieces, one owed and one found.

   **Owed:** `docs/plans/yp-162-knowledge-graph-urls-plan.md` — the §3.3 and D9 wording
   this phase carried. §3.3 gains an amendment note: the anchor form is not the draft's
   `#claim-{slug}` but the page-relative dotted path, and a claim's and a term's
   `slug` is **authored Hungarian** rather than derived from its English key — which
   is why the editor had to stop deleting them. A new §3.6 records D9 with the
   measured page counts. §7 was already amended by sub-plan phase 1, and its status
   line now reads Built rather than "through phase 5".

   **Found:** **§§I, J and K of this document still read as predictions.** Phases 6–8
   had shipped in `e75d4ee`, `529f953` and `30005db` without their sections being
   closed out, so the plan claimed "NOT STARTED" over work that was live in the branch
   — and one of them ("`MAX_PAGES` is still 500") was actively misleading. All three are
   now close-outs in the same form as this one, with every number re-measured rather
   than carried forward. That surfaced **two wrong predictions** (§I item 2's fixed
   child-sitemap file list; §K item 1's 5-hop depth), **one unforeseen requirement that
   phase 6 imposed on phase 8** (the orphan check had to learn the sitemap index, or the
   gate would have gone red on a correct site), **one finding** (§K item 2's title
   lengths), and **one item that is genuinely still open** — §K item 5, the live staging
   crawl. R3 and R5 in §N were updated to match; R3 is now discharged.

**Verified, not copied.** Every number in the new prose — in the docs and in the four
close-outs — was measured during this phase:

- **Two clean builds.** `pnpm build` → **587** HTML pages, **541** knowledge-base, 8
  child sitemaps, 572 sitemap URLs, 806 `lastmod` entries; `SITE_ENV=staging pnpm build`
  → **439** and **393**, 424 sitemap URLs. The staging run's `postbuild` exits 1 at
  `check-analytics-build` — **confirmed to be the gap recorded at the end of §K and not
  a build problem**: the measurement id is in `.env.local`, `next build` inlines it, and
  that one script reads `process.env` without importing `load-env.mjs`, so it alone sees
  it as empty. It fails *after* the export and the sitemap split, so the counts come
  from a complete export.
- **The sitemap index** (§I's review gate): 8 children, 424 unique `<loc>`s, every one
  resolving to a file in the export, summing to the pre-split count.
- **A link-graph walk of the staging export** from `/hu` (§J's review gate, and the
  whole-path half of R5): **434 reachable, max depth 3, 0 orphans, 0 link targets with
  no exported page.** The 5 unreachable files are `404.html`, the root redirect stub,
  the two noindex container roots and the unlisted landing page — none sitemapped.
- **The crawler's `checkSeo` rules replayed over the export** (§K item 2): 435 pages
  checked, **0 fatal**, and the title-length finding above.
- **`check-anchors` in both env modes**: 23 958 fragment links / 0 broken locally,
  23 429 / 0 broken / 2 stub skips on staging.
- **The suites**: 223 unit tests pass; the 12 pure smoke-test units pass
  (`redirects.test.mjs` needs a live `WORKER_DOMAIN`, is unrelated, and did not run);
  and **all 126 browser tests pass in 53 s against the 439-page staging export**, which
  is the first independent confirmation of §K's derive-fixtures work — the same suite
  that was written against a 587-page local one.
- **Every relative link and `#anchor`** in the touched documents resolved against its
  target file.

**Review gate.**

---

## M. Out of scope

Already excluded by the design plan:

- **JSON-LD / structured data** (§5) — separate backlog item.
- **Slug-rename redirect infrastructure** (§6) — no `terraform/redirects/` root, no
  bulk redirect lists, no ruleset rule. The two unresolved §8 questions (Cloudflare
  list entry limits; whether the list must exist before the zone-root apply) belong to
  that ticket.
- Namespace-mirrored URLs, dual-serving, worker-based redirects, standalone claim/term
  pages (§9).

Added by this analysis:

- **A curated `consequences` relation** in the content model — needed before any
  genuine "Consequences" block could exist; not the same thing as "Referenced by" (D6).
- **Authored titles for proofs and remarks** — derived, per D1.
- **Namespace pages.** Namespaces stay non-addressable path strings; three
  `namespace.yaml` files carry an unused `children` list, which this ticket does not
  read.
- **Editor UI for KB slugs.** Phase 2 makes the editor *preserve* them; it does not add
  a field to edit them.
- **Multi-locale KB content.** Everything is built per-node-`locale` — including the
  anchor prefixes — so a second locale needs no code change, only a `locales.json`
  entry. No `en` KB content is produced.
- **The 486 references with no `display`.** They render a visible `ref-error`, but
  only in the five unpublished chapters, which are stubs on any deployed
  environment. They resolve as those chapters are finalized; see §Shipped.
- **Three pre-existing ticket references in source** (`quality-gate.mjs`,
  `report.mjs`, `notify-services.yml`) — left in place by decision. Note two of them
  cite a ticket-named plan document, so removing them properly means renaming that
  document too.

---

## N. Risks

| # | risk | mitigation |
|---|---|---|
| ~~R1~~ | **Title generation quality** — *discharged.* 178 proposed, 88 overridden on review, all applied from the reviewed table | — |
| R2 | **Thin content** — most proof/remark pages have no inbound references at all | Accepted (David), but **the mitigation recorded here is void**: it leant on "Uses" and "Defined terms", and the page-layout sub-plan builds neither ("Uses" is its D8; defined terms become the Fogalmak mode). What is left is real: an explicit empty state — "Nincs rá hivatkozás" — in the inbound-reference panel ([sub-plan §7.2](yp-162-page-layout-sub-plan.md#72-incoming-references)), and **Kontextus**, which is available on every one of the 537 entities because each is embedded exactly once (A2b). Re-measured against what the panel would actually render (sub-plan §9.1 note 3): **244 of 537** pages locally and **168 of 389** deployed reach that empty state — the earlier 257 counted authored references, including ones from sources that get no page. **Confirmed on the built export: 244 of the 537 entity pages render "Nincs rá hivatkozás", and 168 of 389 on staging.** Both mitigations exist as described |
| ~~R3~~ | **Crawler caps** (A14) degrade the production promotion gate into false orphan findings — *discharged.* | Phase 8 raised `MAX_PAGES` to **1000** against 439 pages on staging and 587 once the 5 unpublished chapters ship, and turned truncation into a **fatal `crawlLimits` finding** in the JSON artifact rather than a `console.log`, so a future overflow fails the gate instead of degrading it into false orphans. `MAX_DEPTH` went to 7, and the depth worry recorded here turned out to be unfounded: the ownership chain is not how the deepest pages are reached, because the type index lists link every entity page directly. **Measured on the staging export: all 434 linked pages sit within 3 hops of `/hu`** (17 / 230 / 186 by depth). Phase 6 also introduced a cap-adjacent failure this risk did not anticipate — an index's `<loc>`s are child sitemaps, so the orphan check would have called every child an orphan; it now follows the index one level down (§K item 1) |
| ~~R4~~ | **Editor data loss** on claim/term `slug` — *discharged.* Fixed and installed before phase 3, and verified on the real tree: on a sample the old writer destroyed all 27 claim and 19 term slugs, the new one loses none | — |
| R5 | **Dev/deployed page-set divergence** (D9) — a KB link that works locally 404s on staging | Four layers, all shipped. `validateKbLinks` throws on a cross-reference resolving to a page this build does not generate; `buildBacklinkIndex` filters every backlink row by `kbPageExists` and the ownership-chain links drop a child whose page is absent — the optional links are dropped, the authored ones are fatal (both with tests); `check-anchors` resolves the fragment links against the export. **The two accepted anchors are gone**: they were forward references into an unpublished chapter's stub, which the script now classifies as a skip rather than id drift, so `SITE_ENV=staging` reports 23 429 links checked, **0 broken**, 2 skipped, and exits 0. `check-anchors` still validates fragment links only, so the whole-path case was checked separately for §L by walking the staging export's link graph: **0 link targets with no exported page, 0 sitemap URLs unreachable.** Live-crawl confirmation over real HTTP remains — §K item 5, the plan's last open item |
| ~~R6~~ | **Two-href complexity** (A20) — a reference rendered in the wrong context links to the wrong place, silently — *discharged.* | The machinery held. Both hrefs are resolved at build time, `kbRefs` remaps at one page boundary, and three tests in `kb-graph.test.mjs` pin it: a reference gets a chapter href *and* a KB href, a claim reference resolves to the slug anchor in both contexts, and `kbRefs` swaps in the KB href while leaving other entries alone. The end-to-end evidence is the postbuild gate at the new scale: **22 594 internal fragment links across 587 pages, 0 broken and 0 skipped** locally, and 22 335 on staging with only the two accepted. A reference rendered into the wrong context at that volume would have produced a broken fragment |
| ~~R7~~ | **Stale dev graph cache** — *discharged.* `RawGraphData.version`, invalidated on mismatch | — |
| ~~R8~~ | Build time growth (A18) — ~11× the page count — *discharged.* | Re-measured on the finished build: **`pnpm build` including `prebuild` and `postbuild` is 22.780 s for 587 pages locally and 21.811 s for 439 on staging**, against a pre-phase-5 baseline of **14.3 s for 46**. So **12.8× the pages cost 1.59× the wall time** — the per-page cost fell by roughly an order of magnitude, because the fixed `prebuild` generators dominate a 46-page build and are amortised over 587. `next build` itself compiles in 4.7 s. Not a risk |
