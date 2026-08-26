# YP-162 sub-plan: identifiers, uniqueness constraints, and anchor grammar

**Parent plan:** [`yp-162-knowledge-graph-urls-implementation-plan.md`](yp-162-knowledge-graph-urls-implementation-plan.md)
(design: [`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md))
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor`
**Status:** revision 2 — all five open questions resolved (§6). Awaiting approval to
start S1. **Blocks parent phase 5** (routing and pages): the anchor and reference
shapes settled here are what the page components render.

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

1. **Constraints on names and slugs** — one character rule and one uniqueness scope
   for every identifier in the content model, enforced at build time rather than
   documented and hoped for.
2. **A hierarchical anchor grammar** — `definiciok.{d}.fogalmak.{f}` replacing the
   flat `fogalom-{f}` prefixes that shipped in parent phase 4.
3. **Fully qualified reference targets** — `theorems.{t}.proofs.{p}` as a single
   string, replacing the composite `{type, namespace, name}` / `{type, book, part,
   name}` / `{type, name, parent: {…}}` target objects.

(3) is what makes (1) load-bearing: once a reference is a dotted path, a name
containing a `.` is unparseable and a name that is not unique in its scope is
unresolvable. And (2) is the same grammar with the localized segments and the slug
substituted for the canonical segments and the name.

---

## 2. Measured state of the content (2026-08-26)

Everything below was measured on the real tree at `content 8a9a364`, not on
fixtures.

| measurement | result |
|---|---|
| slugs containing `.` — any kind | **0** |
| names containing `.` — any kind | **0** |
| `slug` values violating `^[a-z0-9]+(?:-[a-z0-9]+)*$` (top-level, claim, term) | **0** |
| **`name` values violating the same pattern** | **14** — see §2.1 |
| book / article / newsletter / landing / page slug or name collisions | **0** |
| chapter slug or name collisions (per book, and globally) | **0** |
| part name collisions per book | **0** — and **no part has a `slug` at all** (§2.2) |
| namespace name collisions | **0** of 14 |
| section slug/name collisions **within a chapter** | **0** |
| section slug/name collisions **globally** | **1** — `hol-tartunk-most` in chapters 12 and 13. Allowed under §4.3; it means the "global per-type name uniqueness" claim in `docs/i18n-design.md` §9 is **already false** |
| definition / theorem / proof / remark slug collisions, per type, ignoring namespace | **0** |
| KB entity name collisions across all four types, ignoring namespace | **0** of 537 |
| claim slug or name collisions within a parent | **0** |
| term slug collisions within a parent | **0** |
| claims or terms missing a `slug` | **0** of 150 / 217 |
| claim blocks on a `proof` | **0** of 190 proofs |
| claim blocks outside a KB entity, or nested in a `subsection`/`details` | **0** |
| chapters whose `(book, name)` is ambiguous across parts | **0** |
| `references` map keys containing a `.` | **0** |

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

External targets are **74 `https:` and 4 `mailto:`** — all 78 carry a scheme, and
4 of them have no `//`, which [D9](#d9) depends on.

### 2.1 The 14 non-conforming names

Every one is an uppercase mathematical symbol embedded in an otherwise kebab-case
name. Resolved by [D6](#d6) — normalize all 14.

| kind | identifier | owner |
|---|---|---|
| section name | `muvelet-bevezetese-az-N-halmazon` | ch. 11 |
| section name | `hogyan-szorozzunk-a-Z-halmazon` | ch. 14 |
| claim name ×3 | `P-is-closed-under-addition`, `P-is-closed-under-multiplication`, `zero-is-not-in-P` | theorem `pozitivitastartomany-szukseges-es-elegseges-feltetele` |
| claim name ×7 | `mod-I-congruence-is-reflexive`, `-is-symmetric`, `-is-transitive`, `-divisors-of-modulus`, `operations-between-mod-I-congruences`, `operations-between-constant-and-mod-I-congruence`, `power-of-mod-I-congruence` | remark `egesz-szamok-kozotti-kongruencia-tulajdonsagai-bizonyitas-megjegyzes` |
| term key | `complement-in-A` | definition `halmazmuveletek` |

Blast radius of normalizing all 14, measured: **2 section files + 2 KB entity files
+ 1 definition file**, plus **3 references** naming the two sections, **2
references** naming the uppercase claims, **2 chapter `sections:` ordering-list
entries**, and **1 inline `[[complement-in-A]]`** occurrence. Lowercasing produces
**0 collisions** in any scope. The two section *filenames* also carry the uppercase
(`05-muvelet-bevezetese-az-N-halmazon.yaml`) and get `git mv`d to match.

All 14 slugs are already correctly lowercased, so after normalization each of these
names equals its slug.

### 2.2 Parts have no slug

All 7 `part.yaml` files carry exactly `type`, `name`, `locale`, `title` — no
`slug` — and `PartNode` in `types.ts` carries neither `slug` **nor `locale`**.
[D7](#d7) adds both, because a part anchor needs a slug to be built from and a
locale to be localized with.

**The content is otherwise already fully compliant** with every constraint in §4.
This sub-plan is therefore mostly about *enforcement* and *shape*; the content
edits it requires are the 14 names of §2.1, 7 part slugs, and the 7082 target
objects of §5.

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
books.{book}.parts.{part}
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

**A part is a sibling branch, not an ancestor of a chapter.** `books.{b}.parts.{p}`
is a leaf; chapters hang off `books.{b}.chapters.{c}` directly. The FQN tree mirrors
the **address** tree, not the containment tree — chapter URLs already flatten parts
out, `(book, name)` is unambiguous for all 27 chapters, and a chapter moving between
parts must not change its address. Adding the `parts.` production for
[D7](#d7)'s anchors also makes a part *referenceable* for free; see [D8](#d8).

Two things fall out of this that are worth stating plainly:

- **`namespace` disappears from every reference.** 6659 of the 7082 target objects
  currently carry a `namespace`, so a namespace reorganization means rewriting them
  all. Entity names are unique across all 537 nodes (§2), so the FQN needs no
  namespace, and the parent plan's stated principle — *"namespaces are expected to
  be reorganized, and moving a node between them must not move its URL"* — now
  extends to references as well.
- **`part` disappears from chapter and section references.** 332 targets carry one.

### 3.2 Public projection — the anchor

Localized container segments, `slug` values, and **relative to the page it is
rendered on**. The governing rule:

> **An anchor is the localized FQN of the node, rooted at the nearest ancestor that
> is the page — except that a knowledge-base entity is always rooted at its own type
> container**, exactly as its URL is.

The exception is what makes an embedded definition `definiciok.{d}` on a chapter
page rather than `szakaszok.{s}.definiciok.{d}`: a definition's address does not
depend on where it is embedded, in a URL or in a fragment.

That one rule generates every anchor in the brief. On a **book index page**:

```
reszek.{part}
```

On a **content item page** (chapter, or a standalone item with sections):

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
rather than enumerate the cases: an enumeration is only complete for one layout, and
the layout is not settled yet.

### 3.3 Where the localized segments come from

Per [D1](#d1), from `locales.json`'s existing **`containers`** dictionary, which
already supplies five of the eight plurals needed. Three keys are added:

| ContainerKey | `hu` segment | status |
|---|---|---|
| `definition` | `definiciok` | exists |
| `theorem` | `tetelek` | exists |
| `proof` | `bizonyitasok` | exists |
| `remark` | `megjegyzesek` | exists |
| `term` | `fogalmak` | exists |
| `claim` | `allitasok` | **new** |
| `section` | `szakaszok` | **new** |
| `part` | `reszek` | **new** ([D7](#d7)) |

The singular `anchors` dictionary added in parent phase 4 (`allitas`, `fogalom`,
`definicio`, `tetel`, `bizonyitas`, `megjegyzes`) becomes dead and is deleted,
along with `AnchorKey` and `getAnchorPrefix`.

---

## 4. The constraints

### 4.1 Character rule

**One rule, for every name and every slug in the content model:**

```
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

Applies to: every `slug`; every `name`; every `terms` map key (the key *is* the
term's name); and, by [D7](#d7), part slugs. Per [D6](#d6) the 14 identifiers of
§2.1 are normalized to satisfy it.

`.` is the FQN and anchor separator, so a `.` in either identifier makes both
grammars ambiguous — that is the constraint that has to hold. Enforcing the full
kebab pattern rather than just "no dots" costs nothing extra once §2.1 is
normalized, and it removes the name/slug asymmetry entirely: after S2, a name and a
slug are the same shape of string, differing only in language.

Deliberately **not** constrained: `references` map keys (the `[key]` used in inline
markup). They are not part of either grammar; 0 contain a `.` today anyway.

### 4.2 Uniqueness — slugs (per locale)

| type | slug unique within |
|---|---|
| `book` / `article` / `newsletter` / `landing` | all items of that type |
| `page` | all pages — **and not equal to any container segment** |
| `part` | its parent book |
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
grammar rather than the URL grammar. Because references resolve by FQN, the scope of
a name is exactly its position in §3.1:

| type | name unique within |
|---|---|
| `book` / `article` / `newsletter` / `page` / `landing` | all items of that type |
| `part` | its parent book |
| `chapter` | its parent book |
| `section` | its parent chapter / standalone item |
| `namespace` | its parent namespace |
| `definition` | all definitions |
| `theorem` | all theorems |
| `proof` | its owning theorem |
| `remark` | its owning definition / theorem / proof |
| `claim` | its owning definition / theorem / remark |
| `term` | its owning node (automatic — it is a map key) |

Switching references to FQNs is what makes this scope sound. Under the *current*
composite target shape it would not be: a proof is addressed as
`{type: proof, namespace, name}` with no parent, and `graph.proofs` is keyed by
`namespace + name`, so two proofs of different theorems in one namespace would
resolve ambiguously and silently overwrite each other in the graph. The FQN carries
the parent, so the constraint and the addressing scheme agree.

**Not required, and deliberately so:** a definition and a theorem may share a name,
and a section in chapter 12 may share a name with one in chapter 13 (which happens
today). `docs/i18n-design.md` §9 currently asserts global per-type name uniqueness;
that sentence is false today and gets corrected.

`namespace` names appear in no FQN and no anchor — they are grouping path strings
only — but are constrained anyway, per [D8](#d8), because the cost is one more case
in the same validator.

---

## 5. Decision log

<a id="d1"></a>
### D1 — Anchor segments come from `containers`, not a separate dictionary *(settled)*

`containers` gains `claim: allitasok`, `section: szakaszok` and `part: reszek`; the
anchor helpers read `getContainerSegment`; the `anchors` dictionary is deleted. One
word, one place: an anchor segment and a URL segment for the same concept can no
longer drift apart.

Two consequences, both wanted:

- `/hu/allitasok`, `/hu/szakaszok` and `/hu/reszek` become resolvable container
  segments, so `resolvePath` must reject them at `path[0]` — the same rejection the
  parent plan already schedules for `definiciok`/`tetelek`/… in phase 5 H.1.
- The custom-page collision guard at `page.tsx:180` picks up all three for free: a
  page slugged `allitasok` becomes a build error.

Cost: `ContainerKey`'s doc comment currently reads "the localized URL segment for
each is looked up per locale", and three of its members are now anchor-only. The
comment gets rewritten; the type keeps one name per content container, which is the
honest description either way.

<a id="d2"></a>
### D2 — Reference targets become fully qualified name strings *(settled)*

`target` stops being a composite object and becomes an FQN string per §3.1. The
`type` field goes away — the leading container determines the root type and the last
container determines the leaf type, so a declared type is redundant and can only
disagree with the path. (It already does: parent phase 4 found two proofs declaring
`type: definition` on a theorem target, harmless only because resolution ignored the
declared type.)

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

<a id="d3"></a>
### D3 — Claims on proofs are forbidden *(settled)*

A `claim` block inside a `proof` body is a build error. `content/docs/content-model.md`
already lists only `definition | theorem | remark` as legal claim-reference parents,
no content has one (0 of 190 proofs), and a proof is one argument rather than a set
of numbered assertions. So neither grammar has a `…proofs.{p}.claims.{c}` production.

**Terms on proofs stay fully supported** — that asymmetry is deliberate and is
restated in the content model, because parent-plan A8 records it as a wanted
authoring feature and the code already carries it end to end.

<a id="d4"></a>
### D4 — A tolerant target reader bridges the two-repo migration *(settled)*

The services loader learns the FQN form **before** the content is migrated, and
keeps accepting the legacy object form until the migration lands. Without that, the
content repo and the services repo have to change in the same instant and no
intermediate commit builds — which is both unreviewable and un-bisectable across
7082 edits. The legacy branch is deleted in the last phase, and its removal is what
proves the migration was total.

<a id="d5"></a>
### D5 — Missing claim/term slugs keep falling back to the name *(settled)*

`claim.slug ?? claim.name` and `term.slug ?? termKey` stay. All 367 are authored
today, but the editor legitimately drops a claim's slug when the claim is renamed
(editor `handlers.ts`, `collectClaimSlugs`), and an English anchor segment is a
better failure mode than a crash or `#undefined`. §4.1's single character rule keeps
the fallback grammatically safe in a way the old two-rule split would not have.

<a id="d6"></a>
### D6 — Names take the same strict pattern as slugs; the 14 exceptions are normalized *(settled — was Q1)*

One character rule (§4.1) rather than a lax rule for names and a strict one for
slugs. Cost: the 14 renames of §2.1, ~7 files, 0 collisions.

**Recorded so the S2 gate can reverse it if the result reads badly:** the uppercase
in these names is meaningful — `P` is a positivity domain, `I` an ideal, `A` a set —
and lowercasing costs readability that a name, being an internal id, may not owe
anyone: `mod-I-congruence-is-reflexive` → `mod-i-congruence-is-reflexive`,
`complement-in-A` → `complement-in-a`, `zero-is-not-in-P` → `zero-is-not-in-p`.
The alternative was tolerating `[A-Z]` in names only. Chosen against, because a
single rule for both identifier kinds is worth more than the case distinction in 14
names, and because these names are never reader-visible — the localized `slug`,
already lowercase, is what appears in a URL.

<a id="d7"></a>
### D7 — Parts become addressable on the book index page *(settled — was Q2)*

Parts get an anchor, `reszek.{part-slug}`, on the book index page. That requires,
for the first time, that a part have a `slug`:

- **content** — `slug` on all 7 `part.yaml` files, backfilled from `name` (which is
  already clean kebab-case, so slug = name), inserted after `name` per the
  key-order rule parent phase 3 settled.
- **`types.ts`** — `PartNode` gains `slug` **and `locale`**; it has neither today.
  The locale is what localizes the anchor segment, and taking it from the part
  rather than from a string argument is the phase-4 invariant that keeps a locale
  from drifting away from the node it labels.
- **`loader.ts`** — `readLocale` / `readSlug` on the part, as every other node type
  already does.
- **`BookIndex.tsx:56`** — the existing per-part `<div key={part.name}>` wrapping an
  `<h3>` takes the anchor id.
- **`containers`** — `part: reszek`.
- Uniqueness: slug within the parent book per locale, name within the parent book
  (§4.2, §4.3). 0 collisions today.

<a id="d8"></a>
### D8 — `part` and `namespace` are constrained; a part reference becomes expressible *(settled — was Q2)*

Both are constrained per §4.2/§4.3 even though a namespace appears in neither
grammar and had, until D7, no slug: a duplicate name silently overwrites a map entry
today, and the cost of catching it is one more case in the validator that S3 is
building anyway.

Adding the `books.{b}.parts.{p}` production for D7's anchor also makes a **part
reference** expressible. Allowed: a part is now addressable, and refusing to let
anything link to an anchor the site emits would be an arbitrary hole. No content
uses one; the resolver handles it because the grammar does, not as a special case.

<a id="d9"></a>
### D9 — An external target is the URL itself *(settled — was Q3)*

`target` is **always a string**. An internal target is an FQN; an external target is
the URL, discriminated by its scheme:

```yaml
target: definitions.gyuru                  # FQN
target: https://example.org/x              # external
target: mailto:hello@youproof.org          # external
```

The discriminator is `^[a-z][a-z0-9+.-]*:` — a **scheme test, not a `://` test**.
4 of the 78 external targets are `mailto:` and have no `//`; a `://` check would
mis-parse all four as FQNs. §4.1 forbids `:` in every name and the container
segments are a fixed set, so no FQN can ever match the scheme pattern.

<a id="d10"></a>
### D10 — Standalone item sections get the same treatment *(settled — was Q4)*

`StandaloneSection` exists in the model with a `slug`, and no article / newsletter /
page / landing uses it today. It gets §4's constraints and the same
`szakaszok.{slug}` anchor as a chapter section — free now, and it stops the first
standalone section from arriving with a different anchor shape than every other
section on the site.

<a id="d11"></a>
### D11 — A fragment-integrity gate ships with the anchor rework *(settled — was Q5)*

Nothing today verifies that a `#fragment` in an internal href matches an id the
build actually renders; the parent plan's "11 085 internal fragment hrefs, 0 broken"
was a one-off measurement, and the crawler strips fragments (`crawl.mjs:80`). This
sub-plan rewrites every one of those fragments, so `validateAnchors(graph)` ships
with it: every fragment `resolveRefHrefs` produces must be an anchor the anchor
builder emits for a node this build renders, as a build error alongside
`validateKbLinks`. Cheap — both sides derive from the same graph — and it is the
only automated protection the headline change gets.

---

## 6. Phases

Ordered so each gate is verifiable on its own, and so the two cross-repo hand-offs
happen the way parent phases 2→3 did: the writer ships before the writing.

### S1 — Specification and documentation *(review artifact, no code)*

Write the grammar and the constraint tables down first, because four documents
currently disagree with each other and with the content.

1. `content/docs/content-model.md` — §3.1 as **the** reference-target shape; §4.1's
   single character rule; both uniqueness tables (replacing the single per-locale
   slug table); [D3](#d3)'s claims-on-proofs prohibition with the terms-on-proofs
   allowance restated; `part` gaining a `slug` ([D7](#d7)) and its "no slug — parts
   are flattened out of URLs" note rewritten; `namespace` per [D8](#d8);
   [D9](#d9)'s external form.
2. `services/docs/i18n-design.md` — rewrite §9. Its slug table is superseded by
   §4.2, and its claim that `name` keeps "global per-type uniqueness" is **already
   false** (two sections named `hol-tartunk-most`) and is replaced by §4.3.
3. `services/docs/content-site-and-static-generation.md` — the anchor grammar
   beside the canonical-URL rule.
4. This document, with the S1 wording folded back in.

**Gate:** the four documents agree with each other and with §2's measurements.

### S2 — Content: normalize the 14 names, add 7 part slugs

Must precede S3: the strict name pattern would otherwise fail the build on
legitimate content.

1. Rename the 14 identifiers of §2.1 — 2 section names (+ `git mv` the two files),
   10 claim names, 1 term key — and every referrer: 3 section references, 2 claim
   references, 2 chapter `sections:` ordering entries, 1 inline `[[complement-in-A]]`.
2. Backfill `slug` on the 7 `part.yaml` files, after `name`.
3. **Two commits**, so either reverts alone: the renames, then the part slugs.

Safe to do before the editor phase (S6): `saveFromModel` mutates the loaded YAML
document and preserves keys it does not model, so a part `slug` survives a save
even before `CANONICAL_ORDER` learns about it. Parts also have no body, so the
editor has no reason to write one.

**Gate:** a services build against the renamed content is byte-identical except for
the 14 identifiers and their anchors; scripts are idempotent; the review artifact is
the 14-row rename table with the readability cost [D6](#d6) records, so it can still
be reversed here.

### S3 — Services: the part model, and enforce the constraints

Validators plus [D7](#d7)'s model change. Green on S2's content on the first run,
which is the point — the constraints are being *pinned*, not introduced.

1. [D7](#d7)'s `PartNode.slug` / `PartNode.locale` + the loader reads.
2. `lib/content/graph.ts` — a new `validateIdentifiers(graph)` replacing and
   widening `validateKbSlugs`: §4.1's character rule, §4.2's slug scopes and §4.3's
   name scopes, for **content objects as well as KB nodes**. Nothing validates
   book/part/chapter/section/standalone slugs today; `graph.chapters.set(…)` and
   friends silently overwrite on a duplicate key, and so do the raw-scan
   `bookByName` / `partByName` / `chapterByName` / `sectionByName` maps in the
   loader pass.
3. The `page`-slug-vs-container-segment guard moves out of `generateStaticParams`
   (`page.tsx:180`) into the same validator, so it fires for every consumer rather
   than only during static param generation.
4. [D3](#d3) — reject a `claim` block inside a `proof` body.
5. Tests: one per scope, each asserting the **positive** case too — two proofs of
   different theorems may share a slug; a definition and a theorem may share a name;
   two chapters in different books may share a slug; two sections in different
   chapters may share a name.

**Gate:** `next build` and `pnpm test` green with unchanged output; every new rule
has a test that fails when the rule is removed.

### S4 — Services: the anchor grammar

1. `lib/i18n/locales.json` + `config.ts` — add `claim` / `section` / `part` to
   `containers`; delete the `anchors` dictionary, `AnchorKey` and `getAnchorPrefix`.
2. `lib/content/urls.ts` — replace `claimAnchorId` / `termAnchorId` /
   `entityAnchorId` with one builder that walks a node's ancestor chain and emits
   the §3.2 path, taking a page-context argument so the same node yields
   `definiciok.{d}.fogalmak.{f}` on a chapter page and `fogalmak.{f}` on its own.
   Keep the phase-4 property that the builder takes the **owning node** rather than
   a locale string.
3. Call sites: `SectionView` (`id={slug}` → `szakaszok.{slug}`), `BookIndex`
   (new part anchor), `EmbeddedEntity`, `ClaimBlock`, `InlineText`,
   `resolveRefHrefs`, `buildBacklinkIndex`, `buildGlossary`, and `backlinkOrigin`,
   which builds a section anchor by hand at `graph.ts:1155`.
4. [D11](#d11) — `validateAnchors(graph)`.
5. Rewrite the phase-4 test asserting an anchor does not start with
   `definition-` / `claim-` / … — it pins the shape this phase replaces.

**Note for parent phase 5:** a `.` in an id is valid HTML and needs no URL encoding,
but it is a class separator in a CSS selector. `document.querySelector('#' + id)`
breaks; `getElementById`, `:target` and `[id="…"]` do not. Phase 5's F2
cross-highlighting keys on `data-target-anchor` attributes, which is safe — this is
a note to keep it that way, not a defect.

**Gate:** `next build` green; every fragment in the export is a §3.2 path; no
English segment anywhere; `validateAnchors` passes; re-measure the fragment count
against phase 4's 11 085.

### S5 — Services: parse FQN reference targets

1. `lib/content/types.ts` — `RefTarget` loses `namespace` / `part` / `parent` and
   gains the resolved ancestor chain. The eight target interfaces collapse toward
   one parsed-path shape plus `ExternalRefTarget`.
2. `lib/content/loader.ts` — an FQN parser and resolver with [D9](#d9)'s scheme
   discriminator, tolerant of the legacy object form per [D4](#d4), with the legacy
   path marked for deletion in S8.
3. `resolveRefHrefs`, `buildBacklinkIndex`, `validateReferences`,
   `validateTermInsertions` and `display-template`'s `{target.*}` expressions all
   read the parsed chain instead of re-deriving parents from `namespace`.
4. `embed` and `recall` block targets, same reader.
5. Tests: the parser against one example of each §3.1 production, including
   `books.{b}.parts.{p}` ([D8](#d8)) and both external schemes; plus an unparseable
   FQN, an unknown key, and a well-formed path whose leaf type is illegal
   (`…proofs.{p}.claims.{c}`) each failing with a message that names the file.

**Gate:** `next build` green **on unmigrated content** through the legacy reader,
byte-identical output.

### S6 — Editor: FQN targets

Hard prerequisite for S7, exactly as parent phase 2 was for phase 3: the editor
rewrites `references`, `embed` and `recall` field by field on save, so it must emit
FQNs before any content file is saved after S7.

1. `src/content/loader.ts` — `resolveTarget` reads an FQN (and, transitionally, the
   legacy object).
2. `src/handlers.ts` — `targetToYaml` emits an FQN. It currently reconstructs
   `book` / `part` / `namespace` from the loaded object graph; it now walks the same
   ancestor chain and joins it. Its "claims nested in subsections/details are not
   supported" throw stays — 0 content files exercise it.
3. `CANONICAL_ORDER` gains a `part` entry (`type, name, slug, locale, title,
   chapters`), so [D7](#d7)'s slug has a pinned position like every other type's.
4. §4.1's character rule and §4.2/§4.3's uniqueness scopes as editor-side
   validation, so a bad identifier is caught at authoring time and not only at build
   time. Mirrored by hand, per the i18n design's no-shared-schema decision, with a
   pointer comment to the services validator.
5. Extend the phase-2 round-trip test: load a file with FQN targets, save without
   editing, assert byte-identical.

**Gate:** round-trip test green; `pnpm editor:install-dev` from the content repo
(**not** `editor:install` — that installs the last released VSIX and would silently
discard this phase), `npm run build` in the editor first, reload the VS Code window
after.

### S7 — Content: migrate 7082 targets to FQNs

1. `scripts/migrate-ref-targets.mjs` — one-off, line-based (not a YAML re-dump),
   idempotent, `--write` to apply, dry-run by default, modelled on
   `migrate-kb-slug.mjs`. Builds the name→ancestor-chain index from the tree, then
   rewrites each target object as a single `target:` line.
2. **Two commits**, so either reverts alone: the 6513 `references` entries, then the
   569 `embed` / `recall` targets.
3. Verify: re-running the script is a no-op; a services build against the migrated
   content is byte-identical to the pre-migration build; opening and saving one each
   of a definition, theorem, proof, remark, chapter, section and part in the editor
   is byte-identical.

**Gate:** the three verifications above, plus a diff summary showing 7082 target
objects removed and 7082 `target:` lines added and nothing else.

### S8 — Services: drop the legacy reader, sweep tests and docs

1. Delete the legacy target-object branch from the loader, and its tests. Its
   removal is the proof S7 was total: the build fails if one object survives.
2. Full test sweep — the identifier validators, the anchor builder in every page
   context (book index, chapter, standalone, entity page), the FQN parser,
   `validateAnchors`, `kbRefs`, and the glossary and backlink index against the new
   anchors.
3. Re-verify S1's documents against the shipped behaviour.
4. Re-measure: fragment count, page count, build wall time against parent-plan A18.

**Gate:** `pnpm test` and `next build` green in both `SITE_ENV` modes; parent
phase 5 unblocked.

---

## 7. Out of scope

- **Page layout and components.** Unchanged from the parent plan: phase 5 stays
  gated on the layout decision. This sub-plan settles what the anchors and
  references *are*, not how a page arranges them.
- **Part pages.** [D7](#d7) makes a part addressable by *anchor* on the book index.
  It does not give a part a URL; parts stay flattened out of chapter paths, which is
  why §3.1 keeps them a sibling branch.
- **Slug-rename redirects.** Still the separate ticket the design plan defers to
  (§6). Relevant here only as an observation: nothing this sub-plan changes is
  deployed — parent phase 4 sits on an unmerged branch — so no live URL or anchor
  breaks and no redirect is owed.
- **Standalone-item entity embeds.** `StandaloneNode` renders with no embed indices;
  the grammar covers its sections ([D10](#d10)) and nothing more.
- **`subsection` / `details` anchors.** Neither has a slug and neither is
  addressable; they stay that way.
- **`references` map keys.** Not part of either grammar (§4.1).
- **A second locale.** Everything is per-node `locale` and every segment comes from
  `locales.json`, so an `en` knowledge base needs a dictionary entry and no code
  change. No `en` content is produced.

---

## 8. Risks

| # | risk | mitigation |
|---|---|---|
| S-R1 | **The 7082-target migration silently mis-resolves an ancestor** — attaches a term to the wrong parent — and the build still passes because the wrong target also exists | Byte-identical rendered output before and after is the gate, not "the build passes". §2 measured 0 ambiguities in every FQN scope, so a correct script has no judgement calls to make |
| S-R2 | **Two-repo lock-step** — services cannot read migrated content, or vice versa, for the span of a phase | [D4](#d4)'s tolerant reader; S8's deletion of it is what proves the migration was total |
| S-R3 | **Editor destroys FQNs on the first save after S7**, the exact failure parent-plan A15/R4 hit with claim slugs | S6 ships and is installed before S7 writes anything; the round-trip test is extended rather than re-invented |
| S-R4 | **The anchor rework breaks 11 085 in-page links** with no automated detection | [D11](#d11)'s `validateAnchors`; without it this sub-plan has no gate on its headline change |
| S-R5 | **`mailto:` mis-parsed as an FQN** by a `://` discriminator, silently turning 4 references into unresolvable paths | [D9](#d9) specifies a scheme test, and S5's parser tests cover both schemes explicitly |
| S-R6 | **`.` in an id** breaks a future `querySelector('#'+id)` | Documented at S4; phase 5's F2 already keys on `data-target-anchor`, and `getElementById` / `:target` / `[id="…"]` are unaffected |
| S-R7 | **A constraint is enforced that real content violates**, blocking the build on something legitimate | §2 measured every constraint against the whole tree; the only violations are §2.1's 14 names, which S2 fixes before S3 enforces anything |
| S-R8 | **[D6](#d6)'s lowercasing makes 14 names read worse** (`mod-i-congruence-…`) and is noticed only after the migration has built on them | S2 lands first, in its own revertible commit, with the rename table as its review artifact — the last cheap moment to reverse it |
