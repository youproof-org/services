# Knowledge Graph Node URLs & Redirect Infrastructure — Plan

Status: Draft, iterating
Audience: Claude Code (implementation), with full repo context (`youproof-org/services`, `youproof-org/content`, `youproof-org/editor`)
Repos affected: `services` (routing, D1/manifest, Terraform), `content` (YAML schema, slugs)
Implementation plan: [`yp-162-knowledge-graph-urls-implementation-plan.md`](yp-162-knowledge-graph-urls-implementation-plan.md) — codebase analysis, open decisions, and phased build derived from this design

---

## 1. Goal

Give every node of the knowledge graph (definitions, theorems, proofs, remarks, claims, terms) its own indexable URL, showing:
- The node's own content
- Links to related nodes per its role in the graph (e.g. a term page links to its defining node and all referencing nodes; a theorem page links to its proofs, remarks, and direct/indirect consequences)

Primary drivers: search engine indexability, and legibility for AI/LLM crawlers and retrieval systems.

Constraint that shapes everything below: **namespaces (the multi-level grouping of definitions/theorems) are expected to change over time.** Node identity and URLs must not depend on namespace position.

---

## 2. Node relationship model

Two distinct kinds of relationship in the graph, deliberately treated differently:

- **Compositional ownership** (1:1, existence-dependent, drives URL nesting)
  - Proof → owned by exactly one theorem
  - Remark → owned by exactly one definition, theorem, or proof
  - Claim → owned by exactly one definition, theorem, or remark (claims are structural parts of their parent's argument, not independently authored objects)
- **Reference / membership** (many-to-many, does *not* drive URL nesting — surfaced as in-page links/graph queries instead)
  - Term ↔ every node that references it (a term is defined by one node but referenced broadly; modeled like a flat glossary)
  - Theorem/definition ↔ namespace (namespace membership; explicitly mutable)
  - Theorem → its logical consequences (direct/indirect); claim/theorem cross-references generally

Rule of thumb: **URL nesting = compositional ownership chain, terminating at one flat top-level slug. Everything else (namespace position, cross-references, "referenced by") lives outside the URL as graph/metadata queries against a permanent node ID.**

---

## 3. URL structure

Constant path segments (`tudasbazis`, `definiciok`, `tetelek`, `bizonyitasok`, `megjegyzesek`, `fogalmak`) are **locale-dependent**, following the same localization pattern already used elsewhere on the site (see `buildLocalizedUrl` helper / YP-125 multi-language URL refactor). Examples below use the `hu` forms; Claude Code should derive the equivalent constants for other locales from existing usage in the codebase.

### 3.1 Top-level nodes (flat, namespace-independent)

```
/{locale}/tudasbazis/definiciok/{slug}
/{locale}/tudasbazis/tetelek/{slug}
```

- `{slug}` is unique within `(locale, type)`, author-supplied via the node's `slug` field in its content YAML (same pattern as books/chapters/sections — see §6.1), stable — namespace membership never appears in the path.
- Terms do **not** get a top-level flat URL of their own — see §3.3 (revised from earlier draft).

### 3.2 Owned/nested nodes with their own pages (compositional ownership reflected in path)

```
/{locale}/tudasbazis/definiciok/{def-slug}/megjegyzesek/{remark-slug}
/{locale}/tudasbazis/tetelek/{theorem-slug}/megjegyzesek/{remark-slug}
/{locale}/tudasbazis/tetelek/{theorem-slug}/bizonyitasok/{proof-slug}
/{locale}/tudasbazis/tetelek/{theorem-slug}/bizonyitasok/{proof-slug}/megjegyzesek/{remark-slug}
```

- Proofs and remarks get standalone canonical pages, nested under their owning parent.
- Nesting can go up to 3 levels deep (theorem → proof → remark).
- Each `{...-slug}` comes from that node's own `slug` field in its content YAML — see §6.1. Nesting is cheap to maintain because it cascades from exactly one top-level slug, which changes rarely (unlike namespaces).

### 3.3 Claims and terms: no standalone pages — embedded + anchors

Revised conclusion after discussion (see §9 for the reasoning trail):

- **Claims** (axioms in a definition's axiom list, individual claims in a multi-claim theorem, claims embedded in a remark, etc.) do **not** get their own URL or page. They render as an anchored section within whichever node actually owns them (definition, theorem, or remark):
  ```
  /{locale}/tudasbazis/definiciok/{def-slug}#claim-{claim-slug}
  /{locale}/tudasbazis/tetelek/{theorem-slug}#claim-{claim-slug}
  /{locale}/tudasbazis/definiciok/{def-slug}/megjegyzesek/{remark-slug}#claim-{claim-slug}
  /{locale}/tudasbazis/tetelek/{theorem-slug}/megjegyzesek/{remark-slug}#claim-{claim-slug}
  ```
  Each claim still has a permanent internal node ID for graph/cross-reference purposes (e.g. "used in the proof of Theorem Y, step 3" is a real, common reference pattern — not rare or incidental) — it just doesn't get an indexed standalone page. The fragment anchor is the citable target.

- **Terms** also get no individual standalone page. Instead, a single glossary page lists/searches all terms:
  ```
  /{locale}/tudasbazis/fogalmak
  ```
  Each entry in the glossary links to the fragment anchor on whichever definition/theorem/remark actually introduces that term, e.g. `/{locale}/tudasbazis/definiciok/{def-slug}#term-{term-slug}`. "Referenced by" aggregation for a term (which other nodes reference it) is shown on the defining node's page itself, at that anchor — not on a per-term page, since no per-term page exists.

- Rationale summary: both claims and terms are authored as structural parts of a parent's sentence/argument (a marked span like `__eigenvalue__`, or an item in an axiom list) — neither has independent explanatory content apart from that parent context. Standalone pages for either would mostly be thin/near-duplicate content, with no distinct search intent at that granularity (nobody searches "axiom 2 of definition 12.3" the way they search "ring definition"). Fragment identifiers are the architecturally correct tool here: a stable, linkable, machine-addressable identity that doesn't require minting a new document. This can be revisited later per-type if Search Console query data shows real demand at that granularity — reversible without breaking anything, since a fragment's owning node could be promoted to its own canonical URL later with a redirect from the old anchor form.

### 3.5 Canonical vs. routable URLs

- The URLs in 3.1/3.2 are **canonical** — used in `<link rel="canonical">`, sitemaps, and every internally-generated link (breadcrumbs, cross-references, nav). Claims/terms use their anchor form as the citable target (no separate canonical needed, since there's no separate page — see §3.3).
- **No namespace-path URL (e.g. `/{locale}/algebra/linear-algebra/tetelek/{slug}`) is ever emitted anywhere on the site.** This is intentional: if YouProof never generates such a link, nobody has one to backlink, so no redirect burden is created for namespace reshuffles. (Decided against an earlier draft that considered making namespace-path URLs routable-but-non-canonical — rejected because it still requires permalink-stability guarantees for URLs the site itself never promised to keep stable.)

---

## 4. Cross-reference / "related nodes" rendering

- Each node page's relationship sections ("defined here", "referenced by", "consequences") are populated by graph queries keyed on a **permanent internal node ID** (stable UUID or existing content-file identifier), not by slug or URL. This applies equally to claims and terms, even though they don't have standalone pages — their "referenced by" data still renders, just on the parent's page at the relevant anchor.
- This fully decouples the slug-stability work above from the graph-traversal/cross-reference logic — the existing/planned semantic cross-reference tooling (`sentence-transformers` / `chromadb` pipeline, `gen-manifest`) can key on node ID without any dependency on URL shape.
- Consequence lists on a multi-claim theorem's page can and should be grouped/nested by individual claim (tree-structured HTML — one section per claim anchor, each with its own consequences sub-list), even though claims have no page of their own. Nesting the *markup* by claim is independent of whether claims get their own *URL*.

---

## 5. Structured data (JSON-LD) — out of scope, separate backlog item

Explicitly deferred. JSON-LD per node type (schema.org typing, breadcrumb structured data, etc.) is a separate backlog item to be scoped in its own pass, not part of this plan. Do not implement as part of this URL-structure work.

---

## 6. Slug rename handling *(out of scope — future task)*

**Status: out of scope. Not to be implemented until actually needed.** The design below is captured for reuse when this becomes needed (i.e. when a top-level node slug actually needs renaming), not as work to schedule now. Do not build the `terraform/redirects/` root, the bulk redirect lists, or the ruleset rule as part of the current implementation — the sections below exist purely so the reasoning isn't lost.

Renames are expected to be **rare** for top-level nodes and namespaces, and slug changes never happen due to namespace reorganization (since namespace position isn't in the URL at all).

### 6.1 Redirect mechanism

- **301 redirects**, not dual-serving the same node at old+new URLs. Dual-serving was considered and rejected: splits ranking authority, and AI crawlers may not reliably respect `rel=canonical`, risking the old URL persisting as an independently-cited duplicate.
- Mechanism: **Cloudflare Bulk Redirect Lists** + a `http_request_redirect` phase ruleset rule — not a Worker in the request hot path (site is served directly from R2; a Worker in front of all traffic would reintroduce the per-request compute cost R2-direct serving is meant to avoid).

### 6.2 Terraform structure

- **Zone root** (existing, shared by staging + production, applies only on production release): one-time addition of the redirect ruleset, with two hostname-scoped rules:
  ```
  http.host eq "youproof.org" and http.request.uri.path in $production_redirects
  http.host eq "staging.youproof.org" and http.request.uri.path in $staging_redirects
  ```
  List referenced by name (string), not by Terraform resource reference — no `depends_on` coupling to the list root.
- **New `terraform/redirects/` root** (separate from zone root, account-scoped resource — `cloudflare_list`, `kind = "redirect"`):
  - Single parameterized resource definition; `environment` variable injected via `-var` in CI (same pattern as existing Worker name/bindings injection).
  - **Separate state per environment**, keyed via backend config at `terraform init` (same mechanism already used for other per-environment state) — required because staging and production lists must hold different, independently-evolving entries at the same time, unlike the Worker case where only one environment's deploy matters at a given moment.
  - Deploy triggers: staging state applies on `stable/staging` merges; production state applies on production promotion. Fully independent of the zone root after its one-time setup — this is what makes staging a genuine pre-production dry run of the redirect mechanism itself.

### 6.3 Process on a rename

1. Content pipeline re-resolves all internal cross-references to the new slug at build time — internal links never point at a stale slug, so the redirect list only needs to catch *external* inbound links (backlinks, cached search/AI-crawler URLs).
2. Old→new slug entry added to the appropriate environment's redirect list (staging first, for verification; then production).
3. If a top-level slug renames, cascade-regenerate slugs for owned children with their own pages (proofs/remarks nested under it) and add alias entries for those too, in the same batch. Claims and terms have no separate slug/URL to alias — they're addressed via anchors on their parent's page, so an anchor's target page moving is covered by the parent's own alias entry; the anchor fragment itself (`#claim-{slug}` / `#term-{slug}`) is stable as long as the *claim/term's own* `slug` field doesn't change.
4. Sitemap updated same deploy: old URL removed, new URL added.

### 6.4 Sitemap generation strategy — decided: per-type files

Per-type sitemap files (e.g. `sitemap-definiciok.xml`, `sitemap-tetelek.xml`, `sitemap-megjegyzesek.xml`, `sitemap-bizonyitasok.xml`, `sitemap-fogalmak.xml`), referenced from a top-level `sitemap.xml` sitemap index. Chosen over one combined sitemap because:

- Per-type Search Console submission gives per-type indexation/coverage visibility (diagnostically useful — e.g. spotting that one node type is lagging in indexing while others aren't).
- Cheaper incremental regeneration — a build touching only theorems regenerates only that file.
- Enables staged rollout by type (e.g. launch definitions + theorems first, hold back `fogalmak` until the glossary page design is finalized) without needing entry-level filtering logic in a single file.
- Headroom against the 50k-URL-per-sitemap-file ceiling, though unlikely to be reached at current content volume.

Tradeoff accepted: one extra layer (the sitemap index file) and multiple files to keep in sync in the build pipeline, instead of one file. Considered acceptable given these are static XML files with no runtime cost.

Note: claims and terms have no standalone pages, so they are **not** separately sitemapped — the glossary page (`/{locale}/tudasbazis/fogalmak`) is the one sitemap entry covering term discoverability; claims are only reachable via their parent's page/sitemap entry.

---

## 7. Page design — content blocks per page type

> **Superseded, for everything about arrangement, by the
> [page-layout sub-plan](yp-162-page-layout-sub-plan.md).** That document settles what a
> reader sees on each knowledge-base page and how it is put together; where it
> disagrees with this section, **it wins**.
>
> The **breadcrumb chains immediately below are unchanged** — the sub-plan uses them
> as they stand. What changed in the *content lists* themselves is recorded per
> subsection, and in short: §§7.1–7.4 no longer stack "Defined terms", "Remarks",
> "Referenced by" or "Embedding context" underneath the body (they become the entity
> page's context menu, its panel, and the ownership-chain links — sub-plan §6.1, §6.2);
> §7.2 loses "Consequences"; §7.3 loses "Uses"; §7.5 loses the excerpt and the
> "referenced by N" count and gains a row per synonym; §7.6 and §7.7 lose the
> summary/preview line. §7.8 stands as written.

High-level proposal for what each new page type should contain and why. Layout and interaction details were deferred to a subsequent design pass — that pass is the [page-layout sub-plan](yp-162-page-layout-sub-plan.md), and its §§2–7 supersede the arrangement implied here.

Breadcrumb structure for all knowledge base pages, extending the existing site-wide breadcrumb component:

```
Főoldal
└── Tudásbázis                           /{locale}/tudasbazis
    ├── Definíciók                        /{locale}/tudasbazis/definiciok
    │   └── {def-title}                   /{locale}/tudasbazis/definiciok/{slug}
    │       └── Megjegyzés: {title}       /{locale}/tudasbazis/definiciok/{slug}/megjegyzesek/{remark-slug}
    ├── Tételek                           /{locale}/tudasbazis/tetelek
    │   └── {thm-title}                   /{locale}/tudasbazis/tetelek/{slug}
    │       ├── Megjegyzés: {title}       /{locale}/tudasbazis/tetelek/{slug}/megjegyzesek/{remark-slug}
    │       └── Bizonyítás: {title}       /{locale}/tudasbazis/tetelek/{slug}/bizonyitasok/{proof-slug}
    │           └── Megjegyzés: {title}   /{locale}/tudasbazis/tetelek/{slug}/bizonyitasok/{proof-slug}/megjegyzesek/{remark-slug}
    └── Fogalmak                          /{locale}/tudasbazis/fogalmak
```

### 7.1 Definition page (`/definiciok/{slug}`)

- **Breadcrumb** — Főoldal → Tudásbázis → Definíciók → {def-title}.
- **Title** — the definition's name.
- **Body** — the full definition content (statement, axiom list, or structured claim list as applicable), rendered with LaTeX.
- **Defined terms** — inline anchors (`#term-{slug}`) for each term introduced by this definition; each links out to the glossary entry and shows a "referenced by N nodes" count.
- **Remarks** — links to all remarks owned by this definition (their nested canonical URLs), with short preview of each.
- **Referenced by** — list of theorems, proofs, and other definitions that cross-reference this definition, keyed by node ID.
- **Embedding context** — "Appears in: [Book title] → [Chapter title] → [Section title]" or "Appears in: [Article title] → [Section title]", with the book/chapter or article title as a clickable link to its own page, and the section title as a clickable link to its anchor within that page (e.g. `/books/{book-slug}/chapters/{chapter-slug}#{section-slug}` or `/articles/{article-slug}#{section-slug}`). Purpose: directs the reader to the broader narrative context in which this definition is introduced and used.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md).** Breadcrumb, title
> and body stand. The other four blocks are not stacked sections on the page:
> **Defined terms** becomes the "Fogalmak" mode of the context menu, which reveals the
> terms where they sit in the body and opens a panel for the one the reader picks
> ([§6.2, §6.3](yp-162-page-layout-sub-plan.md#62-the-context-menu)) — with no "referenced by
> N" count; **Remarks** becomes an ownership-chain link below the body
> ([§6.1](yp-162-page-layout-sub-plan.md#61-the-header-and-the-content), D4);
> **Referenced by** becomes the "Bejövő hivatkozások" panel, grouped by source with a
> count per source ([§7.2](yp-162-page-layout-sub-plan.md#72-incoming-references)); and
> **Embedding context** becomes the "Kontextus" panel.

### 7.2 Theorem page (`/tetelek/{slug}`)

- **Breadcrumb** — Főoldal → Tudásbázis → Tételek → {thm-title}.
- **Title** — the theorem's name.
- **Statement** — the theorem's claim(s), rendered with LaTeX. If multi-claim, each claim is an anchored section (`#claim-{slug}`) with its own sub-heading.
- **Proofs** — links to all owned proof pages (nested canonical URLs), listed with their slugs/titles. If a proof has a name, shown; otherwise a neutral label (e.g. "1. bizonyítás").
- **Remarks** — links to all remarks directly owned by this theorem.
- **Consequences** — list of theorems/claims that follow from this theorem (or from individual claims within it), grouped per claim anchor if multi-claim.
- **Referenced by** — other nodes (definitions, theorems, proofs, remarks) that cite this theorem.
- **Embedding context** — same structure as definition page: all three levels (book/chapter or article, and section) are clickable links, with the section linking to its anchor within the parent page.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md).** Breadcrumb, title
> and statement stand. **Proofs** and **Remarks** become ownership-chain links below
> the body — a link each, so several proofs need no special handling
> ([§6.1](yp-162-page-layout-sub-plan.md#61-the-header-and-the-content), D4). **Referenced by**
> becomes the "Bejövő hivatkozások" panel
> ([§7.2](yp-162-page-layout-sub-plan.md#72-incoming-references)), which is also where chapter
> and section referrers appear — in the same list as every other source, grouped and
> counted alike (settles the implementation plan's
> [D7](yp-162-knowledge-graph-urls-implementation-plan.md#d7--do-chapter-and-section-referrers-appear-in-referenced-by-settled)).
> **Embedding context** becomes the "Kontextus" panel. **Consequences** was already
> removed before this design pass — it has no backing data
> ([A10](yp-162-knowledge-graph-urls-implementation-plan.md#a10-consequences-has-no-backing-data--block-removed),
> [D6](yp-162-knowledge-graph-urls-implementation-plan.md#d6--the-consequences-block-settled)).

### 7.3 Proof page (`/tetelek/{theorem-slug}/bizonyitasok/{proof-slug}`)

- **Breadcrumb** — Főoldal → Tudásbázis → Tételek → {thm-title} → Bizonyítás: {proof-title}.
- **Title** — proof name or neutral label.
- **Body** — full proof content, rendered with LaTeX. In-line cross-references to definitions/theorems/claims are hyperlinked to their canonical URLs or anchors.
- **Remarks** — links to remarks owned by this proof.
- **Uses** — explicit list of definitions, theorems, and claims cited within this proof (drawn from cross-reference metadata, not free-text parsing). Gives the proof page standalone value for readers and crawlers: a proof page is a natural unit of "what machinery does this argument depend on?"
- **Embedding context** — same structure as definition page: all three levels (book/chapter or article, and section) are clickable links, with the section linking to its anchor within the parent page.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md).** Breadcrumb, title
> and body stand. **"Uses" is not built** — sub-plan
> [D8](yp-162-page-layout-sub-plan.md#8-decision-log): the proof's body already *is* that list,
> in the order the argument uses it, with every citation a real link, so a separate
> block would restate the same edges out of context. **Remarks** and **Embedding
> context** move exactly as in §7.1 above — an ownership-chain link and the
> "Kontextus" panel. A proof page can also show "Fogalmak" if it ever defines terms
> (none do today), so the "defined terms" addition recorded in the implementation
> plan's §L.4 is likewise not a stacked block.

### 7.4 Remark page (`/…/megjegyzesek/{remark-slug}`)

Remarks can be owned by a definition, theorem, or proof; the breadcrumb reflects the actual ownership chain:
- Definition remark: Főoldal → Tudásbázis → Definíciók → {def-title} → Megjegyzés: {remark-title}
- Theorem remark: Főoldal → Tudásbázis → Tételek → {thm-title} → Megjegyzés: {remark-title}
- Proof remark: Főoldal → Tudásbázis → Tételek → {thm-title} → Bizonyítás: {proof-title} → Megjegyzés: {remark-title}

- **Breadcrumb** — as above, matching the ownership chain.
- **Title** — remark name or neutral label.
- **Body** — remark content, rendered with LaTeX.
- **Claims** — if the remark contains claims, each is an anchored section (`#claim-{slug}`), same treatment as theorem claims.
- **Referenced by** — other nodes that cite this remark.
- **Embedding context** — same structure as definition page: all three levels (book/chapter or article, and section) are clickable links, with the section linking to its anchor within the parent page.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md).** Breadcrumb, title
> and body stand, and the remark's link back up to its owner is an ownership-chain
> link below the body ([§6.1](yp-162-page-layout-sub-plan.md#61-the-header-and-the-content)).
> **Claims** keep their anchors — the grammar for them is the identifiers sub-plan's —
> but they are not a stacked section: they are the claims in the body, reached through
> the "Állítások" mode of the context menu
> ([§6.2, §6.3](yp-162-page-layout-sub-plan.md#62-the-context-menu)). **Referenced by** and
> **Embedding context** move as in §7.1 above.

### 7.5 Glossary page (`/fogalmak`)

A single page covering all terms across all definitions/theorems/remarks.

- **Search / filter bar** — client-side filtering by term name (no server round-trip needed given expected term volume).
- **Term list** — each entry shows: term name, a one-line excerpt from the defining node's context, a link to the defining anchor (`/definiciok/{slug}#term-{term-slug}` or equivalent), and a "referenced by N nodes" count.
- **No per-term body content** — terms have no independent prose; the glossary entry is purely a directory/index pointing to the defining node. This is intentional and consistent with the §3.3 decision.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md#4-the-glossary-page)
> (§4).** The **one-line excerpt** and the **"referenced by N nodes" count** are both
> dropped: the excerpt is expensive to make read well across hundreds of rows and the
> count is not what a reader looking a term up is asking. **Synonyms get their own
> rows**, alphabetized among the canonical forms rather than tucked under them, each
> naming the canonical form it belongs to and linking to the same defining anchor — so
> the page is one row per *name*, **342** of them (217 canonical, 125 synonyms).
> Ordering is Hungarian-alphabetical, the same collation the two index pages use. The
> client-side filter stands.

### 7.6 Definitions index page (`/definiciok`)

- **Breadcrumb** — Főoldal → Tudásbázis → Definíciók.
- **Title** — "Definíciók" (or localized equivalent).
- **Definition list** — all definitions, each shown with its title and a one-line summary or opening sentence. Linked to the individual definition page.
- **Search / filter** — client-side filtering by title.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md#5-the-definitions-and-theorems-index-pages)
> (§5).** No **one-line summary** per row. A row is the definition's **title, followed
> by its label in grey**, and links to its page; rows are ordered
> Hungarian-alphabetically by title. The client-side filter stands, and the two index
> pages are one design in two instances.

### 7.7 Theorems index page (`/tetelek`)

- **Breadcrumb** — Főoldal → Tudásbázis → Tételek.
- **Title** — "Tételek" (or localized equivalent).
- **Theorem list** — all theorems, each shown with its title and a one-line statement preview. Linked to the individual theorem page.
- **Search / filter** — client-side filtering by title.

> **Amended by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md#5-the-definitions-and-theorems-index-pages)
> (§5).** No **one-line statement preview** per row — a mechanically-taken opening
> sentence of a theorem is usually a fragment of LaTeX and reads worse than nothing. A
> row is the theorem's **title followed by its label in grey**
> (`Euler–Fermat tétel — 15.6. Tétel`), ordered Hungarian-alphabetically by title, with
> the same client-side filter and the same design as §7.6.

### 7.8 Knowledge base root page (`/`)

- **Breadcrumb** — Főoldal → Tudásbázis.
- **Title** — "Tudásbázis" (or localized equivalent).
- **Purpose** — entry point and orientation page for the knowledge base as a whole; primarily useful for search engine and LLM crawler discovery (linked from the site's main navigation).
- **Content blocks:**
  - Brief description of what the knowledge base contains and how it is structured.
  - Links to the three top-level sections: Definíciók (`/definiciok`), Tételek (`/tetelek`), Fogalmak (`/fogalmak`), each with a short description and node count.
  - No listing of individual nodes — that is the job of the index pages.

> **Adopted unchanged by the [page-layout sub-plan](yp-162-page-layout-sub-plan.md#3-the-knowledge-base-root-page)
> (§3)**, which adds only design notes: the three section links read as three cards of
> equal weight rather than a bulleted list, the count is legible at a glance, and the
> counts are the **published** counts — the nodes that actually have a page in the
> current environment.

---

## 8. Open questions / not yet decided

- [x] ~~Exact slugging rule for owned/nested nodes~~ — resolved: every node (definitions, theorems, proofs, remarks, claims, terms) has an author-supplied `slug` field in its content YAML, same pattern already used for books/chapters/sections. Claude Code has full codebase context and existing examples to follow.
- [x] ~~JSON-LD vocabulary finalization~~ — resolved: out of scope for this plan entirely, moved to a separate backlog item (see §5).
- [x] ~~Sitemap generation strategy~~ — resolved: per-type sitemap files + sitemap index (see §6.4).
- [ ] Whether Cloudflare Bulk Redirect List entry limits (plan-dependent, not yet checked against current YouProof account tier) are a real constraint — expected not to be, given rename rarity, but unverified. **Needs verification.**
- [ ] Confirm whether the Cloudflare provider requires the list resource to exist prior to zone-root ruleset *creation*, or only prior to first match at request time — affects whether `terraform/redirects/` must be applied once before the zone-root apply. **Needs verification.**
- [x] ~~Page design for all new page types~~ — resolved: see §7.

---

## 9. Explicitly rejected / superseded approaches (for context, avoid re-litigating without new information)

- Namespace-mirrored URLs (`/{locale}/{namespace-path}/tetelek/{slug}`) as canonical — rejected due to namespace instability.
- Dual-serving old+new slug URLs for the same node instead of 301 redirecting — rejected due to duplicate-content/authority-splitting risk and inconsistent AI-crawler respect for `rel=canonical`.
- Namespace-path URLs as routable-but-non-canonical (with canonical pointing elsewhere) — rejected in favor of simply never emitting namespace-path URLs anywhere on the site, which avoids the permalink-stability question entirely.
- Worker-based redirect handling in the request hot path — rejected in favor of Cloudflare Redirect Rules / Bulk Redirect Lists, to avoid reintroducing per-request compute in front of R2-direct serving.
- **Superseded: giving `claim` its own standalone canonical URL** (`/tetelek/{slug}/claim/{n}` or similar). Initially proposed reasoning was wrong on two counts: (a) it assumed claims are owned by proofs specifically — corrected, claims belong directly to whichever definition/theorem/remark asserts them; (b) it assumed claim references from elsewhere are rare/incidental — corrected, references like "axiom 2 in definition 12.3" inside a proof's reasoning are a common, real pattern. Despite the correction, still concluded no standalone page is warranted (see §3.3) — the citable target is a permanent node ID + fragment anchor on the parent's page, not a separate page, due to thin-content risk and absence of distinct search intent at that granularity.
- **Superseded: giving `term` its own standalone canonical URL as a "dictionary-style" page** (`/term/{slug}` with independent explanatory content). Initial reasoning claimed terms are independently glossable like a dictionary entry — shown to be wrong: terms are authored as marked spans inside a parent definition's sentence (e.g. `__eigenvalue__`) with no independent prose of their own, structurally identical to claims in that respect. Revised to: no standalone page for individual terms either; only a single searchable glossary index page (`/tudasbazis/fogalmak`) exists, linking out to anchors on defining parent pages (see §3.3).
- Reversibility note: both superseded decisions above are deliberately structured to be revisitable — if Search Console query data post-launch shows real, distinct search intent at claim- or term-level granularity, either can be promoted to a standalone page later (fragment → own canonical URL, with a redirect from the old anchor form) without breaking the graph model, since node IDs are already permanent and independent of page/anchor structure.
