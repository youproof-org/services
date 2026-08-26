# YP-162 sub-plan: identifiers, uniqueness constraints, and anchor grammar

**Parent plan:** [`yp-162-knowledge-graph-urls-implementation-plan.md`](yp-162-knowledge-graph-urls-implementation-plan.md)
(design: [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md))
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`
**Status:** proposed — awaiting approval. **Blocks parent phase 5** (routing and pages):
the anchor and reference shapes settled here are what the page components render.

> ### Working agreement (inherited from the parent plan)
>
> **Nothing is committed or pushed without approval.** Do the work, post a short
> summary of what changed and how it was verified, and wait for an explicit go.
>
> **Every phase ends with a review gate.** After a phase is committed, stop and wait
> for separate approval before starting the next one. Where a phase produces a
> **review artifact**, the artifact is what gets reviewed; derived content files are
> not written until it is approved.

---

## 1. What this sub-plan is for

Three things, in one piece of work because they are the same decision seen from
three sides:

1. **Constraints on names and slugs** — a character rule and a uniqueness scope for
   every identifier in the content model, enforced at build time rather than
   documented and hoped for.
2. **A hierarchical anchor grammar** — `definiciok.{d}.fogalmak.{f}` replacing the
   flat `fogalom-{f}` prefixes that shipped in parent phase 4.
3. **Fully qualified reference targets** — `theorems.{t}.proofs.{p}` as a single
   string, replacing the composite `{type, namespace, name}` / `{type, book, part,
   name}` / `{type, name, parent: {…}}` target objects.

(3) is what makes (1) load-bearing: once a reference is a dotted path, a name that
contains a `.` is unparseable and a name that is not unique in its scope is
unresolvable. And (2) is the same grammar with the localized segments and the slug
substituted for the canonical segments and the name.

---

## 2. Measured state of the content (2026-08-26)

Everything below was measured on the real tree at `content 8a9a364`, not on
fixtures.

| measurement | result |
|---|---|
| slugs containing `.` | **0** |
| names containing `.` | **0** |
| top-level `slug` values violating `^[a-z0-9]+(?:-[a-z0-9]+)*$` | **0** |
| top-level `name` values violating the same pattern | **2** — both sections, both only because of an uppercase set name (`muvelet-bevezetese-az-N-halmazon`, `hogyan-szorozzunk-a-Z-halmazon`); their slugs are correctly lowercased |
| book / article / newsletter / landing / page slug or name collisions | **0** |
| chapter slug or name collisions (per book, and globally) | **0** |
| section slug/name collisions **within a chapter** | **0** |
| section slug/name collisions **globally** | **1** — `hol-tartunk-most` in chapters 12 and 13. Allowed under the constraints below; it means the "global per-type name uniqueness" claim in `docs/i18n-design.md` §9 is **already false** |
| definition / theorem / proof / remark slug collisions, per type, ignoring namespace | **0** |
| KB entity name collisions across all four types, ignoring namespace | **0** of 537 |
| claim slug or name collisions within a parent | **0** |
| term slug collisions within a parent | **0** |
| claims or terms missing a `slug` | **0** of 150 / 217 |
| claim blocks on a `proof` | **0** of 190 proofs |
| claim blocks outside a KB entity | **0** |
| claim blocks nested inside a `subsection`/`details` | **0** |
| chapters whose `(book, name)` is ambiguous across parts | **0** |

Document counts: 1 book, 7 parts, 27 chapters, 210 sections, 14 namespaces, 84
definitions, 191 theorems, 190 proofs, 72 remarks, 4 articles, 2 newsletters, 4
pages, 1 landing.

Reference targets to migrate:

| carrier | count | carries |
|---|---|---|
| `references` entries | **6513** in 676 files | 78 external, 6090 KB-directed (4150 term, 754 theorem, 664 definition, 460 claim, 45 remark, 17 proof), 332 book-hierarchy (180 section, 152 chapter), 13 standalone (7 page, 4 article, 2 book) |
| `embed` block targets | **538** | all KB entity targets |
| `recall` block targets | **31** | all KB entity targets |
| **total target objects** | **7082** | |

**The content is already fully compliant** with every constraint in §4. This
sub-plan is therefore about *enforcement* and *shape*, not about fixing content —
with two exceptions: the 7082 target objects (§5) and, if we choose to, the two
uppercase section names ([Q1](#q1)).

---

## 3. The unified grammar

One grammar, two projections. This is the whole design.

```
path    ::= step ("." step)*
step    ::= container "." key
```

### 3.1 Internal projection — the fully qualified name (FQN)

Language-independent. Containers are **canonical English plurals**; keys are
**`name`** values. This is what a reference target is.

```
books.{book}
books.{book}.chapters.{chapter}
books.{book}.chapters.{chapter}.sections.{section}

