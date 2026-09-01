# Indexed proof and remark addresses

**Ticket:** none — carried as part of the knowledge-graph pages work.
**Repos touched:** `youproof-org/services`, `youproof-org/content`, `youproof-org/editor` (one cosmetic edit).
**Status:** implemented, P0–P5. Awaiting release.

> ### Working agreement
>
> **Nothing is committed or pushed without approval.** Do the work, post a short
> summary of what changed and how it was verified, and wait for an explicit go.
>
> **Every phase ends with a review gate.** After a phase is committed, stop and wait
> for separate approval before starting the next one.

---

## 1. What changes

A proof and a remark stop carrying a slug of their own. Their position in the
parent's authored list becomes their address, in the URL and in the on-page
anchor alike.

| | before | after |
|---|---|---|
| proof URL | `/hu/tudasbazis/tetelek/{thm}/bizonyitasok/{proof-slug}` | `/hu/tudasbazis/tetelek/{thm}/bizonyitasok/{i}` |
| remark on a definition | `/hu/tudasbazis/definiciok/{def}/megjegyzesek/{remark-slug}` | `/hu/tudasbazis/definiciok/{def}/megjegyzesek/{i}` |
| remark on a theorem | `/hu/tudasbazis/tetelek/{thm}/megjegyzesek/{remark-slug}` | `/hu/tudasbazis/tetelek/{thm}/megjegyzesek/{i}` |
| remark on a proof | `…/bizonyitasok/{proof-slug}/megjegyzesek/{remark-slug}` | `…/bizonyitasok/{i}/megjegyzesek/{j}` |
| proof anchor | `tetelek.{thm}.bizonyitasok.{proof-slug}` | `tetelek.{thm}.bizonyitasok.{i}` |
| remark anchor | `definiciok.{def}.megjegyzesek.{remark-slug}` | `definiciok.{def}.megjegyzesek.{i}` |
| remark on a proof, anchor | `tetelek.{t}.bizonyitasok.{p}.megjegyzesek.{r}` | `tetelek.{t}.bizonyitasok.{i}.megjegyzesek.{j}` |

`{i}` is **1-based** and is the position of the child in the parent's authored
`proofs:` / `remarks:` list.

**Nothing else moves.** Definition and theorem URLs, section and part anchors,
claim and term anchors, and — importantly — **every reference target** are
untouched. A reference is a fully qualified name built from `name` values
(`theorems.{t}.proofs.{p}`), and this plan does not touch `name`. So none of the
7000-odd targets in the content need rewriting, and the URL grammar and the FQN
grammar simply stop being isomorphic: the FQN keeps the child's name, the URL and
the anchor take its index. §5 D3 is why that separation is the point rather than a
cost.

`slug` is removed from proof and remark files entirely (D2).

---

## 2. Measured state (2026-09-01, on the current `content` working tree)

| measurement | result |
|---|---|
| proof files | **190** |
| remark files | **72** |
| proof files carrying `slug:` | **190 of 190** |
| remark files carrying `slug:` | **72 of 72** |
| parents with **more than one** proof | **0** — 190 theorems have exactly 1, 347 nodes have 0 |
| parents with **more than one** remark | **0** — 72 nodes have exactly 1, 465 have 0 |
| listed `proofs:` / `remarks:` names with no matching file | **0** |
| proof / remark files listed by no parent (orphans) | **0** |
| reference targets whose leaf is a proof | **147** |
| reference targets whose leaf is a remark | **94** |

Two consequences worth stating plainly, because they set the risk level:

- **Every index in today's content is `1`.** All 190 proof URLs become
  `…/bizonyitasok/1` and all 72 remark URLs `…/megjegyzesek/1`. There is no
  ambiguity to resolve, no ordering to decide, and no index collision possible.
- **The authored list and the built list already agree** — no missing children, no
  orphans — so the index is well defined for every node today. §5 D5 turns that
  from a happy accident into an enforced invariant, because it stops being a
  cosmetic detail the moment position *is* the address.

The 241 references at proofs and remarks are FQNs keyed by `name` and are
**unaffected**; they are listed only to show that the largest-looking number in
the neighbourhood is not in scope.

**No redirects are needed.** The knowledge base shipped one day before this plan
was written; the slug-based permalinks are not indexed and have no inbound links.
Confirmed with David.

---

## 3. The design

### 3.1 The index

> A proof's or remark's index is its **1-based position in the `proofs:` /
> `remarks:` list of the node that owns it**.

