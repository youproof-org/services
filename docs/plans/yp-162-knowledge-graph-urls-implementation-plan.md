# YP-162: Knowledge Graph Node URLs — Implementation Plan

**Companion to:** [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md) (the design; §-references below point into it)
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`
**Status:** Draft for review. §B lists decisions that must be settled before Phase 1 — three of them change what gets built.

This document is the result of reading the current `services` and `content` code
against the design plan. §A is what the code and content actually look like today
(with the mismatches against the design called out); §B is the decisions the
design leaves open once measured against real data; §C onward is the phased build.

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
- **`resolveRefHrefs` throws** if a referenced entity is embedded in no chapter.
  That is currently unreachable — all 537 entities are embedded — but a KB page
  makes an un-embedded entity legitimate, so the throw must become a graceful
  fallback to the entity's own canonical URL.

Measured against the content: **every one of the 537 entities is embedded exactly
once**, always inside a `section` body (never a chapter prologue/epilogue). One
exception — theorem `rsa-algoritmus-helyes-mukodese` is embedded in two chapters;
`buildEntityChapterInfo` keeps the first in iteration order (deterministic, driven
by `episodes.yaml`). This is good news for §7's *"Embedding context"* block: the
full `book → chapter → section` chain is derivable for every node today.

### A3. KB graph nodes carry no `locale` — every URL helper needs it

All 551 KB YAML files carry `locale: hu`, but the four KB loaders
([loader.ts:208-274](../../apps/website/lib/content/loader.ts#L208-L274)) never
read it, and `DefinitionNode`/`TheoremNode`/`ProofNode`/`RemarkNode`
([types.ts:215-263](../../apps/website/lib/content/types.ts#L215-L263)) have no
`locale` field. `buildLocalizedUrl(locale, …)` needs one per node, exactly as
`urlForBook`/`urlForChapter` read `node.locale` today.

### A4. No `slug` exists anywhere in the knowledge base

`grep -rl '^slug:' content/knowledge-base` → 0 of 551 files.

### A5. **Blocker: `title` is missing on 468 of the 537 entities**

| type | has `title` | missing |
|---|---|---|
| definition | 62 / 84 | 22 |
| theorem | 35 / 191 | **156** |
| proof | 0 / 190 | **190** |
| remark | 0 / 72 | **72** |

`title` is optional in the model and mostly unused. A display title **cannot** be
derived from `name`, because `name` is diacritic-stripped kebab-case
(`gyuru-reszbenrendezesenek-tulajdonsagai` → "gyuru reszbenrendezesenek
tulajdonsagai", not "Gyűrű részbenrendezésének tulajdonságai").

§7 assumes `{def-title}` / `{thm-title}` for H1, `<title>`, breadcrumb leaf, index
listing and sitemap-worthy content. With no title there is nothing to put in any of
them. This is the single largest piece of work in the ticket and it is **content
authoring, not code** — see decision [D1](#d1--titles-for-the-468-untitled-entities).

### A6. Entity names are globally unique — a flat slug space is safe

All 537 `name` values are unique across every type *and* namespace (0 collisions).
So §3.1's flat, namespace-independent slug space collides with nothing if slugs are
seeded from `name`. §3.1 asks for uniqueness within `(locale, type)`; the data is
in fact unique across all types, which is stricter.

### A7. Compositional ownership is clean and strictly 1:1

- 190/190 proofs have exactly one owning theorem. 0 orphans.
- 72/72 remarks have exactly one owner: 36 definitions, 28 theorems, 8 proofs. 0 orphans, 0 shared.
- **No theorem has more than one proof; no parent has more than one remark.**

Two consequences: §7.2's *"otherwise a neutral label (e.g. `1. bizonyítás`)"*
disambiguation has no data exercising it yet (implement it, but it is untestable
against real content), and there are currently **zero "independent" remarks** — so
the `attachedTo === undefined` branch in `buildEntityChapterInfo`'s `isIndexed`
and in [index-helpers.ts:46-59](../../apps/website/lib/utils/index-helpers.ts#L46-L59)
is dead code today.

### A8. Claims and terms — the data disagrees with §3.3 in two places

- **150 `claim` blocks**: 92 in theorems, 30 in definitions, 28 in remarks. **No
  proof carries a claim** — consistent with §2's ownership rule.
- **217 term definitions** across 82 entities: 172 on definitions, 38 on theorems,
  7 on remarks. **Proofs define no terms.**
- Claim `name`s and term keys are **English** kebab-case
  (`ring-multiplication-is-distributive-over-addition`, `integer-number`), unlike
  entity names which are Hungarian. §3.3's `#claim-{slug}` / `#term-{slug}` would
  therefore be English fragments on Hungarian pages unless slugs are authored —
  see [D2](#d2--where-slugs-come-from).
- **§3.3 says a term is defined by one node. It is not.** 8 term keys are defined
  in more than one entity, and 9 `canonical` forms are duplicated — `reprezentáns`
  and `reprezentáció` are each defined in **3** different entities;
  `is-at-most`/`is-at-least`/`is-less-than`/`is-greater-than` each in 2. The
  glossary needs an explicit grouping rule — see [D5](#d5--glossary-grouping-for-duplicate-terms).
- One term is missing `canonical` (`proper-containment` in definition
  `reszhalmaz`), so it has no glossary display name. Content fix.

### A9. The reverse-reference graph is dense, but half the nodes have no inbound links

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

- **281 of 537 entities have ≥1 inbound entity reference — 256 have none.** Proofs
  are referenced 17 times in total across 190 proofs, remarks 45 times across 72.
  So §7.3/§7.4's *"Referenced by"* block will be empty on the large majority of
  proof and remark pages. Combined with A5 (no titles), proof and remark pages are
  the thin-content risk in this ticket, not definitions/theorems.
- Referrers are **not** only KB nodes: 152 chapter-owned and 180 section-owned
  references point into the KB. Whether those appear in "Referenced by" is
  [D7](#d7--do-chapter-and-section-referrers-appear-in-referenced-by).
- Term inbound counts are healthy and make §7.5's *"referenced by N nodes"* worth
  showing: 197/217 terms have ≥1 inbound reference, top counts 166 / 151 / 129.
- 118/150 claims have ≥1 inbound reference — confirming §9's corrected premise
  that claim references are a common pattern, not incidental.

### A10. **§7.2's "Consequences" block has no backing data**

The complete set of top-level fields present anywhere in `content/knowledge-base`
is: `type`, `name`, `locale`, `body`, `references`, `remarks`, `proofs`, `title`,
`labels`, `terms`, `children` (the last only on 3 `namespace.yaml` files). There is
**no** `consequences`, `follows-from`, `implies` or equivalent relation. Logical
consequence cannot be computed from `references` — a proof citing theorem Y tells
you Y was *used*, not that the proved theorem is a *consequence* in any curated
sense. See [D6](#d6--the-consequences-block).

### A11. The URL layer only supports one-segment containers at `path[0]`

- `ContainerKey` is `book | chapter | article | newsletter | landing`
  ([config.ts:14](../../apps/website/lib/i18n/config.ts#L14)); `resolveContainerKey`
  maps a single segment.
- `buildLocalizedUrl` ([url.ts:33-59](../../apps/website/lib/i18n/url.ts#L33-L59))
  has one `case` per `UrlKey` and `req()` enforces an **exact** slug-segment count.
- `resolvePath` ([page.tsx:74-120](../../apps/website/app/[locale]/[[...path]]/page.tsx#L74-L120))
  branches on `resolveContainerKey(locale, path[0])` and handles at most 4 segments.

The KB needs a two-level container (`tudasbazis/definiciok`) and up to **six**
segments (`/hu/tudasbazis/tetelek/{t}/bizonyitasok/{p}/megjegyzesek/{r}`). The
catch-all route itself is fine; `resolvePath`, `generateStaticParams` and
`generateMetadata` all need a KB branch.

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
**without** generating an index. So §6.4's "per-type files + sitemap index" cannot
be expressed through the `app/sitemap.ts` metadata convention at all.

Recommended mechanism (Phase 5): keep `app/sitemap.ts` as the single enumerator of
every URL, and add a `postbuild` splitter that reads `out/sitemap.xml`, buckets
`<url>` entries by URL shape into `out/sitemap-{type}.xml`, and rewrites
`out/sitemap.xml` as the `<sitemapindex>`. Precedent for a postbuild rewrite of the
export exists (`scripts/set-html-lang.mjs`). Bucketing is deterministic from the
path prefix, which the script can derive from `locales.json` — the same file
`gen-content-lastmod.mjs` and the migration-worker manifest generator already read.
`robots.ts` keeps pointing at `/sitemap.xml`, which becomes the index. No Terraform
change is needed: `.xml` is already in `zone/locals.tf`'s `asset_extensions`, so the
new files are served directly and skip the `.html`-append transform.

### A13. `gen-content-lastmod.mjs` will not see KB files

[gen-content-lastmod.mjs:30-33](../../apps/website/scripts/gen-content-lastmod.mjs#L30-L33)
keys off **fixed filenames** (`book.yaml`, `chapter.yaml`, `article.yaml`, …). KB
filenames are arbitrary (`csoport.yaml`), so no KB entity gets a `lastmod`. It also
spawns one `git log` per matched file; adding 537 files means 537 extra
subprocesses. Both fixed in Phase 5 (detect the type from the YAML's `type` field;
replace the per-file `git log` with a single `git log --name-only` pass).

### A14. The quality-gate crawler will fail once the pages exist

[crawl.mjs:62-63](../../tools/smoke-tests/scripts/crawl.mjs#L62-L63): `MAX_PAGES = 500`,
`MAX_DEPTH = 5`, `CONCURRENCY = 5`.

- Today's export is **46 HTML pages / 30 sitemap URLs**. This work adds ~541
  (84 + 191 + 190 + 72 entity pages, plus KB root, two type indexes and the
  glossary) → **~590 pages**. The crawl caps out at 500 (`cappedAtMaxPages`), and
  because the **orphan check compares `/sitemap.xml` against pages actually
  visited**, every URL the truncated crawl never reached is reported as an orphan.
- The deepest URL sits at crawl depth 5 from the `/hu` seed
  (home → KB root → theorems index → theorem → proof → remark) — exactly at
  `MAX_DEPTH`. Any additional hop in the navigation path drops it from the crawl.
- Crawl wall-clock grows ~13× at `CONCURRENCY = 5`.

### A15. The editor silently deletes new sub-fields on claims and terms

In `youproof-org/editor`, `src/handlers.ts` rebuilds claim blocks and term entries
**field by field** on save:

- claim (`case 'claim'`, ~L658) writes only `name`, `content`, `formula`;
- terms (~L533) write only `display`, `canonical`, `synonyms`.

So a `slug` added to a claim block or a term entry is **destroyed the first time an
author saves that file in the editor**. A top-level `slug` on a KB entity *does*
survive (`saveFromModel` mutates the loaded YAML document, and `reorderYamlKeys`
preserves unlisted keys) but would be appended at the end of the file unless added
to `CANONICAL_ORDER`. Both need an editor change — see Phase 8.

### A16. Localizable strings are hardcoded in the current shell

`locales.json` already has a `labels` block, but `SiteHeader` hardcodes the nav
labels `'Cikkek'`/`'Hírek'`
([SiteHeader.tsx:22-25](../../apps/website/components/layout/SiteHeader.tsx#L22-L25))
and `page.tsx` hardcodes `'Főoldal'`, `'Cikkek'`, `'Hírek'` in breadcrumbs. New KB
labels must go in `locales.json.labels` per the i18n guiding principle ("hardcoding
lives only in *data*"); the plan does not require fixing the existing offenders, but
Phase 6 touches the same lines and it is cheap to do so.

### A17. Entity numbering (`"11.3."`) is chapter-scoped

`buildChapterEmbedIndices` / `buildEntityChapterInfo` derive `"11.3."` from `embed`
order inside the embedding chapter. A standalone page has no numbering context of
its own. It can borrow the embedding chapter's index (available for all 537 nodes
today per A2), but must degrade to label-only for a future un-embedded node.

### A18. Build-cost baseline (measured)

`next build` on this machine: **16.66 s wall** for 52 static pages; content graph
built in 302–533 ms per webpack context. Extrapolating ~590 pages linearly gives
roughly 2–3 min, dominated by server-side KaTeX rendering. Not a blocker, but the
CI build step's timing should be re-measured at the end of Phase 4 rather than
assumed.

### A19. The dev raw-graph cache has no shape version

[graph-cache.ts](../../apps/website/lib/content/graph-cache.ts) writes
`RawGraphData` to `.next/cache/content-graph.json` and `readRawCache` deserializes
it with no version check. Phase 2 adds fields to `RawDefinitionEntry` &co., so a
cache written before the change would rehydrate nodes missing `locale`/`slug` and
produce confusing local-dev failures. Add a `version` constant to `RawGraphData` and
have `readRawCache` return `null` on mismatch.

---

## B. Decisions needed before Phase 1

D1, D2 and D6 change what gets built. The rest can be defaulted to the
recommendation and revisited.

### D1 — Titles for the 468 untitled entities

Per A5, `title` is absent on 156/191 theorems, 190/190 proofs, 72/72 remarks and
22/84 definitions, and cannot be derived from `name`.

| option | consequence |
|---|---|
| **(a)** Author all missing titles in `content` | Correct for SEO, ~468 hand edits, the dominant cost of the ticket |
| **(b)** Code fallback: derive a title from label + borrowed chapter index (`"11.3. Tétel"`) and, for owned nodes, the owner's title (`"Bizonyítás: {theorem-title}"`, `"Megjegyzés: {owner-title}"`) | Ships immediately; proof/remark pages read sensibly; definition/theorem pages without titles read as bare numbers, which is poor for search |
| **(c)** Launch only the nodes that already have titles | Contradicts §1 ("every node gets its own indexable URL") |

**Recommendation: (b) + (a) together, staged.** Implement (b) so the build never
depends on a title existing — §7.3/§7.4 already sanction a "neutral label" for
proofs and remarks, and an owner-derived title is strictly better than a neutral
one. Then run (a) as a content workstream scoped to **definitions and theorems
only** (178 files), because those are the two types that get their own search
intent. Use §6.4's per-type sitemap files to hold `bizonyitasok`/`megjegyzesek` out
of Search Console submission until their pages are judged non-thin. Proof and remark
titles stay derived; they are not independently searched.

### D2 — Where slugs come from

§8 resolved that *every* node — including claims and terms — carries an
author-supplied `slug`. Against the data (A4, A8) that means 537 + 150 + 217 = **904
new authored fields**, of which the 367 on claims and terms would be silently
deleted by the editor (A15).

**Recommendation, split by node kind:**

- **Entities (537):** add `slug`, backfilled from `name` by a one-off script. Zero
  risk — `name` is already Hungarian kebab-case, URL-safe and globally unique (A6),
  and this is exactly the precedent set by `content/scripts/migrate-locale-slug.mjs`,
  which seeded chapter/section slugs from `name`.
- **Claims and terms (367):** make `slug` an **optional override**. The anchor is
  `#claim-{slug ?? name}` / `#term-{slug ?? name}`. No migration up front, English
  fragments initially, and Hungarian anchors can be authored incrementally per file
  once the editor preserves the field (Phase 8). A fragment is not an indexed URL,
  so the SEO cost of an English fragment is negligible; the cost of 367 hand edits
  gated behind an editor change is not.

The implementation is a superset of §8's decision, so switching to fully authored
slugs later needs no code change — only content edits.

### D3 — Where internal entity cross-references point

Today every `[ref]` to an entity resolves to `{embedding-chapter-url}#{id}` (A2).
§3.5 says *"every internally-generated link (breadcrumbs, cross-references, nav)"*
uses the canonical URL.

| option | consequence |
|---|---|
| **(a)** keep the chapter anchor | Reading flow unchanged; KB pages get almost no inbound internal links, undercutting §1's indexability goal |
| **(b)** always the canonical KB page | Literal §3.5; clicking "az 1. definícióban" mid-chapter now leaves the chapter |
| **(c)** hybrid — same-page target stays an in-page anchor, cross-page target becomes the canonical KB page | Preserves in-chapter reading flow, gives KB pages ~1400 inbound internal links |

**Recommendation: (c).** It is one branch in `resolveRefHrefs` (compare the
referrer's own page URL against the target's embedding-chapter URL) and it is the
only option that satisfies both §1 and the existing reading experience.

### D4 — Replace the base64 anchor ids with readable ones

§3.3 specifies `#claim-{slug}` and `#term-{slug}`; today the ids are
base64-of-JSON (A2). Changing them changes existing anchors on chapter pages.

**Recommendation: yes, in this release.** Production is indexed but the site is
pre-release, page-level URLs are unchanged, and there are no external backlinks to
a base64 fragment. Doing it later would mean a second churn of the same call sites
(`EmbeddedEntity`, `ClaimBlock`, `InlineText`, `resolveRefHrefs`, three id helpers).

### D5 — Glossary grouping for duplicate terms

Per A8, 8 term keys and 9 `canonical` forms have multiple defining nodes.

**Recommendation: one glossary entry per (defining node, term key)**, sorted by
`canonical`, with the defining node's title shown next to each so duplicates are
visibly disambiguated ("reprezentáns — *Egész számok halmaza*" /
"reprezentáns — *Egész számok maradékosztálygyűrűi*"). Grouping by `canonical` and
listing 3 "defined in" links would hide that these are genuinely different
definitions in different contexts. Also fix the one missing `canonical`.

### D6 — The "Consequences" block

Per A10 there is no consequence relation in the content model, and it is not
derivable from `references`.

**Recommendation: drop "Consequences" from §7.2 for this ticket** and ship
"Referenced by" instead — grouped per claim anchor where the referrer targeted a
specific claim, which is what §4's *"grouped/nested by individual claim"*
requirement actually needs and which 460 claim references make substantial. A
curated `consequences` relation is a separate content-model ticket. Do **not**
relabel inverted references as "consequences" — that would be a false claim on the
page.

### D7 — Do chapter and section referrers appear in "Referenced by"?

332 references into the KB come from chapters and sections (A9).

**Recommendation: yes, as a separate group** ("Hol használjuk" / narrative
context), distinct from the KB-node group. It is the strongest internal-linking
gain available and it directly serves §7's "embedding context" intent.

### D8 — Container segments and labels

**Recommendation** (no alternatives worth listing — these follow §3 directly):
add to `ContainerKey` / `locales.json.containers`:
`knowledge-base → tudasbazis`, `definition → definiciok`, `theorem → tetelek`,
`proof → bizonyitasok`, `remark → megjegyzesek`, `term → fogalmak`; and to
`locales.json.labels`: `knowledgeBase`, `definitionsIndex`, `theoremsIndex`,
`glossary`.

---

## C. Phase 1 — Content schema + backfill (`youproof-org/content`)

1. **`docs/content-model.md`**
   - Add `slug` to the `definition`/`theorem`/`proof`/`remark` examples and to the
     `locale` & `slug` field table; move these four types out of the "never
     addressable" sentence.
   - Document the optional `slug` on `claim` blocks and on `TermMap` entries, and
     state the `slug ?? name` anchor fallback (D2).
   - Extend the **slug uniqueness** table: `definition`/`theorem` unique across all
     nodes of that type in the locale; `proof`/`remark` unique within their owning
     parent; claim/term anchor keys unique within their owning node.
   - State that `title` is required in practice for `definition`/`theorem` and
     derived for `proof`/`remark` (D1), with the derivation rule spelled out.
2. **`scripts/migrate-kb-slug.mjs`** — one-off backfill, modelled directly on the
   existing `scripts/migrate-locale-slug.mjs`: line-based rewrite (not a YAML
   re-dump, so comments and ordering survive), idempotent, dry-run by default,
   `--write` to apply. Inserts `slug: <name>` immediately after the `locale:` line
   for the 537 entity files. Run, review the diff, commit separately from any
   hand-authored change.
3. **Content fix:** add the missing `canonical` to term `proper-containment` in
   `definitions/reszhalmaz.yaml`.
4. **Title authoring (D1a)** — separate, reviewable commits, definitions first
   (22 files), then theorems (156). Track as its own sub-task; it does not block
   Phases 2–7, only the point at which `definiciok`/`tetelek` sitemaps are
   submitted to Search Console.

*Exit criterion:* `migrate-kb-slug.mjs` is idempotent on a second run, and the
services build (Phase 2 not yet started) still passes — the backfill is additive and
unread until Phase 2.

---

## D. Phase 2 — Loader, graph model, reverse index (`services`)

### D.1 Types — `lib/content/types.ts`

- Add `locale: string` and `slug: string` to `DefinitionNode`, `TheoremNode`,
  `ProofNode`, `RemarkNode`.
- Add `slug?: string` to `ClaimBlock` and to `TermDefinition`.
- Widen `RemarkNode.attachedTo` handling: keep it optional (A7 shows the
  independent-remark branch is currently dead, but the model allows it) and give an
  un-owned remark a top-level URL rather than crashing the URL builder.
- New types for the KB page data: `KbBacklink` (`{ owner: RefOwnerRef; refKey: string; targetAnchor?: string }`),
  `EmbeddingContext` (`{ book; chapter; section }`), `GlossaryEntry`.

### D.2 Loader — `lib/content/loader.ts`

- Call the existing `readLocale(raw)` and `readSlug(raw, name)` in
  `loadDefinition` / `loadTheorem` / `loadProof` / `loadRemark`. `readSlug` already
  falls back to `name.toLowerCase()`, so Phase 2 is safe to land **before** the
  Phase 1 backfill reaches `stable/*`.
- Read the optional `slug` on claim blocks (`normalizeBlock` already kebab→camels
  every key, so `slug` needs no special case) and on term entries (`toTermMap`
  passes the object through, likewise).

### D.3 Graph — `lib/content/graph.ts`

- Thread `locale`/`slug` through `RawDefinitionEntry`/`RawTheoremEntry`/
  `RawProofEntry`/`RawRemarkEntry` and the corresponding `buildGraphFromRaw`
  constructions.
- **`RawGraphData.version`** + a mismatch check in `graph-cache.ts` (A19).
- **`buildEntityChapterInfo` → `buildEmbeddingContext`:** widen the value from
  `{ chapterUrl, index? }` to `{ chapter: ChapterNode; section: SectionNode; index?: string }`.
  `scanForUrl` currently only receives a URL string; give it the owning
  `ChapterNode`/`SectionNode` so §7's three-level "Appears in" chain is available.
  Every embed lives in a section body (A2), so `section` is always present today —
  still model it as optional for chapter prologue/epilogue embeds.
- **New `buildBacklinkIndex(graph)`:** iterate `refOwners(graph)` (which already
  enumerates every reference owner and is documented as *the* seam for this) and
  build `Map<nodeKey, KbBacklink[]>` for entity, claim and term targets. Key on the
  existing `entityKey(namespace, name)` — the "permanent internal node ID" §4 asks
  for is already in the graph; no new identifier is needed.
- **New `validateKbSlugs(graph)`:** enforce the uniqueness table from Phase 1.1 and
  fail the build on collision, matching how `validateReferences` and
  `validateTermInsertions` behave today.
- **`resolveRefHrefs`:** implement D3, and replace the `throw` for an un-embedded
  entity with a fallback to the entity's own canonical URL (A2).
- **New `buildGlossary(graph)`:** one entry per (defining node, term key) per D5,
  carrying `canonical`, the defining node's URL + term anchor, and the inbound-count
  from the backlink index.

### D.4 Anchors — `lib/utils/{entity,claim,term}-id.ts`

Per D4, replace the three base64 helpers with slug-based ones
(`#claim-{slug ?? name}`, `#term-{slug ?? name}`, and for an entity embedded in a
chapter `#{type}-{slug}`). Call sites: `EmbeddedEntity`, `ClaimBlock`, `InlineText`,
`resolveRefHrefs`. Keep them as three small modules so the existing import graph is
unchanged.

*Exit criterion:* unit tests for `validateKbSlugs`, `buildBacklinkIndex` and the
anchor helpers; `next build` green with no page-layer change yet.

---

## E. Phase 3 — URL layer (`services`)

1. **`lib/i18n/locales.json` + `config.ts`** — the new `ContainerKey`s and `LabelKey`s from D8.
2. **`lib/i18n/url.ts`** — new `UrlKey`s:
   `kb-root`, `definitions-index`, `theorems-index`, `glossary`, `definition`,
   `theorem`, `proof`, and — because `req()` enforces an exact segment count and a
   remark's parent chain is variable-length (definition / theorem / proof) —
   **three** distinct remark keys: `definition-remark` (2 slugs), `theorem-remark`
   (2 slugs), `proof-remark` (3 slugs). Splitting the key keeps `req()`'s exact
   arity check intact rather than weakening it for one case.
3. **`lib/content/urls.ts`** — `urlForDefinition`, `urlForTheorem`, `urlForProof`,
   `urlForRemark` (dispatching on `attachedTo.type`), `urlForKbRoot`,
   `urlForDefinitionsIndex`, `urlForTheoremsIndex`, `urlForGlossary`, plus
   `anchorForClaim(node, claim)` / `anchorForTerm(node, termKey)` returning
   `{canonicalUrl}#{anchor}`. Each reads `node.locale`, exactly like
   `urlForChapter`/`urlForStandalone` today.

*Exit criterion:* a unit test asserting each helper's output shape against the §3
examples, and that no helper is reachable without going through `buildLocalizedUrl`
(the i18n doc's §5 invariant test pattern).

---

## F. Phase 4 — Routing and pages (`services`)

### F.1 Routing — `app/[locale]/[[...path]]/page.tsx`

- Extend `Resolved` with `kb-root`, `definitions-index`, `theorems-index`,
  `glossary`, `definition`, `theorem`, `proof`, `remark`.
- `resolvePath`: a `key0 === 'knowledge-base'` branch handling depths 1–6, and an
  early rejection of `definition`/`theorem`/`proof`/`remark`/`term` appearing at
  `path[0]` (mirroring the existing `if (key0 === 'chapter') return null`).
- `generateStaticParams`: 537 entity paths + 4 index paths, all derived from node
  `locale`/`slug`, never from on-disk names.
- `generateMetadata`: map each new kind to its `UrlKey` + `slugPath`; `ogType`
  `'article'` for entity pages, `'website'` for the indexes and glossary. Entity
  nodes have no `thumbnail`, so `buildPageMeta` falls back to the generic OG image
  with no change. Supply `excerpt` for the meta description from the node's first
  narrative block, truncated — otherwise all 537 pages share
  `locale.defaultDescription`, which is a duplicate-description finding waiting to
  happen in the SEO check.

### F.2 Components (new, under `components/kb/`)

| component | covers |
|---|---|
| `KbNodeShell` | shared page frame: breadcrumb chain per §7, title/kicker, body, then the relationship sections |
| `DefinitionPage` | §7.1 — body, defined terms, remarks, referenced-by, embedding context |
| `TheoremPage` | §7.2 — statement with per-claim anchored sections, proofs, remarks, referenced-by grouped per claim (D6) |
| `ProofPage` | §7.3 — body, remarks, "Uses" (this node's own outgoing references, which already exist as its `references` map), embedding context |
| `RemarkPage` | §7.4 — ownership-dependent breadcrumb, body, claims, referenced-by |
| `KbTypeIndex` | §7.6/§7.7 — list + client-side filter |
| `GlossaryPage` | §7.5 — glossary entries + client-side filter |
| `KbRoot` | §7.8 — orientation page with node counts |
| `RelatedNodes` | shared renderer for the backlink groups (D7) |
| `EmbeddingContext` | shared "Appears in: book → chapter → section" block |

Reuse `ContentBlocks` / `EmbeddedEntity` / `InlineText` verbatim for bodies. Note
`ContentBlocks` takes chapter-scoped `embedIndices`/`figureIndices`; a KB page can
pass the ones borrowed from its embedding chapter (A17) or none.

The two filter bars are the only client-side JS this ticket adds — one small
`'use client'` input filtering an already-rendered list (217 glossary entries, 191
theorems; no virtualization needed).

### F.3 Titles

Implement the D1(b) fallback chain in one helper so every consumer (H1, `<title>`,
breadcrumb leaf, index row, backlink label) agrees:
`title ?? ownerDerivedTitle ?? "{index} {Label}" ?? "{Label}"`.

*Exit criterion:* `next build` emits ~590 pages; spot-check one page of each of the
7 kinds; re-measure build wall time against the 16.66 s / 52-page baseline (A18).

---

## G. Phase 5 — Sitemaps, robots, lastmod (`services`)

1. **`app/sitemap.ts`** — add the KB URLs (entity pages, KB root, both indexes,
   glossary), each with the same self-alternate + `lastmod` treatment as existing
   entries. Landing pages stay excluded; claims and terms are **not** separately
   sitemapped (§6.4).
2. **`scripts/split-sitemap.mjs`** (new `postbuild` step, per A12) — buckets
   `out/sitemap.xml` into `out/sitemap-{konyvek,cikkek,hirek,oldalak,definiciok,tetelek,bizonyitasok,megjegyzesek,fogalmak}.xml`
   by URL shape derived from `locales.json`, then rewrites `out/sitemap.xml` as the
   `<sitemapindex>`. Include a **per-type allowlist** so D1's staged rollout can hold
   `bizonyitasok`/`megjegyzesek` out of the index without touching `app/sitemap.ts`.
   Unit-test the splitter directly on a fixture XML.
3. **`scripts/gen-content-lastmod.mjs`** (A13) — detect the type from the YAML's
   `type` field instead of the filename, and replace the per-file `git log` with a
   single `git log --name-only --format=%cI` pass over the content repo.
4. **`app/robots.ts`** — unchanged; `/sitemap.xml` is now the index.
5. **No Terraform change** — `.xml` is already an asset extension (A12).

*Exit criterion:* `out/sitemap.xml` validates as a sitemap index; every
`<loc>` in every child file returns 200 in the local export; the sum of child
entries equals the pre-split entry count.

---

## H. Phase 6 — Navigation, discovery, internal linking (`services`)

1. `SiteHeader` — add a "Tudásbázis" nav link, sourced from
   `locales.json.labels.knowledgeBase` (and, while touching these lines, move the
   existing hardcoded `'Cikkek'`/`'Hírek'` to the same mechanism — A16).
2. `RootHome` — a knowledge-base entry block, so the KB root is reachable from the
   locale homepage and therefore from the crawler's seed.
3. Breadcrumbs — implement §7's chains for all seven KB page kinds, using
   `locales.json` labels rather than literals.
4. Switch entity/claim/term cross-reference hrefs to the D3 rule in
   `resolveRefHrefs`, and make `InlineText`'s entity/claim/term branches use the
   resolved `href` uniformly (they already do; verify no branch still falls back to
   a bare `'#'`).

---

## I. Phase 7 — Quality gate and tests

1. **`tools/smoke-tests/scripts/crawl.mjs`** (A14) — raise `MAX_PAGES` to ~800 and
   `MAX_DEPTH` to 7, and re-check crawl wall-clock at `CONCURRENCY = 5`; raise
   concurrency only if the gate's runtime becomes a problem. Verify the orphan check
   is clean (it compares the sitemap against visited pages, so a truncated crawl
   reports false orphans — this is the finding that must not survive to CI).
2. Confirm the `checkSeo` path passes on each new page kind: canonical present and
   self-referential, hreflang + `x-default`, title/description length within the
   warning thresholds, `og:image` resolving to the generic fallback.
3. New unit tests in `apps/website/test/`: URL-helper shapes (Phase 3), KB slug
   uniqueness validator, backlink index, glossary grouping (including the duplicate
   `reprezentáns` case), anchor helpers, sitemap splitter.
4. Verify `<html lang>` on the new pages (`set-html-lang.mjs` is path-driven, so
   `/hu/tudasbazis/...` is already covered — assert it rather than assume).

---

## J. Phase 8 — Editor (`youproof-org/editor`)

Required only once claim/term slugs are actually authored (D2), but the field is
destroyed on save until then (A15), so it must land before any such content edit.

1. `src/handlers.ts` — preserve `slug` in the claim-block serializer (`case 'claim'`)
   and in the term-entry serializer.
2. `CANONICAL_ORDER` — add `slug` after `name` for `definition`, `theorem`, `proof`,
   `remark`, so the backfilled entity slug keeps a stable position instead of being
   appended.
3. `src/content/model.ts` — extend the "`slug` is intentionally NOT modelled"
   comment to say it is now *preserved* on KB entities, claims and terms.

---

## K. Phase 9 — Documentation

1. `docs/i18n-design.md` — supersede §4a and correct the field-summary table
   (definition/theorem/proof/remark move to "Addressable"); extend §9's slug
   uniqueness table with the KB rules.
2. `docs/content-site-and-static-generation.md` — extend the [canonical URL
   rule](../content-site-and-static-generation.md#canonical-url-rule) with the KB
   paths; note the page count going from ~46 to ~590.
3. `content/docs/content-model.md` — per Phase 1.1.
4. `docs/plans/yp-162-knowledge-graph-urls-plan.md` — mark §6 (redirects) and §5
   (JSON-LD) as still out of scope, resolve the two open questions in §8 that are
   redirect-related only when §6 is picked up, and link to this file.

---

## L. Out of scope (restated + additions)

Already excluded by the design plan:

- **JSON-LD / structured data** (§5) — separate backlog item.
- **Slug-rename redirect infrastructure** (§6) — no `terraform/redirects/` root, no
  bulk redirect lists, no ruleset rule. The two unresolved §8 questions (Cloudflare
  list entry limits; whether the list must exist before the zone-root apply) belong
  to that ticket, not this one.
- Namespace-mirrored URLs, dual-serving, worker-based redirects, standalone
  claim/term pages (§9).

Added by this analysis:

- **A curated `consequences` relation** in the content model (D6) — needs its own
  content-model ticket before §7.2's "Consequences" block can exist.
- **Namespace pages.** Namespaces stay non-addressable path strings; three
  `namespace.yaml` files carry an unused `children` list, which this ticket does not
  read.
- **Localizing the existing hardcoded Hungarian UI strings** beyond the lines
  Phase 6 already touches.
- **Multi-locale KB content.** Everything is built per-node-`locale` so a second
  locale needs no code change, but no `en` KB content is produced.

---

## M. Risks

| # | risk | mitigation |
|---|---|---|
| R1 | **468 missing titles** (A5) make definition/theorem pages unindexable-in-practice | D1: code fallback ships immediately; per-type sitemap staging holds untitled types back; 178-file authoring workstream tracked separately |
| R2 | **Thin content** — 256 nodes with zero inbound references, 190 proof pages with a near-empty "Referenced by" (A9) | Proof pages lean on the "Uses" block (§7.3) and embedding context, both of which have data for every node; hold `bizonyitasok`/`megjegyzesek` out of the sitemap index until reviewed |
| R3 | **Crawler cap** (A14) silently degrades the production promotion gate into false orphan findings | Phase 7 raises the caps *before* Phase 4's pages reach staging; assert `cappedAtMaxPages === false` in the gate |
| R4 | **Editor data loss** on claim/term `slug` (A15) | D2 defers those slugs; Phase 8 lands before any are authored |
| R5 | **Stale dev graph cache** after the Phase 2 type change (A19) | `RawGraphData.version` + invalidate on mismatch |
| R6 | Build time growth (A18) — 13× the page count | Re-measure at Phase 4 exit; the graph itself is <600 ms, so growth is KaTeX-bound and parallelizable by Next |
| R7 | `resolveRefHrefs`'s existing `throw` on an un-embedded entity (A2) turns a legitimate KB-only node into a hard build failure | Phase 2 replaces it with a canonical-URL fallback |