articles.{article}          newsletters.{newsletter}
pages.{page}                landings.{landing}
{articles|newsletters|pages|landings}.{item}.sections.{section}

definitions.{definition}
theorems.{theorem}
theorems.{theorem}.proofs.{proof}

<entity>.remarks.{remark}          where <entity> ∈ { definitions.{d},
                                                     theorems.{t},
                                                     theorems.{t}.proofs.{p} }
<node>.terms.{term}                where <node>  ∈ <entity> ∪ <entity>.remarks.{r}
<node>.claims.{claim}              same, minus any node under `proofs.` (see D3)
```

Two things fall out of this that are worth stating plainly:

- **`namespace` disappears from every reference.** 6659 of the 7082 target objects
  currently carry a `namespace`, and a namespace reorganization therefore means
  rewriting them. Entity names are unique across all 537 nodes (§2), so the FQN
  needs no namespace, and the parent plan's stated principle — *"namespaces are
  expected to be reorganized, and moving a node between them must not move its
  URL"* — now extends to references as well.
- **`part` disappears from chapter and section references.** 332 targets carry one;
  `(book, name)` is unambiguous for every chapter (§2), and parts are already
  flattened out of URLs.

### 3.2 Public projection — the anchor

Localized container segments, `slug` values, and **relative to the page it is
rendered on**. The governing rule:

> **An anchor is the localized FQN of the node, rooted at the nearest ancestor that
> is the page — except that a knowledge-base entity is always rooted at its own type
> container**, exactly as its URL is.

The exception is what makes an embedded definition `definiciok.{d}` on a chapter
page rather than `szakaszok.{s}.definiciok.{d}`: a definition's address does not
depend on where it is embedded, in a URL or in a fragment.

That one rule generates every anchor listed in the brief. On a **content item page**
(chapter, or a standalone item with sections):

```
szakaszok.{section}

definiciok.{d}
definiciok.{d}.fogalmak.{term}
definiciok.{d}.allitasok.{claim}
definiciok.{d}.megjegyzesek.{r}
definiciok.{d}.megjegyzesek.{r}.fogalmak.{term}
definiciok.{d}.megjegyzesek.{r}.allitasok.{claim}