The graph already builds `theorem.proofs` and `{definition|theorem|proof}.remarks`
by iterating the parent's authored list in order (`buildGraphFromRaw` pass 2,
[graph.ts:725-762](../../apps/website/lib/content/graph.ts#L725-L762)), so the
index is `owner.proofs.indexOf(node) + 1` — derivable from the node alone, with no
graph lookup, exactly as `kbAnchorPath` already walks `proves` / `attachedTo`.

The index is **not** filtered by publication. An unpublished sibling still occupies
its position, so publishing a chapter never renumbers anything that was already
live. This is the opposite choice from `kbOwnership`, which filters — see D6.

### 3.2 The two projections, restated

The identifiers sub-plan's rule was "an anchor is the localized FQN of the node,
rooted at the nearest ancestor that is the page". That rule survives with one
substitution: for a proof and a remark, the localized projection takes the
**index** where the other types take the `slug`. The container segments are
unchanged and still come from `locales.json`'s `containers` dictionary.

```
FQN      (internal, by name)   theorems.{t}.proofs.{p}.remarks.{r}
URL      (public, localized)   /hu/tudasbazis/tetelek/{t-slug}/bizonyitasok/{i}/megjegyzesek/{j}
anchor   (public, localized)   tetelek.{t-slug}.bizonyitasok.{i}.megjegyzesek.{j}
```

On a proof's **own** page the page node drops out of the path as before, so its
remarks anchor as `megjegyzesek.{j}` — the page-layout sub-plan's inline case needs
no new grammar.

An **owner-less remark** has no owner and therefore no index, exactly as it has no
URL today. `urlForRemark` already returns `null` for it and `kbAnchorPath` already
roots it at its own container; both keep doing so, with `megjegyzesek.{name}` for
the anchor (D7).

---

## 4. What this buys, and what it costs

**Buys.** A proof and a remark have no name of their own that a reader would
recognise — all 190 proofs render as "Bizonyítás" and all 72 remarks as
"Megjegyzés" (measured, and the reason `kbOwnershipSibling` exists at all). Their
slugs are therefore not descriptive of anything; they are their parent's slug with
`-bizonyitas` or `-megjegyzes` appended, which makes the URL long, repeats the
parent segment that is already two segments to the left, and forces the author to
invent an identifier that names nothing. `.../tetelek/maradekosztalygyuruk/bizonyitasok/1`
says what `.../tetelek/maradekosztalygyuruk/bizonyitasok/maradekosztalygyuruk-bizonyitas`
says, in a form a reader can read and a second proof can extend.

It also removes 262 identifiers from the content model and two uniqueness scopes
from the validator.

**Costs, stated so they are not discovered later.**

1. **Reordering a parent's `proofs:` / `remarks:` list moves URLs**, silently.
   Inserting a proof at position 1 moves the old proof to `/2`. This is inherent
   to positional addressing and is accepted here because the addresses are one day
   old and every list has one element. It is worth revisiting only if a parent ever
   grows a list long enough to reorder. D8 records the one guard that is cheap
   enough to be worth having now.
2. **The URL no longer identifies the entity across a content edit.** The FQN still
   does, and the FQN is what every reference, backlink and `kb_highlight` value
   uses — so nothing internal depends on the URL's stability. Only an external
   bookmark would, and there are none.

---

## 5. Decision log

<a id="d1"></a>
### D1 — The index is 1-based and appears verbatim, with no padding

`1`, not `0`, `01`, or `p1`. Readers count from one, and the ordinal that
`OwnershipLinks` already renders ("2. Bizonyítás") counts from one, so a URL
counting from zero would disagree with the page. No padding, so there is exactly
one spelling of each address.

The route parser accepts `^[1-9][0-9]*$` and nothing else, so `/bizonyitasok/01`
and `/bizonyitasok/1.0` 404 rather than becoming second URLs for one page. With
`dynamicParams = false` a non-enumerated path 404s anyway; the strict pattern is
still where the rule is *stated*, and it is what the dev server and any future
non-exported route would rely on.

<a id="d2"></a>
### D2 — `slug` is removed from proof and remark files

Confirmed with David. Once the index is the address, a proof's slug addresses
nothing: it is in no URL, no anchor, no reference, and no map key. Leaving it would
mean the content model carries an identifier whose only remaining behaviour is to
be policed by a validator, and every future reader of `content-model.md` has to be
told it is inert.

So: `slug:` is deleted from all 262 files, from `ProofNode` and `RemarkNode`, from
`loadProof` / `loadRemark`, from the two slug-uniqueness scopes in
`validateIdentifiers`, and from both repos' docs.

`name` stays and is unchanged — it is the FQN key, the filename, and what the
parent's list refers to.

<a id="d3"></a>
### D3 — The FQN keeps the name; only the public projection takes the index

A reference is `theorems.{t}.proofs.{p-name}` and stays that way. Making references
positional too would be the actually dangerous version of this change: reordering a
list would silently re-point 241 references at different content, and a reference
would stop surviving the content edits it exists to survive.

The consequence is that URL and FQN are no longer mechanically convertible in the
public direction — you cannot read a proof's name off its URL. Nothing needs to:
`resolvePath` resolves by walking the graph from the theorem, and `kb_highlight`
carries the FQN in a query parameter precisely so that arrival never has to parse a
path. This is the same separation the design already has between `name` and `slug`
everywhere else, taken one step further.

<a id="d4"></a>
### D4 — No redirects, no dual reader

The knowledge base was released 2026-08-31. Its permalinks are not indexed and
carry no backlinks (David, confirmed). The three repos release together, so there
is no window in which an old address has to keep working. No `_redirects` entries,
no legacy manifest changes, no transitional slug fallback in the router.

<a id="d5"></a>
### D5 — Each proof and remark must be listed exactly once

Newly load-bearing, and currently unenforced. Three failure modes that today are
silent and cosmetic become wrong *addresses* under this plan:

- a parent listing the same name twice → the node is pushed into the array twice
  and gets two URLs, of which `indexOf` only ever produces the first;
- two theorems listing one proof name → `theoremOfProof` keeps the last writer and
  the other theorem's list silently drops it;
- a listed name with no file → the array is shorter than the authored list, so
  every later sibling's index is off by one relative to the YAML the author is
  looking at.

All three are 0 in today's content (§2). `validateIdentifiers` gains a check that
every `proofs:` / `remarks:` entry resolves and that no name is claimed twice, with
a message naming the parent and the entry. The third case is the one that matters
most: it is the only way the index in the URL can disagree with the position in the
file, and an author editing YAML must be able to count.

<a id="d6"></a>
### D6 — The index is computed over the unfiltered list; `OwnershipLinks` follows it

`kbOwnership` filters children through `kbPageExists`, so on a build where one of
two proofs is unpublished the surviving one is `siblings[0]` and
`OwnershipLinks` labels it "1. Bizonyítás" — while its URL, computed from the full
list, would say `/bizonyitasok/2`. Today that cannot happen (every list has one
element, and 0 links are pruned on the staging build), but it is a disagreement
waiting for the second proof.

So `OwnershipLinks` stops using its loop counter and asks for the child's URL index
instead. Its "number only when there is a sibling" rule reads the **unfiltered**
list length for the same reason: a lone visible link labelled "Bizonyítás" pointing
at `/bizonyitasok/2` is worse than one labelled "2. Bizonyítás".

<a id="d7"></a>
### D7 — An owner-less remark is unchanged

The model permits a remark attached to nothing; no content has one. It has no
owner, so it has no position and no index — and it already has no URL. It keeps
anchoring at `megjegyzesek.{name}` (its `slug` is gone, so the name is what is
left), which is what `kbAnchorPath` already does for it modulo the identifier. This
is a deliberate non-decision: the case is unreachable, and inventing an index for
it would be inventing a hierarchy it does not have.

<a id="d8"></a>
### D8 — No index-stability guard beyond a documented warning

The tempting guard is a checked-in manifest of `name → index` that fails the build
when a position changes. It is not worth it now: every list has one element, so the
manifest would assert 262 ones, and it would have to be regenerated on every
legitimate insertion — turning a real signal into a step people learn to skip.

Instead, `content-model.md` says in one sentence that reordering or inserting into
a `proofs:` / `remarks:` list changes the URLs of that list's later members.
Revisit if a list ever exceeds one element.

---

## 6. Change inventory

### 6.1 `services` — the address builders

**[`lib/content/urls.ts`](../../apps/website/lib/content/urls.ts)** — the centre of
the change.

- New `kbOwnedIndex(node: ProofNode | RemarkNode): number | null` — 1-based
  position in `node.proves.proofs` / `node.attachedTo.remarks`; `null` for an
  owner-less remark. **Throws** if a node with an owner is not in its owner's list:
  that state is a graph-wiring bug (pass 2 only ever pushes what it found), not
  authored content, and D5's validator makes the authored side impossible too.
- `urlForProof` — `[node.proves.slug, String(index)]`.
- `kbUrlRef` — the `proof` and the three remark branches take the index in the last
  position; the `definition` and `theorem` branches are untouched.
- `kbAnchorPath` — same substitution; the recursion through the ownership chain is
  unchanged.
- The block comment above the fragment section, which spells out
  `tetelek.{t}.bizonyitasok.{p}.megjegyzesek.{r}`, is rewritten.
- `MARKED_ON_ARRIVAL` and `anchorMarksTarget` are **unchanged** and need no
  thought: an anchor is still a run of `container.key` pairs, `bizonyitasok.1` is
  still a pair, and the classification keys off the container, not the key.

**[`lib/i18n/url.ts`](../../apps/website/lib/i18n/url.ts)** — the `UrlKey` union,
the four affected cases, and their arities are all unchanged; only the *meaning* of
the last segment changes. Edits are the doc comment's URL-shape block and the
variable names in the four `case` bodies (`proofSlug` → `proofIndex`). `req()`'s
empty-string guard still holds — an index stringifies to a non-empty string for
every value ≥ 1.

**[`app/[locale]/[[...path]]/page.tsx`](../../apps/website/app/[locale]/[[...path]]/page.tsx)**
— `resolveKbEntity` is the only place a KB path is taken apart.

- New `findByIndex<T extends KbNode>(nodes: T[], locale, segment): T | undefined`
  — strict `^[1-9][0-9]*$` (D1), then `nodes[i - 1]`, then the locale check
  `findKbBySlug` already does.
- The four `findKbBySlug(theorem.proofs | …remarks, …)` calls become `findByIndex`.
  The two `findKbBySlug(graph.definitions|theorems.values(), …)` calls stay.
- `generateStaticParams` enumerates by asking `urlForKbNode`, so it needs no
  change — which is the property that keeps the route and the builder from
  drifting.

**[`lib/content/types.ts`](../../apps/website/lib/content/types.ts)** — drop `slug`
from `ProofNode` and `RemarkNode`. This is the change that makes the compiler find
every remaining reader.

**[`lib/content/loader.ts`](../../apps/website/lib/content/loader.ts)** — drop
`slug: readSlug(...)` and its comment from `loadProof` and `loadRemark`.
`readSlug` itself stays; four other types use it.

**[`lib/content/graph.ts`](../../apps/website/lib/content/graph.ts)** —

- `validateIdentifiers`: the `proof` and `remark` branches drop the slug half of
  `both(...)` (name shape + name uniqueness only), and the owner-less-remark branch
  drops its `shape('slug', …)`.
- The same function gains D5's "listed exactly once, and resolves" check.
- `validateAnchors` and `validateKbLinks` need **no** change — both derive from the
  builders above.

**[`components/kb/OwnershipLinks.tsx`](../../apps/website/components/kb/OwnershipLinks.tsx)**
— D6: the ordinal comes from `kbOwnedIndex(child)`, and the
"has a sibling" test reads the unfiltered list.

Everything else that touches these URLs — `app/sitemap.ts`,
`components/kb/KbTypeIndexPage.tsx`, `components/content/ContentBlocks.tsx`,
`lib/content/kb-breadcrumbs.ts`, `lib/content/graph.ts`'s href resolution,
`e2e/support/derive-fixtures.mjs` — goes through `urlForKbNode` / `kbAnchorPath`
and changes not at all. `lib/kb/highlight.ts` is untouched: it validates FQNs, and
FQNs are unchanged.

### 6.2 `services` — tests

| file | what changes |
|---|---|
| `test/support/raw-graph.mjs` | drop `slug` from the proof/remark fixtures |
| `test/kb-graph.test.mjs` | 6 URL/anchor assertions (lines 27–28, 592, 608–612) |
| `test/kb-breadcrumbs.test.mjs` | 5 breadcrumb-href assertions (lines 77–107) |
| `test/sitemap-split.test.mjs` | 3 sample URLs (lines 46–48) |
| `test/anchor-kind.test.mjs` | builds anchors from fixture nodes; check it still constructs a proof/remark node validly |
| `test/identifiers.test.mjs` | the removed slug scopes, plus **new** cases for D5 and D1's strict index parse |
| `e2e/kb-sweep.test.ts:70`, `kb-reference.test.ts:40,64`, `kb-backlinks.test.ts:272` | 4 hardcoded URLs |

The rest of the e2e suite derives its fixtures from the graph
(`e2e/support/derive-fixtures.mjs`) and self-heals.

**New tests worth having**, because they are the cases this design newly makes
possible and today's single-element content cannot exercise:

- a theorem with **two** proofs → `/bizonyitasok/1` and `/bizonyitasok/2`, both
  resolving, in URL and anchor form;
- a proof with two remarks → `…/bizonyitasok/1/megjegyzesek/2`;
- an unpublished first sibling → the second still addresses as `/2` (D6);
- `/bizonyitasok/0`, `/01`, `/2` past the end → no match (D1).

### 6.3 `services` — docs

**[`docs/i18n-design.md`](../i18n-design.md)** —

- §2's `hu` URL examples (lines 73–75).
- §3's container table (lines 104–105): `proof` and `remark` still appear in URL +
  anchor, but the segment is followed by an index rather than a slug — worth a note
  in the table or just below it.
- §9's uniqueness table: the `proof` and `remark` rows are deleted, and the "why"
  column's "URL nests under the theorem" claim goes with them.
- §9's reserved-slug example paragraph still lists `bizonyitasok` and
  `megjegyzesek` as reserved container segments — **still true**, no edit needed.

### 6.4 `content`

**262 YAML files** — remove the top-level `slug:` line from every file under
`*/proofs/` and `*/remarks/`. Mechanical; do it with a script in `scripts/`
following the shape of the existing `migrate-kb-slug.mjs` /
`apply-kb-sub-slugs.mjs` (which is what put these slugs there), and commit the
script with the change so the edit is reproducible and reviewable as one diff.

**[`docs/content-model.md`](../../../content/docs/content-model.md)** —

- the `slug` row in the field table (line 65) — `proof` and `remark` come out of
  the type list;
- the "the only type **without** a `slug` is `namespace`" sentence (~line 95);
- the URL block (lines 112–115) — the three indexed shapes;
- the `proof` and `remark` rows of the uniqueness table (~lines 167–168) and the
  "two proofs of different theorems may share a slug" consequence below it;
- the `#### proof` and `#### remark` schema examples (~lines 402–425) — drop the
  `slug:` line and its trailing comment;
- a new short paragraph beside the URL block stating the index rule, that it counts
  from 1 over the authored list, and D8's warning that reordering moves later
  members' URLs.

### 6.5 `editor` — one cosmetic edit

`saveFromModel` copies unmodelled top-level fields through verbatim and
`reorderYamlKeys` only reorders keys that are `in` the document, so removing
`slug` from proof and remark files **breaks nothing** and needs no code change to
be correct. What it leaves behind is a stale entry: drop `'slug'` from the `proof`
and `remark` rows of `CANONICAL_ORDER`
(`src/handlers.ts:728-729`) and amend the comment above it, which currently says
the knowledge-base types "now" all carry a slug.

`test/save-roundtrip.test.mjs` asserts slug preservation and its fixtures **do**
include a proof and a remark, each with a top-level `slug:`
(`test/save-roundtrip.test.mjs:135` and `:155`). Drop those two lines; the term and
claim slugs in the same fixtures stay, since those identifiers are unaffected.

---

## 7. Phases

Each phase ends at a review gate. The three repos release together (D4), so the
build is allowed to be red between P2 and P4 — the services code and the content
disagree in between, exactly as the identifiers sub-plan's D4 accepted.

**P0 — Baseline.** On a clean `development`, build the static export and keep
`out/` as `baseline-out/`. This is what P5 diffs against with
`scripts/compare-exports.mjs`, whose layers 1 (inventory), 4 (element ids) and 5
(links, fragments included) are precisely the three that must change here and
nowhere else. No commit.

**P1 — D5's validator, alone and green.** Add the "listed exactly once, and
resolves" check to `validateIdentifiers`, plus its tests. Independent of everything
else, passes on today's content, and is the guard the rest of the plan relies on.
*Gate: `pnpm test` and a full build, both green, with no content change.*

**P2 — The index, in services.** `kbOwnedIndex`, the three builders, the route
parser, `OwnershipLinks`, and the tests of §6.2. `slug` stays on `ProofNode` for
this phase — it simply stops being read — so the build stays green against
unmigrated content and the diff is about addressing only.
*Gate: `pnpm test`, `pnpm build`, `check-anchors`, and a `compare-exports` against
P0's baseline showing changes confined to KB proof/remark URLs, their ids, and
links to them.*

**P3 — Content migration.** The script, the 262 files, and `content-model.md`.
*Gate: the review artifact is the script plus a spot-check of three files (a proof,
a remark on a definition, a remark on a proof); the 262-file diff is uniform
one-line deletions.*

**P4 — Drop the field.** `ProofNode` / `RemarkNode`, `loadProof` / `loadRemark`,
the two validator scopes, `i18n-design.md`, and the editor's `CANONICAL_ORDER`.
Done after P3 so the loader never has to tolerate both shapes.
*Gate: `pnpm test`, `pnpm build`, `tsc` clean.*

**P5 — Verify and release.** Full `compare-exports` against P0, the e2e suite, and
the smoke-test crawl against a staging deploy.
*Gate: the comparison report.*

P1 and P2 are the only phases with a behaviour change in code; P3 is data; P4 is
subtraction. If the work has to stop somewhere, P2's gate is the coherent stopping
point — the addresses are correct and the dead field is merely still present.

---

## 8. Verification

- **`scripts/compare-exports.mjs baseline-out out`** is the primary check. Layer 1
  must show the same *count* of pages with 262 renamed paths; layer 4 must show the
  proof/remark ids changed and nothing else; layer 5 must show every link that
  targeted an old address now targeting the new one, with no link left pointing at
  a path layer 1 says no longer exists. Layers 2, 3, 6 should be quiet apart from
  the URLs embedded in canonicals and the sitemap.
- **`scripts/check-anchors.mjs`** reads ids out of the built HTML and hrefs out of
  the built HTML — the two sides that `validateAnchors` cannot independently
  check. It is the thing that catches a component rendering the slug-based id while
  the builder emits the index-based href.
- **`validateKbLinks` / `validateAnchors`** fail the build on a dangling KB href or
  fragment, so a missed call site is a build error rather than a crawl finding.
- **The smoke-test crawl** (`tools/smoke-tests`) on staging, including
  `orphan-check`, confirms no page lost its inbound links in the rename.

---

## 9. Open questions

All three are closed.

1. **Ticket.** None is needed; this is carried as part of the knowledge-graph pages
   work and is not tracked separately.
2. **Does anything outside these three repos hardcode a KB URL?** No — confirmed
   with David.
3. **The Hungarian for a numbered proof in `kbOwnershipSibling`.** Nothing renders
   it yet: no node in the content owns more than one child, so D6's numbering is
   exercised by tests only. Worth one look the first time a parent grows a second
   proof.

---

## 10. What was actually done

P1 and P2 landed as specified. Three things the plan did not anticipate:

- **`RAW_GRAPH_VERSION` had to be bumped** (3 → 4). Its own comment obliges a bump
  whenever a `Raw*Entry` field is added or removed, because the dev-mode cache is a
  schema-less JSON dump; §6.1 lists the type change but not this consequence.
- **`slug` lived in four more places than §6.1 lists** — `RawProofEntry` /
  `RawRemarkEntry`, `loadRawGraphData`'s two pushes, pass 1's two node literals, and
  `findKbBySlug`'s `KbNode` bound (now `DefinitionNode | TheoremNode`, since P2 left
  it only definitions and theorems to search).
- **D6 needed one shared list, not two.** `OwnershipLinks` cannot mirror
  `kbOwnership`'s four cases with an unfiltered copy without the two drifting — which
  is the failure D6 exists to prevent — so `kbOwnedChildren` was extracted in
  `graph.ts` and `kbOwnership` now filters its result.

One rule the plan's §6.3 would have removed turned out to be worth keeping: a
proof's and a remark's **name** is still scoped to its owner, and deleting the
uniqueness rows would have left that unstated. The rows stayed, with a note that
D5's check is stricter than the scope allows for — an entry is a bare name and the
file does not name its owner, so ownership resolves through one global map and two
parents cannot list the same name.

Verification against P0's baseline: page count unchanged (588); the 524 renamed page
files collapse onto an identical set; **0** differing element ids and **0** differing
hrefs once the address segment is collapsed; **0** dangling internal links; **0**
newly orphaned pages and **0** pages whose inbound-link count changed; all nine
sitemaps identical once the segment and `lastmod` are normalized. `check-anchors`
passes on 23 958 fragment links, `pnpm test` 234, the e2e suite 129.
