# YP-162: Knowledge Graph Node URLs — Implementation Plan

**Companion to:** [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md) (the design; §-references below point into it)
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`
**Status:** Revision 2 — David's review comments of 2026-08-24 folded in. Decisions D1, D2, D3, D6 and the R7 page-existence rule are now **settled**; D4, D5, D7, D8 remain open with recommendations.

> ### Working agreement
>
> **Every phase ends with a review gate.** At the end of each phase: commit and
> push to the feature branch in every affected repo, post a short summary of what
> changed and how it was verified, then **stop and wait for explicit approval**
> before starting the next phase. Do not begin the next phase — not even reading
> files or investigating — until approved. Phases 1 and 2 additionally produce a
> **review artifact** (the generated title and slug tables) that must be approved
> on its content, not just on its diff, before any content file is written.

§A is what the code and content actually look like today, measured against the
design. §B is the decision log. §C onward is the phased build.

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
  [D5](#d5--glossary-grouping-for-duplicate-terms-open).
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
  references point into the KB — see [D7](#d7--do-chapter-and-section-referrers-appear-in-referenced-by-open).
- 197/217 terms have ≥1 inbound reference (top counts 166 / 151 / 129), and
  118/150 claims do — confirming §9's corrected premise that claim references are a
  common pattern. This is what makes F2's interactive cross-highlighting worth
  building.

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

### D4 — Replace the base64 anchor ids with readable ones (open — recommendation stands)

§3.3 specifies `#claim-{slug}` and `#term-{slug}`; today the ids are base64-of-JSON.
**Recommendation: yes, in this release.** Production is indexed but pre-release,
page-level URLs are unchanged, and nothing external links a base64 fragment. Deferring
means churning the same call sites twice (`EmbeddedEntity`, `ClaimBlock`, `InlineText`,
`resolveRefHrefs`, three id helpers). D2's authored Hungarian slugs are what make the
readable form worth having, so the two land together.

### D5 — Glossary grouping for duplicate terms (open)