tetelek.{t}                       … .fogalmak.{term}   … .allitasok.{claim}
tetelek.{t}.megjegyzesek.{r}      … .fogalmak.{term}   … .allitasok.{claim}
tetelek.{t}.bizonyitasok.{p}      … .fogalmak.{term}
tetelek.{t}.bizonyitasok.{p}.megjegyzesek.{r}   … .fogalmak.{term}   … .allitasok.{claim}
```

On an **entity page**, the page node itself drops out of the path:

```
fogalmak.{term}
allitasok.{claim}
```

…and if the page-layout decision that gates parent phase 5 ends up rendering a
node's remarks or proofs **inline** on its page rather than as links, the same rule
already gives them anchors — `megjegyzesek.{r}`, `megjegyzesek.{r}.fogalmak.{f}`,
`bizonyitasok.{p}` — with no new grammar. That is the reason to express the rule
rather than enumerate the 18 cases: the enumeration is only complete for one
layout, and the layout is not settled yet.

### 3.3 Where the localized segments come from

Per the decision below, from `locales.json`'s existing **`containers`** dictionary,
which already supplies five of the seven plurals needed. Two keys are added:

| ContainerKey | `hu` segment | status |
|---|---|---|
| `definition` | `definiciok` | exists |
| `theorem` | `tetelek` | exists |
| `proof` | `bizonyitasok` | exists |
| `remark` | `megjegyzesek` | exists |
| `term` | `fogalmak` | exists |
| `claim` | `allitasok` | **new** |
| `section` | `szakaszok` | **new** |

The singular `anchors` dictionary added in parent phase 4 (`allitas`, `fogalom`,
`definicio`, `tetel`, `bizonyitas`, `megjegyzes`) becomes dead and is deleted,
along with `AnchorKey` and `getAnchorPrefix`.

---

## 4. The constraints

### 4.1 Character rules

| applies to | rule |
|---|---|
| every `slug` | `^[a-z0-9]+(?:-[a-z0-9]+)*$` — the pattern already documented in `content/docs/content-model.md`, now enforced. Subsumes the "no `.`" requirement. |
| every `name` | `^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$` — no `.`, no `/`, no whitespace, no `#`. Uppercase is tolerated so the two existing section names (§2) stay valid; see [Q1](#q1). |
| every term map key | same as `name` — the key *is* the term's name. |

`.` is the FQN and anchor separator, so a `.` in either identifier makes both
grammars ambiguous. `/` and `#` are excluded because a slug is a URL segment and an
anchor is a fragment.

### 4.2 Uniqueness — slugs (per locale)

| type | slug unique within |
|---|---|
| `book` / `article` / `newsletter` / `landing` | all items of that type |
| `page` | all pages — **and not equal to any container segment** |
| `chapter` | its parent book |
| `section` | its parent chapter (or its parent standalone item) |
| `definition` | all definitions |
| `theorem` | all theorems |
| `proof` | its owning theorem |
| `remark` | its owning definition / theorem / proof |
| `claim` | its owning definition / theorem / remark |
| `term` | its owning definition / theorem / proof / remark |

Note the **relaxation** against what shipped in parent phase 4: `validateKbSlugs`
today puts claims and terms in one shared per-node anchor namespace, because both
anchors were flat. Under §3.2 they sit under distinct `allitasok.`/`fogalmak.`
segments, so a claim and a term on the same node may now share a slug.

### 4.3 Uniqueness — names (locale-independent)

The same scopes, minus "per locale", **and** with each scope read against the FQN
grammar rather than the URL grammar. Because references are resolved by FQN, the
scope of a name is exactly its position in §3.1:

| type | name unique within |
|---|---|
| `book` / `article` / `newsletter` / `page` / `landing` | all items of that type |
| `part` | its parent book (parts have no slug and appear in no FQN — see [Q2](#q2)) |
| `chapter` | its parent book |
| `section` | its parent chapter / standalone item |
| `namespace` | its parent namespace (appears in no FQN — see [Q2](#q2)) |
| `definition` | all definitions |
| `theorem` | all theorems |
| `proof` | its owning theorem |
| `remark` | its owning definition / theorem / proof |
| `claim` | its owning definition / theorem / remark |
| `term` | its owning node (automatic — it is a map key) |

This is the scope you specified, and switching references to FQNs is what makes it
sound. Under the *current* composite target shape it would not be: a proof is
addressed as `{type: proof, namespace, name}` with no parent, and
`graph.proofs` is keyed by `namespace + name`, so two proofs of different theorems
in one namespace would resolve ambiguously and silently overwrite each other in the
graph. The FQN carries the parent, so the constraint and the addressing scheme
agree.

**Not required, and deliberately so:** a definition and a theorem may share a name,
and a section in chapter 12 may share a name with a section in chapter 13 (which
one does today). `docs/i18n-design.md` §9 currently asserts global per-type name
uniqueness; that sentence is wrong today and gets corrected.

---

## 5. Decision log

<a id="d1"></a>
### D1 — Anchor segments come from `containers`, not from a separate dictionary *(settled)*

`containers` gains `claim: allitasok` and `section: szakaszok`; the anchor helpers
read `getContainerSegment`; the `anchors` dictionary is deleted. One word, one
place: an anchor segment and a URL segment for the same concept can no longer
drift apart.

Two consequences, both wanted:

- `/hu/allitasok` and `/hu/szakaszok` become resolvable container segments, so
  `resolvePath` must reject them at `path[0]` — the same rejection the parent plan
  already schedules for `definiciok`/`tetelek`/… in phase 5 H.1.
- The custom-page collision guard at `page.tsx:180` picks up both for free: a page
  slugged `allitasok` becomes a build error.

Cost: `ContainerKey`'s doc comment currently reads "the localized URL segment for
each is looked up per locale", and two of its members are now anchor-only. The
comment gets rewritten; the type keeps one name per content container, which is
the honest description either way.

<a id="d2"></a>
### D2 — Reference targets become fully qualified name strings *(settled)*

`target` stops being a composite object and becomes an FQN string per §3.1. The
`type` field goes away — the leading container determines the root type and the
last container determines the leaf type, so a declared type is redundant and can
only disagree with the path. (It already does: parent phase 4 found two proofs
declaring `type: definition` on a theorem target, harmless only because resolution
ignored the declared type.)

```yaml
# before                                    # after
references:                                 references:
  gyuru:                                      gyuru:
    display: "…"                                 display: "…"
    target:                                      target: definitions.gyuru
      type: definition
      namespace: /absztrakt-algebra/…
      name: gyuru
  disztributiv:                                disztributiv:
    display: "…"                                 display: "…"
    target:                                      target: theorems.gyuru-muveletei.claims.disztributiv
      type: claim
      name: disztributiv
      parent:
        type: theorem
        namespace: /absztrakt-algebra/…
        name: gyuru-muveletei
```

`embed` and `recall` block targets take the same form (569 of them).

The `external` target is the one shape an FQN cannot express; see [Q3](#q3).

<a id="d3"></a>
### D3 — Claims on proofs are forbidden *(settled)*

A `claim` block inside a `proof` body is a build error. `content/docs/content-model.md`
already lists only `definition | theorem | remark` as legal claim-reference parents,
no content has one (0 of 190 proofs), and a proof is one argument rather than a set
of numbered assertions. So the FQN and anchor grammars have no
`…proofs.{p}.claims.{c}` production.

**Terms on proofs stay fully supported** — that asymmetry is deliberate and is
restated in the content model, because parent-plan A8 records it as a wanted
authoring feature and the code already carries it end to end.

<a id="d4"></a>
### D4 — A tolerant target reader bridges the two-repo migration *(settled)*

The services loader is taught the FQN form **before** the content is migrated, and
keeps accepting the legacy object form until the migration lands. Without that, the
content repo and the services repo have to change in the same instant, and no
intermediate commit builds — which is both unreviewable and un-bisectable across
7082 edits. The legacy branch is deleted in the last phase, and its removal is what
proves the migration was total.

<a id="d5"></a>
### D5 — Missing claim/term slugs keep falling back to the name *(settled)*

`claim.slug ?? claim.name` and `term.slug ?? termKey` stay. All 367 are authored
today, but the editor legitimately drops a claim's slug when the claim is renamed
(editor `handlers.ts`, `collectClaimSlugs`), and an English anchor segment is a
better failure mode than a crash or `#undefined`. §4.1's name rule keeps the
fallback grammatically safe.

---

## 6. Open questions

<a id="q1"></a>
**Q1 — the two uppercase section names.** `muvelet-bevezetese-az-N-halmazon` and
`hogyan-szorozzunk-a-Z-halmazon` carry an uppercase set name; their slugs are
correctly lowercased. Options: (a) tolerate uppercase in `name` — the §4.1 rule as
written, zero content change; (b) normalize both names to lowercase and enforce the
strict slug pattern for names too — touches 2 section files plus any reference
naming them, and loses the `N`/`Z` distinction that makes the name readable.
**Recommendation: (a).** The name is an internal id; the readability of `az-N-halmazon`
is worth more than a uniform pattern.

<a id="q2"></a>
**Q2 — `part` and `namespace`.** Neither has a slug and neither appears in an FQN
(D2 removes both). They still have names, and a duplicate silently overwrites a map
entry today. **Recommendation:** constrain them anyway — `part` name unique within
its book, `namespace` name unique within its parent namespace — since the cost is
two more lines in the same validator.

<a id="q3"></a>
**Q3 — the shape of an external target.** A URL is not a name, so it has no FQN.
Options: (a) `target` is a string for internal targets and stays an object
`{ url: … }` for external ones — explicit, but `target` becomes a union type;
(b) `target` is always a string and an external one is the URL itself, discriminated
by the `://` an FQN can never contain — uniform, but the grammar depends on
sniffing; (c) external moves to a sibling field, `url:` alongside `display:`.
**Recommendation: (a).** 78 entries, and a union of "path" and "object with a url"
is easier to read in a diff and in the editor than a string that means two things.

<a id="q4"></a>
**Q4 — sections of standalone items.** `StandaloneSection` exists in the model with
a `slug` (in-page anchor), and no article/newsletter/page/landing uses it today.
**Recommendation:** give it the same constraints and the same `szakaszok.{slug}`
anchor as a chapter section. Free now, and it stops the first standalone section
from arriving with a different anchor shape than every other section on the site.

<a id="q5"></a>
**Q5 — a fragment-integrity gate.** Nothing today verifies that a `#fragment` in an
internal href matches an id the build actually renders; the parent plan's "11 085
internal fragment hrefs, 0 broken" was a one-off measurement, and the crawler
strips fragments (`crawl.mjs:80`). This sub-plan rewrites every one of those 11 085
fragments. **Recommendation:** add `validateAnchors(graph)` — every fragment
produced by `resolveRefHrefs` must be an anchor the anchor builder emits for a node
this build renders — as a build error, alongside `validateKbLinks`. This is the
only automated protection the anchor rework gets, and it is cheap: both sides are
already derived from the same graph.

---

## 7. Phases

Ordered so that each phase's gate is verifiable on its own, and so the two
cross-repo hand-offs (editor before content, services before content) happen the
same way parent phases 2→3 did.

### S1 — Specification and documentation *(review artifact)*

No code. Write the grammar and the constraint tables down first, because four
documents currently disagree with each other and with the content.

1. `content/docs/content-model.md` — the §3.1 FQN grammar as **the** reference
   target shape; the §4 character rules and both uniqueness tables (replacing the
   single per-locale slug table); D3's claims-on-proofs prohibition; the
   terms-on-proofs allowance restated; `part`/`namespace` per [Q2](#q2).
2. `services/docs/i18n-design.md` — rewrite §9. Its slug table is superseded by
   §4.2, and its claim that `name` keeps "global per-type uniqueness" is **already
   false** (two sections named `hol-tartunk-most`) and is replaced by §4.3.
3. `services/docs/content-site-and-static-generation.md` — the anchor grammar next
   to the canonical-URL rule.
4. This document's decision log, with [Q1](#q1)–[Q5](#q5) resolved.

**Gate:** the four documents agree with each other and with §2's measurements.

### S2 — Services: enforce the constraints

Validators only; no behaviour change. Green on today's content on the first run,
which is the point — the constraints are being *pinned*, not introduced.

1. `lib/content/graph.ts` — a new `validateIdentifiers(graph)` replacing and
   widening `validateKbSlugs`: the §4.1 character rules, the §4.2 slug scopes and
   the §4.3 name scopes, for **content objects as well as KB nodes**. Nothing
   validates book/chapter/section/standalone slugs today; `graph.chapters.set(…)`
   and friends silently overwrite on a duplicate key, and so do the raw-scan
   `bookByName`/`chapterByName`/`sectionByName` maps in the loader pass.
2. The `page`-slug-vs-container-segment guard moves out of
   `generateStaticParams` (`page.tsx:180`) into the same validator, so it fires in
   every consumer rather than only during static param generation.
3. D3 — reject a `claim` block inside a `proof` body.
4. Tests: one per scope, each asserting the *positive* case too (two proofs of
   different theorems may share a slug; a definition and a theorem may share a
   name; two chapters in different books may share a slug).

**Gate:** `next build` and `pnpm test` green, unchanged output; each new rule has a
test that fails when the rule is removed.

### S3 — Services: the anchor grammar

1. `lib/i18n/locales.json` + `config.ts` — add `claim`/`section` to `containers`;
   delete the `anchors` dictionary, `AnchorKey` and `getAnchorPrefix`.
2. `lib/content/urls.ts` — replace `claimAnchorId` / `termAnchorId` /
   `entityAnchorId` with one builder that walks a node's ancestor chain and emits
   the §3.2 path, plus a page-context argument so the same node yields
   `definiciok.{d}.fogalmak.{f}` on a chapter page and `fogalmak.{f}` on its own.
   Keep the phase-4 property that the builder takes the **owning node** rather than
   a locale string, so the locale cannot drift.
3. Call sites: `SectionView` (`id={slug}` → `szakaszok.{slug}`), `EmbeddedEntity`,
   `ClaimBlock`, `InlineText`, `resolveRefHrefs`, `buildBacklinkIndex`,
   `buildGlossary`, `backlinkOrigin` (which builds a section anchor by hand at
   `graph.ts:1155`).
4. [Q5](#q5) — `validateAnchors(graph)`.
5. Rewrite the phase-4 test that asserts an anchor does not start with
   `definition-`/`claim-`/… — it is asserting the shape this phase replaces.

**Note for parent phase 5:** a `.` in an id is valid HTML and needs no URL
encoding, but it is a class separator in a CSS selector. `document.querySelector('#' + id)`
breaks; `getElementById`, `:target` and `[id="…"]` do not. Phase 5's F2
cross-highlighting keys on `data-target-anchor` attributes, which is safe — this is
a note to keep it that way, not a defect.

**Gate:** `next build` green; every fragment in the export is a §3.2 path; no
English segment anywhere; `validateAnchors` passes; re-measure the fragment count
against phase 4's 11 085.

### S4 — Services: parse FQN reference targets

1. `lib/content/types.ts` — `RefTarget` loses `namespace`/`part`/`parent` and gains
   the resolved ancestor chain. The eight target interfaces collapse toward one
   parsed-path shape plus `ExternalRefTarget`.
2. `lib/content/loader.ts` — an FQN parser and resolver, tolerant of the legacy
   object form per [D4](#d4), with the legacy path marked for deletion in S7.
3. `resolveRefHrefs`, `buildBacklinkIndex`, `validateReferences`,
   `validateTermInsertions`, `display-template`'s `{target.*}` expressions — all
   read the parsed chain instead of re-deriving parents from `namespace`.
4. `embed` and `recall` block targets, same reader.
5. Tests: the parser against one example of each §3.1 production; an unparseable
   FQN, an unknown key, and a well-formed path whose leaf type is illegal
   (`…proofs.{p}.claims.{c}`) each fail with a message naming the file.

**Gate:** `next build` green **on unmigrated content** through the legacy reader,
with byte-identical output.

### S5 — Editor: FQN targets

Hard prerequisite for S6, exactly as parent phase 2 was for phase 3: the editor
rewrites `references`, `embed` and `recall` field by field on save, so it must emit
FQNs before any content file is saved after S6.

1. `src/content/loader.ts` — `resolveTarget` reads an FQN (and, transitionally, the
   legacy object).
2. `src/handlers.ts` — `targetToYaml` emits an FQN. It currently reconstructs
   `book`/`part`/`namespace` from the loaded object graph; it now walks the same
   ancestor chain and joins it. Its "claims nested in subsections/details are not
   supported" throw stays — 0 content files exercise it.
3. The §4.1 character rules and the §4.2/§4.3 uniqueness scopes as editor-side
   validation, so a bad identifier is caught at authoring time and not only at
   build time. Mirrored by hand, per the i18n design's no-shared-schema decision,
   with a pointer comment to the services validator.
4. Extend the phase-2 round-trip test: load a file with FQN targets, save without
   editing, assert byte-identical.

**Gate:** round-trip test green; `pnpm editor:install-dev` from the content repo
(**not** `editor:install` — that installs the last released VSIX and would silently
discard this phase), `npm run build` in the editor first, reload the VS Code window
after.

### S6 — Content: migrate 7082 targets to FQNs

1. `scripts/migrate-ref-targets.mjs` — one-off, line-based (not a YAML re-dump),
   idempotent, `--write` to apply, dry-run by default, modelled on
   `migrate-kb-slug.mjs`. Builds the name→ancestor-chain index from the tree, then
   rewrites each target object as a single `target:` line.
2. **Two commits**, so either can be reverted alone: the 6513 `references` entries,
   then the 569 `embed`/`recall` targets.
3. Verify: re-running the script is a no-op; a services build against the migrated
   content produces byte-identical output to the pre-migration build; opening and
   saving each of a definition, theorem, proof, remark, chapter and section in the
   editor is byte-identical.

**Gate:** the three verifications above, plus a diff summary showing 7082 target
objects removed and 7082 `target:` lines added and nothing else.

### S7 — Services: drop the legacy reader, sweep tests and docs

1. Delete the legacy target-object branch from the loader and its tests. Its
   removal is the proof that S6 was total: the build fails if one object survives.
2. Full test sweep — the identifier validators, the anchor builder in both page
   contexts, the FQN parser, `validateAnchors`, `kbRefs`, the glossary and backlink
   index against the new anchors.
3. Re-verify the S1 documents against the shipped behaviour.
4. Re-measure: fragment count, page count, build wall time against parent-plan A18.

**Gate:** `pnpm test` and `next build` green in both `SITE_ENV` modes; parent
phase 5 unblocked.

---

## 8. Out of scope

- **Page layout and components.** Unchanged from the parent plan: parent phase 5
  stays gated on the layout decision. This sub-plan settles what the anchors and
  references *are*, not how a page arranges them.
- **Slug-rename redirects.** Still the separate ticket the parent plan defers to
  (§6 of the design). Relevant here only as an observation: nothing this sub-plan
  changes is deployed yet — parent phase 4 sits on an unmerged branch — so no live
  URL or anchor breaks, and no redirect is owed.
- **Standalone-item entity embeds.** `StandaloneNode` renders with no embed
  indices; the anchor grammar covers its sections ([Q4](#q4)) and nothing more.
- **`subsection` / `details` anchors.** Neither has a slug and neither is
  addressable; they stay that way.
- **A second locale.** Everything is per-node `locale` and every segment comes from
  `locales.json`, so an `en` KB needs a dictionary entry and no code change. No `en`
  content is produced.

---

## 9. Risks

| # | risk | mitigation |
|---|---|---|
| S-R1 | **The 7082-target migration silently mis-resolves an ancestor** — e.g. attaches a term to the wrong parent — and the build still passes because the wrong target also exists | Byte-identical rendered output before and after is the gate, not "the build passes". §2 measured 0 ambiguities in every FQN scope, so a correct script has no judgement calls to make |
| S-R2 | **Two-repo lock-step.** Services cannot read migrated content, or content cannot be read by services, for the span of a phase | [D4](#d4)'s tolerant reader; S7's deletion of it is what proves the migration was total |
| S-R3 | **Editor destroys FQNs on the first save after S6**, the exact failure parent-plan A15/R4 hit with claim slugs | S5 ships and is installed before S6 writes anything; the round-trip test is extended rather than re-invented |
| S-R4 | **The anchor rework breaks 11 085 in-page links** with no automated detection | [Q5](#q5)'s `validateAnchors`; without it this sub-plan has no gate on its headline change |
| S-R5 | **`.` in an id** breaks a future `querySelector('#'+id)` | Documented at S3; phase 5's F2 already keys on `data-target-anchor`, and `getElementById`/`:target`/`[id="…"]` are unaffected |
| S-R6 | **A constraint is enforced that real content violates**, blocking the build on something legitimate | §2 measured every constraint against the whole tree: 0 violations except the 2 uppercase section names, which [Q1](#q1) settles explicitly rather than by accident |