Per A8, 8 term keys and 9 `canonical` forms have multiple defining nodes.
**Recommendation: one glossary entry per (defining node, term key)**, sorted by
`canonical`, each showing its defining node's title so duplicates are visibly
disambiguated ("reprezentáns — *Egész számok halmaza*" / "reprezentáns — *Egész számok
maradékosztálygyűrűi*"). Grouping by `canonical` under a single entry with three
"defined in" links would hide that these are genuinely different definitions in
different contexts.

### D6 — The "Consequences" block (settled)

**Removed.** It has no backing data (A10) and would duplicate "Referenced by".
§7.2 loses the bullet; nothing replaces it.

### D7 — Do chapter and section referrers appear in "Referenced by"? (open)

332 references into the KB come from chapters and sections (A9).
**Recommendation: yes**, rendered in the same flat "Referenced by" list as KB
referrers (F2 removes the grouping), labelled by chapter/section title so the
narrative origin is legible. It is the strongest internal-linking gain available.

### D8 — Container segments and labels (open — follows §3 directly)

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

## C. Phase 1 — Generated title and slug tables *(review artifact — no content written)*

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

## D. Phase 2 — Editor: preserve claim/term slugs (`youproof-org/editor`)

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

## E. Phase 3 — Content schema + backfill (`youproof-org/content`)

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

## F. Phase 4 — Loader, graph model, reverse index (`services`)

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

### F.4 Anchors — `lib/utils/{entity,claim,term}-id.ts`

Per D4, replace the three base64 helpers with slug-based ones: `#claim-{slug ?? name}`,
`#term-{slug ?? name}`, and `#{type}-{slug}` for an entity embedded in a chapter. Call
sites: `EmbeddedEntity`, `ClaimBlock`, `InlineText`, `resolveRefHrefs`. Keep three
small modules so the import graph is unchanged.

**Review gate.** Unit tests for `validateKbSlugs`, `kbPageExists`,
`buildBacklinkIndex`, `buildGlossary` and the anchor helpers; `next build` green with
no page-layer change yet.

---

## G. Phase 5 — URL layer (`services`)

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

## H. Phase 6 — Routing and pages (`services`)

### H.1 Routing — `app/[locale]/[[...path]]/page.tsx`

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

### H.2 Components (new, under `components/kb/`)

| component | covers |
|---|---|
| `KbNodeShell` | shared frame: §7 breadcrumb chain, title/kicker, body, relationship sections |
| `DefinitionPage` | §7.1 — body, defined terms, remarks, referenced-by, embedding context |
| `TheoremPage` | §7.2 — statement with per-claim anchored sections, proofs, remarks, referenced-by (**no Consequences block** — D6) |
| `ProofPage` | §7.3 — body, **defined terms** (A8), remarks, "Uses" (the node's own outgoing references), embedding context |
| `RemarkPage` | §7.4 — ownership-dependent breadcrumb, body, claims, referenced-by |
| `KbTypeIndex` | §7.6/§7.7 — list + client-side filter |
| `GlossaryPage` | §7.5 — glossary entries + client-side filter |
| `KbRoot` | §7.8 — orientation page with node counts |
| `ReferencedBy` | flat backlink list + the F2 selection behaviour below |
| `EmbeddingContext` | "Appears in: book → chapter → section" (non-optional per A2b/D9) |

Bodies reuse `ContentBlocks` / `EmbeddedEntity` / `InlineText` verbatim, with `refs`
passed through `kbRefs()` (A20). `ContentBlocks` takes chapter-scoped
`embedIndices`/`figureIndices`; a KB page passes the ones borrowed from its embedding
chapter (A17).

### H.3 F2 — interactive claim/term ↔ backlink cross-highlighting

Replaces §4's *"grouped/nested by individual claim (tree-structured HTML)"*. The
"Referenced by" list is **flat** — not visually grouped by claim or term. Instead:

- Every inline term span and every claim block in the body becomes **selectable**
  (rendered as a `button`-semantics element so it is keyboard-reachable, with
  `aria-pressed`), carrying its anchor id.
- Every "Referenced by" row carries `data-target-anchor` when the reference targets a
  specific claim or term (absent when it targets the node as a whole).
- Selecting an inline term/claim highlights every backlink row whose
  `data-target-anchor` matches. Selecting a backlink row highlights the corresponding
  inline term/claim. Selection is bidirectional and mutually exclusive; clicking the
  active element again, or pressing Escape, clears it.
- Implemented as one small client component holding `selectedAnchor` and toggling CSS
  classes on already-server-rendered markup — **no content is JS-gated**, so crawlers
  and no-JS readers see the complete body and the complete backlink list.

Two details I've assumed rather than been told; say the word if either is wrong:
(a) backlinks that target the **node as a whole** are never highlighted, and when a
selection is active they dim rather than disappear; (b) selection state is not
reflected in the URL fragment (a `#claim-…` fragment still just scrolls, as it does
from an external cross-reference). Both are cheap to change.

### H.4 Titles

Implement the D1 fallback chain in one helper so every consumer (H1, `<title>`,
breadcrumb leaf, index row, backlink label) agrees:
`title ?? ownerDerivedTitle ?? "{index} {Label}" ?? "{Label}"`.

**Review gate.** `next build` emits ~587 pages locally / ~439 with `SITE_ENV=staging`;
spot-check one page of each of the 7 kinds in both modes; re-measure build wall time
against the 16.66 s / 52-page baseline (A18).

---

## I. Phase 7 — Sitemaps, robots, lastmod (`services`)

1. **`app/sitemap.ts`** — add the KB URLs (entity pages filtered by `kbPageExists`, KB
   root, both indexes, glossary), each with the same self-alternate + `lastmod`
   treatment as existing entries. Landing pages stay excluded; claims and terms are
   **not** separately sitemapped (§6.4).
2. **`scripts/split-sitemap.mjs`** (new `postbuild` step, per A12) — buckets
   `out/sitemap.xml` into
   `out/sitemap-{konyvek,cikkek,hirek,oldalak,definiciok,tetelek,bizonyitasok,megjegyzesek,fogalmak}.xml`
   by URL shape derived from `locales.json`, then rewrites `out/sitemap.xml` as the
   `<sitemapindex>`. Include a per-type allowlist so a type can be held out of the
   index without touching `app/sitemap.ts`. Unit-test the splitter on a fixture XML.
3. **`scripts/gen-content-lastmod.mjs`** (A13) — detect the type from the YAML's `type`
   field instead of the filename, and replace the per-file `git log` with a single
   `git log --name-only --format=%cI` pass.
4. **`app/robots.ts`** — unchanged; `/sitemap.xml` is now the index.
5. **No Terraform change** — `.xml` is already an asset extension (A12).

**Review gate.** `out/sitemap.xml` validates as a sitemap index; every `<loc>` in every
child file exists in the export; child entries sum to the pre-split count.

---

## J. Phase 8 — Navigation, discovery, internal linking (`services`)

1. `SiteHeader` — add a "Tudásbázis" nav link from `locales.json.labels.knowledgeBase`
   (and move the existing hardcoded `'Cikkek'`/`'Hírek'` to the same mechanism — A16).
2. `RootHome` — a knowledge-base entry block, so the KB root is reachable from the
   locale homepage and therefore from the crawler's seed.
3. Breadcrumbs — §7's chains for all seven KB page kinds, using `locales.json` labels
   rather than literals.
4. Verify D3 end-to-end: an entity reference inside a chapter page still resolves to
   the in-page anchor, and the same reference on the node's KB page resolves to the
   target's KB page.

**Review gate.**

---

## K. Phase 9 — Quality gate and tests

1. **`tools/smoke-tests/scripts/crawl.mjs`** (A14) — raise `MAX_PAGES` to 1000 and
   `MAX_DEPTH` to 7; assert `cappedAtMaxPages === false` as a **fatal** finding so a
   future overflow fails loudly instead of degrading into false orphan reports. No DFS
   refactor: the `enqueued` Set already guarantees one visit per page. Measure crawl
   wall-clock and raise `CONCURRENCY` only if the gate becomes slow.
2. Confirm `checkSeo` passes on each new page kind: self-referential canonical,
   hreflang + `x-default`, title/description within the warning thresholds, `og:image`
   resolving.
3. New unit tests in `apps/website/test/`: URL-helper shapes, KB slug uniqueness,
   `kbPageExists` across both env modes, backlink index (including `targetAnchor`),
   glossary grouping (including the duplicate `reprezentáns` case), anchor helpers,
   sitemap splitter, `kbRefs` remapping.
4. Assert `<html lang>` on the new pages (`set-html-lang.mjs` is path-driven so
   `/hu/tudasbazis/...` is already covered — assert rather than assume).
5. Run the crawler against a staging deploy and confirm zero orphans and zero broken
   internal links, especially the D3/D9 fallback links into unpublished chapters.

**Review gate.**

---

## L. Phase 10 — Documentation

1. `docs/i18n-design.md` — supersede §4a and correct the field-summary table
   (definition/theorem/proof/remark move to "Addressable"); extend §9's slug uniqueness
   table with the KB rules.
2. `docs/content-site-and-static-generation.md` — extend the [canonical URL
   rule](../content-site-and-static-generation.md#canonical-url-rule) with the KB
   paths; document the D9 published-gate and the page count going from ~46 to ~439
   (staging/production) / ~587 (development).
3. `content/docs/content-model.md` — per Phase 3.3 (already done in that phase;
   re-verify against the shipped behaviour).
4. `docs/plans/yp-162-knowledge-graph-urls-plan.md` — record the design changes this
   review produced: §3.3 term/claim slugs are authored Hungarian; §4's per-claim
   grouping is replaced by F2's interactive highlighting; §7.2 loses "Consequences";
   §7.3 gains "Defined terms"; a new "which entities get a page" rule (D9). Keep §5
   (JSON-LD) and §6 (redirects) marked out of scope.

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
- **Multi-locale KB content.** Everything is built per-node-`locale` so a second locale
  needs no code change, but no `en` KB content is produced.

---

## N. Risks

| # | risk | mitigation |
|---|---|---|
| R1 | **Title generation quality** — 178 machine-proposed Hungarian mathematical titles, of which 102 gate the launch | Phase 1 is a review artifact with an explicit override column and a rationale per row; nothing is written until approved |
| R2 | **Thin content** — 256 nodes with zero inbound references; most proof/remark pages have an empty "Referenced by" | Accepted for now (David). Proof pages lean on "Uses", "Defined terms" and embedding context, all of which have data for every node |
| R3 | **Crawler caps** (A14) degrade the production promotion gate into false orphan findings | Phase 9 raises the caps and makes `cappedAtMaxPages` fatal; staging is at 439/500 today and would overflow the moment the 5 unpublished chapters ship |
| R4 | **Editor data loss** on claim/term `slug` (A15) — now on the critical path, since D2 authors 367 of them | Phase 2 lands **and is installed** before Phase 3 writes any slug; round-trip test proves it |
| R5 | **Dev/deployed page-set divergence** (D9) — a KB link that works locally 404s on staging | `validateKbLinks` at build time + the crawler on the live staging site |
| R6 | **Two-href complexity** (A20) — a reference rendered in the wrong context links to the wrong place, silently | Resolve both at build time, remap at one page boundary (`kbRefs`), unit-test the remap, verify end-to-end in Phase 8.4 |
| R7 | **Stale dev graph cache** after Phase 4's type change (A19) | `RawGraphData.version` + invalidate on mismatch |
| R8 | Build time growth (A18) — ~11× the page count | Re-measure at Phase 6's gate; the graph itself is <600 ms, so growth is KaTeX-bound and parallelized by Next |
