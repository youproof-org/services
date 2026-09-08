# Inbound references out of the HTML, and JSON-LD in

**Tickets:** YP-151, YP-172 — two items carried out of the knowledge-graph work
([§5 of the URL plan](yp-162-knowledge-graph-urls-plan.md#5-structured-data-json-ld--out-of-scope-separate-backlog-item)
deferred the JSON-LD half explicitly).
**Repos touched:** `youproof-org/services` only. No content edits, no infra edits.
**Status:** **shipped**, on `feat/yp-151-yp-172-kb-jsonld-and-inbound-refs`. Nine
commits: the eight of phases 1, 1a, 2, 3, 4, 5, 5a, and 6 (§10 has the table, with the
commit each phase became), plus `65d96f7`, which belongs to no phase — it corrects a
wrong comment in `app/robots.ts` about how a conflicting `Allow` and `Disallow` are
resolved, and D9 carries the correction. 280 unit tests, 129 end-to-end tests, and the
nine postbuild steps — seven of them gates — pass on it. **Nothing is outstanding.**
The last open item, the manual vocabulary validation of §8.1, is done on both halves:
`validator.schema.org` reported no errors and no warnings, and Google's Rich Results
Test passed with `BreadcrumbList` detected as one valid item, which is the only rich
result this design targets. Nothing in this document is a proposal any more; §12 is
where the follow-ups it produced went.

> ### Working agreement
>
> **Nothing is committed or pushed without approval.** Do the work, post a short
> summary of what changed and how it was verified, and wait for an explicit go.
>
> **Every phase ends with a review gate.** After a phase is committed, stop and wait
> for separate approval before starting the next one.

---

## 1. What changes

Two changes to what a knowledge-base entity page *serves*, with nothing changing in
what a reader sees.

| | before | after |
|---|---|---|
| inbound-reference rows | in the served markup, `hidden`, revealed on open | not in the served markup; rendered on the client when the panel opens |
| the same rows in the RSC payload | present | present, unchanged |
| structured data | none, on any page | one `application/ld+json` block per knowledge-base page |
| what the reader sees | — | identical, panel for panel, row for row |
| structured data for AI | none | `/llms.txt`, generated from the graph, pointing at the hubs |
| formula fidelity | the LaTeX source of every formula is absent from the export, and every formula is silent to a screen reader | KaTeX emits MathML beside the visual rendering, carrying the authored LaTeX |

**Scope of the first half:** the three panels whose content is an inbound-reference
list — `incoming` (the whole entity), `term` (one selected term), and `claim` (one
selected claim). They are literally one component (`BacklinkList`), so they move
together or the change is half-done.

**Not in scope of the first half:** the `context` panel (the embedding chain — four
links at most, and genuine structure) and the `reference` panels (one row each,
naming an *outgoing* target the body already links to). §3.3 has the numbers behind
that line.

---

## 2. Measured state, before and after

Both columns of every table below were measured on **2026-09-08**, by one script,
over two exports built from this repository: the *before* one from `bd59046`, the
commit this branch starts from, and the *after* one from its head.

**Why the base commit was rebuilt rather than the 2026-09-07 numbers reused.** Those
numbers do not reproduce. A rebuild of the very commit they were taken on comes out
uniformly larger — served bytes by 1.0%, markup by 1.3%, inbound rows by 1.4%, `<a>`
elements by 1.1%, `gyuru-test` by 1.6% — with no figure going the other way. The cause
was not found, but content drift was tested and ruled out rather than assumed away: an
independent rebuild of the same commit against a pristine checkout of the content
repository at `d2fa027` puts `gyuru-test` at 1313041 B against this tree's 1313042 B,
and the payload's backlink rows at 14401 either way. The gap is therefore in the
2026-09-07 measurement, not in the corpus. A before-and-after table built from two
methods measures the methods, so both columns here are one method, and the superseded
figures are listed under the table rather than deleted.

**Both exports were built against the content working tree as it stood on
2026-09-08**, which carries one uncommitted edit on top of `d2fa027`: 54 lines added to
a chapter section of `alice-es-bob`, 11 of them new `target:` references into
`definitions.*`, `theorems.*` and `books.*`, which do reach the knowledge base as
inbound rows. It shifts the base export's payload total by 23105 B, 0.04%. It is in
both columns equally, so every difference between them holds; no single figure here is
exactly reproducible from committed content alone.

Both exports are `apps/website/out` — 540 built knowledge-base pages: 84 definitions,
191 theorems, 190 proofs, 72 remarks, and the three list pages under `tudasbazis/`
(the root sits a level up), inside 588 HTML files in all. A deployed build generates
389 of the entity pages, because an unpublished chapter takes its entities' pages with
it.

"Markup" means a page's served bytes minus its `self.__next_f` script elements —
what a crawler that does not execute JavaScript reads. §4.4 measured the same way,
and its two columns are the middle of the sequence §2.4 lays out.

### 2.1 What the inbound lists cost, and what is left of them

Over the 537 entity pages:

| measurement | before — `bd59046` | after — branch head |
|---|---|---|
| served bytes | 72880938 B — 69.50 MiB | 81972705 B — 78.18 MiB |
| of that, the RSC (Flight) payload | 45470349 B — 43.36 MiB, **62.4%** | 54553426 B — 52.03 MiB, **66.6%** |
| markup (served bytes minus the payload) | 27410589 B — 26.14 MiB | 27419279 B — 26.15 MiB |
| **markup that is inbound-reference rows** | **5686963 B — 5.42 MiB, 20.7% of all markup** | **0 rows**, and 211023 B of empty section shells and the no-JavaScript line |
| — the `incoming` sections | 537 sections, 5378 rows, 2738864 B | 537 sections, 0 rows, 145527 B |
| — the `term` sections | 217 sections, 4579 rows, 2389659 B | 217 sections, 0 rows, 37416 B |
| — the `claim` sections | 150 sections, 945 rows, 558440 B | 150 sections, 0 rows, 28080 B |
| inbound rows in the markup | 10902 | **0** |
| all backlink rows in the markup, inbound and outgoing alike | 14417 | 3515, every one of them a `reference` row (§3.3) |
| the same rows in the RSC payload | 14401 | 14401 — unchanged, as §4.1 A predicted |
| `<a>` elements in the markup | 29122, of which **10902 (37.4%) are inbound rows** | 18220, of which **0** |
| average per page | 49.8 KiB of markup, 10.3 KiB of it inbound rows | 49.9 KiB of markup, none of it inbound rows |
| median page | 11 backlink rows; 1575 B of `incoming` section; 33542 B of markup | 5 rows, all outgoing; 271 B of `incoming` section; 31736 B of markup |
| `definiciok/gyuru-test` | 1313042 B served; 891 rows in markup; the `incoming` section alone is 111810 B and 239 rows | 942815 B served; **7** rows in markup, all outgoing; the `incoming` section is 271 B of shell and one line |

**Superseded, for the record.** The 2026-09-07 pass read: 68.8 MiB served, 42.9 MiB of
payload (62%), 25.8 MiB of markup, 5.29 MiB of inbound rows (20.5%) split 2.56 / 2.22
MiB / 535 KiB over 5322 / 4496 / 932 rows, 10750 inbound rows in all, 28806 `<a>`
elements, 49.3 KiB average markup, and `gyuru-test` at 1.23 MiB served with 883 rows
and a 106 KiB, 236-row `incoming` panel. Every one of those is 1–1.6% below the
rebuild. One figure was not merely low but wrong: the median page was given as 22
backlink rows, and it is 11.

So the sentence this table was written to support — a crawler spends a fifth of the
markup and more than a third of its links on rows that repeat what other pages say
about themselves — is no longer true of any page. What replaced it, per page, is a
JSON-LD block of median 3034 B stating the *outgoing* edges (§5.1).

**Two things the second column says that the first did not predict.**

**An entity page serves as much markup as it did.** 27410589 B before, 27419279 B
after, over the same 537 pages: **8690 bytes more in total**, 49.8 KiB per page either
way. The account closes exactly, and it is worth writing out because it is the whole
shape of this branch on one line.

| | bytes across the 537 entity pages |
|---|---|
| the three deferred sections, 5686963 B down to 211023 B of shells and notes | −5475940 |
| the MathML of phase 1a in | +3706794 |
| the JSON-LD of phases 4–5 in | +1744662 |
| the `<style>` rules that reveal the note without JavaScript, 349069 B up to 381531 B | +32462 |
| everything else, unaccounted | +712 |
| **net** | **+8690** |

Of the 211023 B those sections still hold, 91290 B is the no-JavaScript note itself —
one `<p>` on each of the 537 pages, which is what D7 bought.

The first half's saving is real — §4.4 measures it on one build at −5.26 MiB across
the whole export — it is simply not the only thing that moved.

**`gyuru-test` stops being a big page, and the top of the list was never about
backlinks.** Its markup falls 493829 → 83803 B, −83%, and its 891 rows become 7. But
it was not the largest knowledge-base page even before:
`tetelek/nem-miller-rabin-tanuk-reszcsoportindexe/bizonyitasok/1` was, at 544734 B of
markup, and still is, at 669611 B — **91% of which is its 345 KaTeX subtrees**. Nor
was it the largest page on the site: the chapters are, by five to six times.
`konyvek/alice-es-bob/fejezetek/alice-es-bob-atlepi-a-celvonalat` serves 9965116 B for
3714488 B of markup, against the largest knowledge-base page's 1786785 and 669611.
What `gyuru-test` was, and is no longer, is the page whose markup was mostly other
pages' links. It is still fifth by *served* bytes in the knowledge
base, and only because its payload still carries the 891 rows its markup does not —
which is §12.1's whole subject.

### 2.2 Two things worth knowing before choosing an approach

**The rows are already served twice.** Every one of them appears once as markup and
once inside the `self.__next_f.push(...)` scripts — the App Router's RSC payload,
which is expected boilerplate for a static export
([content-site doc](../content-site-and-static-generation.md#__next_f-script-tags-are-expected-not-a-bug)).
On `gyuru-test` that was 891 occurrences in the markup and 891 in the payload. **Any
approach that keeps the panel working keeps one of those two copies**, because the
copy in the payload is how the content reaches the client at all. §3 is about which
copy goes; D2 took the markup one, so the payload figure is unchanged today — 14401
backlink rows across the export, 891 of them still on `gyuru-test`.

**The payload is also a URL.** Every page's payload is written beside it as an
addressable `.txt`, and `robots.txt` allowed them on production when this was written.
There are **587** of them — one per page, `404.html` excepted — and they total
71777304 B, **68.45 MiB**. (The export holds 589 `.txt` files in all; the other two are
`robots.txt` and, since phase 5a, `llms.txt`. This section first counted all of them as
payloads.) `out/hu/tudasbazis/definiciok/gyuru-test.txt` was 713696 B at `bd59046` and
is 739799 B now. Nothing in the markup links to them; Next fetches them
for client-side navigation. They are a second, unmanaged copy of every page's whole
content, inbound rows included. That was a finding of this measurement rather than
part of the ask — D9 is what became of it, and phase 1 shipped it.

### 2.3 What is available for JSON-LD, without new content

| datum | source |
|---|---|
| canonical absolute URL | `absoluteUrl` + the `urlFor*` helpers in `lib/content/urls.ts` |
| page name | `kbNodeTitle(graph, node)` — the derived title a `<title>` already uses |
| description | `kbExcerpt(node)` — the same string `<meta name="description">` gets |
| breadcrumb chain | `kbEntityBreadcrumbs` / `kbListBreadcrumbs` |
| the owner and the children | `node.proves`, `node.attachedTo`, `node.proofs`, `node.remarks` |
| the chapter and book a node is embedded in | `graph.embedding.get(fqn)` |
| outgoing references | `node.references`, resolved through `kbRefs` — median 5 per page, max 32. Counted at 3475 on 2026-09-07 — 1.3% low, like the rest of that pass; the built blocks carry **3520** `citation` edges, 3515 of them on our own origin and 5 off it (§5.4 of the design), and the export carries 3515 `reference` rows, the same set |
| terms and their synonyms | `node.terms`, and `graph.glossary` for the set (341 glossary rows over 217 canonical terms — the 217 `DefinedTerm` nodes the export now carries) |
| `datePublished` | the embedding chapter's `publishedAt` — no entity carries one |
| `dateModified` | `.generated/content-lastmod.json`, keyed as `app/sitemap.ts` keys it |

Nothing had to be authored, and no locale strings were needed for the JSON-LD itself:
it carries no text a reader sees. One locale string was needed elsewhere — the
no-JavaScript line of §4.3, `kbPanelNoJs`.

### 2.4 The whole export, phase by phase

The one table that says what this branch did to the bytes a crawler reads. All 588
HTML files, markup only.

Each row is a build of that commit, measured by the script that measured every other
figure in this section.

| stage | commit | markup | change |
|---|---|---|---|
| before anything | `bd59046` | 49066744 B — 46.79 MiB | — |
| after phase 1a — KaTeX emits MathML | `2d32504` | 58227960 B — 55.53 MiB | **+8.74 MiB** |
| after phase 2 — the inbound rows are deferred | `5a627f6` | 52713372 B — 50.27 MiB | **−5.26 MiB** |
| after phases 4–5a — the JSON-LD | branch head | **54462178 B — 51.94 MiB** | **+1.67 MiB** |
| net across the branch | | | **+5.15 MiB, +11.0%** |

Two of the three steps can be checked a second way, against the finished export
rather than against the difference of two builds, and both come out to within a
rounding error. The MathML: 30987 `katex-mathml` subtrees totalling 9089482 B at 293 B
each, and 31319 of them at phase 1a before phase 2 deferred 332 — 9161056 B measured
directly against the 9161216 B the two builds differ by. The JSON-LD: 542 blocks
totalling 1748678 B against a 1748806 B difference.

**The one prediction that was badly wrong is the MathML.** §5.3 priced
`htmlAndMathml` at +3.16 MiB. It cost +8.74 MiB — 2.8× the estimate — and that
is corrected there and in D11, without changing the decision, which D11 makes on
accessibility grounds first and which stands whatever the number is. Everything else
landed: option A's prediction that the payload copy would not move is exact (14401
before, 14401 after), and §4.1's "about 5.3 MiB" for the first half was very nearly
exact — the deferred sections lost 5547530 B, **5.29 MiB**, of content. The
whole-export markup fell slightly less than that, −5.26 MiB, because phase 2 also
*added* the no-JavaScript style block and line to 537 pages.

So the branch serves *more* markup than it found, and that is the honest headline. It
serves less of one thing — repeated inbound rows, down 5.29 MiB and 10902 rows — and
more of two others that are not repetition: the mathematics, which no screen reader
could read before, and 1.67 MiB of machine-readable structure that replaces the rows
rather than duplicating them.

---

## 3. Are these one job?

**In code, no. In argument, yes.** They belong in one plan and one branch, phased so
that either can ship or be reverted on its own.

### 3.1 Why they are not technically coupled

They touch disjoint files. The first half changes where `BacklinkList` renders
(`components/kb/Panel.tsx`, `KbEntityPage.tsx`, and the three panel components). The
second adds a module and one element to the page. Neither needs the other to work,
and neither's tests overlap.

### 3.2 Why they still travel together

Taking the rows out of the markup contradicts a settled decision. The page-layout
sub-plan's §2.1 says "any content that can contain an internal cross-link is rendered
server-side and present in the served HTML", and D6 gives the reason: "the
inbound-reference lists are the edges of the knowledge graph, and exposing that graph
to crawlers is the whole point of the ticket."

That reason survives this change, and JSON-LD is why: **an inbound list is the
transpose of other pages' outgoing edges.** If every page declares what it cites,
the whole graph is expressible without any page carrying up to 236 rows about what
cites *it*. The outgoing edges are already crawlable as ordinary links in the prose
(D1 of the same sub-plan kept them real links), so the graph is not lost the moment
the rows go — but it is stated *once, machine-readably, per page* only once JSON-LD
lands.

So: one plan, because the amendment to §2.1 and D6 has to name what replaces them.
Separate commits per phase, because the risky half is the panel change and it should
be revertible without taking the structured data with it.

### 3.3 Why the other two panel kinds stay

- **`context`** — the chapter and section a node is introduced in, two to four links,
  0.5% of the markup. It is the one panel whose content a reader with no JavaScript
  genuinely needs, and it is not repeated anywhere else on the page.
- **`reference`** — one row per outgoing target, 3475 rows in total, naming a page
  the body already links to in the same sentence. It costs 2.1% of the markup and it
  is the *outgoing* direction, which is the direction we want crawlable.

---

## 4. The first half: how the rows leave the markup

### 4.1 Three ways to do it, and the one to pick

**A — the server keeps rendering the rows; the client decides whether they reach the
HTML.** `Panel` already receives each section's content as a `ReactNode` prop across
the client boundary. A client component that renders its children only once the
panel has been opened emits nothing during the server HTML pass, while the children's
RSC tree still lands in the payload — which is exactly the "JS variable in a script
tag" from the ask, except React already writes and reads that script tag.

Evidence it works this way: the menu's labels are props of a portalled client
component, and `Bejövő hivatkozások` appears **0 times in `gyuru-test`'s markup and
once in its payload**. Props reach the payload whether or not the client renders
them. Phase 0 confirms the same for a `ReactNode` prop on a real build before
anything else is written.

- Costs nothing in bundle size, adds no data type, and cannot change how a row looks
  or behaves — it is the same component rendering the same markup, later.
- Keeps the rich rows in the payload: served bytes fall by the markup copy only,
  about 5.3 MiB across the export.

**B — a compact data array and a client-side renderer.** Serialize
`KbBacklinkSource` (label, ownership, href, count, kind, fqn), pass that instead, and
rebuild the rows on the client.

- Shrinks the payload copy as well as dropping the markup one, so it saves more bytes
  than A.
- But it needs the row markup written a second time in a client component, and it has
  to answer the math: 332 of 14225 row labels carry `$…$`, and `InlineText` renders
  those with KaTeX. Rendering labels on the client either pulls KaTeX into the bundle
  for 2.3% of labels, or ships pre-rendered KaTeX HTML per label in the data, which
  gives back much of the byte saving in the one place it was largest.

**C — fetch the rows from an API.** Ruled out by the ask, and rightly: the site is a
static export served from R2, and this would be the first thing on it that needs a
request at read time.

**Pick A.** It gets the whole of the SEO benefit — no rows in the markup, no rows in
the link graph a crawler builds from the markup — for a change of a few lines, with
no risk of the rows rendering differently than they do today. B is a byte
optimization on top, and one whose best case is bounded by the payload measurement in
§2.2; it can be its own follow-up if the payload turns out to matter.

**A shipped, and B's price is now a number rather than a bound.** Phase 2 took the
markup copy and left the payload's 14401 rows exactly where they were, which is what A
promised. So B's whole remaining prize is those 14401 rows: they are the reason
`gyuru-test` still serves 942815 B while carrying 7 rows of markup. §12.1 has what a
follow-up would buy and what it would cost.

The math caveat above got its second confirmation from the other side, too. §4.1 B
counted 332 of 14225 row labels carrying `$…$` in the graph; after phase 2 the export's
formula count fell 31319 → 30987, a difference of exactly those 332. The payload still
carries 31301 `katex-mathml` subtrees against the markup's 30987 — 314 formulas that
are rendered and delivered but no longer in the HTML. (314 and not 332 because that
count is taken from the Flight stream rather than from the graph, and the two channels
need not agree to the unit; the order of magnitude is the point.) A client-side
renderer would have to reproduce every one of them.

### 4.2 The sketch

```tsx
// components/kb/panels/DeferredPanelContent.tsx  (client)
export default function DeferredPanelContent({ open, children }: Props) {
  const [everOpened, setEverOpened] = useState(open)
  if (open && !everOpened) setEverOpened(true)
  return everOpened ? <>{children}</> : null
}
```

`Panel` wraps a section's content in it when the section is one of the three inbound
kinds, and hands it `open`. `everOpened` rather than `open` so that closing does not
throw the rows away mid-slide — the same reason `Panel` already keeps `shown` after
`activeKey` drops to `null`.

Which kinds defer is one list, in one place, so the answer to "is this content in the
served HTML?" stays readable off a single constant.

### 4.3 What this costs, stated plainly

- **A reader with no JavaScript loses the inbound lists.** Phase 20 of the page-layout
  sub-plan added a `<noscript>` stylesheet that reveals every panel inline for them;
  after this change the three inbound sections would reveal as empty. They must
  either be hidden by that stylesheet or carry one line saying the lists need
  JavaScript. Recommendation: hide the `term` and `claim` sections, and give
  `incoming` the one line — a reader who opened the page for "what cites this?"
  deserves to be told, not shown a blank. §9 has the wording question that is left.
- **Print is unaffected** — panel content already does not print.
- **The rows stay in the RSC payload**, including the addressable `*.txt` copies of
  it. If the goal is that no crawler anywhere reads a backlink row, the payload is
  the second half of the job, and D9 is where it lives. If the goal is
  the markup and the link graph, this is done.
- **`HighlightOnArrival` keeps working unchanged.** It listens on `document` in the
  capture phase for `data-highlight-fqn`, precisely because it could not be handed a
  handler by a server-rendered row. A row that appears later is still a row it sees.

### 4.4 What it actually saved, measured

Measured on the local export after phase 2, the same way §2.1 was measured: *markup*
is a page's served bytes minus its `self.__next_f` script elements, over all 588 HTML
files the build produces.

| | before phase 2 — `2d32504` | after phase 2 — `5a627f6` |
|---|---|---|
| markup, all 588 HTML files | 58227960 B — 55.53 MiB | **52713372 B — 50.27 MiB** (−5.26 MiB, −9.5%) |
| the three deferred sections' content | 5758553 B | **211023 B** (−5547530 B, −5.29 MiB) |
| backlink rows in the markup | 14417 | **3515** |
| the same rows in the RSC payload | 14401 | 14401 — unchanged, as §4.1 A predicted |
| `gyuru-test` served bytes | 1359615 | **924871** (−32.0%) |
| `gyuru-test` backlink rows in the markup | 891 | **7** |

The two byte rows differ by 32942 B, and that is not slack: the sections lost 5.29 MiB
of content while the page gained the no-JavaScript `<style>` block and line, on each
of 537 pages. The saving quoted elsewhere is the whole-export one, −5.26 MiB.

Both columns are a build of the commit named, and both already carry the MathML of
phase 1a, so the difference is phase 2's alone.

**The 3515 rows that stay are all `reference` panels** — one row each, naming an
outgoing target the body already links to (§3.3), rendered by the same component from
the same stylesheet. That is why the gate §8 describes as "no `backlinks-panel_link`
remains" is not the gate that was built: as written it would fail on a correct
export. `scripts/check-deferred-panels.mjs` scopes the rule by `data-kb-panel-kind`
instead, and requires the reference and context panels to still have their content —
so a change that emptied every panel on the site fails it rather than passing.

A second thing the measurement turned up: `check-anchors.mjs` went from checking
24353 fragment links to 20455, because the deferred rows' hrefs left the markup with
the rows. They did not leave the export — they are in the payload, which is where the
check now reads them too, so both channels are covered (44808 links, 20455 in the
markup and 24353 in the payload).

The whole-export figures of §2 are not rewritten here; that is phase 7's job, and it
has the MathML half to fold in as well. **Done:** §2 now carries the before and the
after, and §2.4 puts this table's two columns in the middle of the four-stage sequence
the whole branch produced.

---

## 5. The second half: structured data for machines

Three pieces. The first two are the second half proper — the per-page JSON-LD and one
`llms.txt`. The third, §5.3, is neither half: it is one word in `lib/utils/math.ts`
that touches every page on the site, it is justified by accessibility before
extraction, and it ships on its own (phase 1a). It sits here because it is the third
answer to the same question — where does a machine find the mathematics.

### 5.1 The JSON-LD

The data structure has a document of its own — **[the JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md)** —
because it is the half that needs explaining rather than justifying, and because it is
the part still being iterated on. It covers what JSON-LD is from first principles, the
vocabulary key by key, the `@id` scheme, and a complete worked example for every page
kind, all built from real export data.

What that document settles, in brief:

| | |
|---|---|
| one block per page | `<script type="application/ld+json">` holding a `@graph` |
| ids | the page's canonical absolute URL, plus a fragment when the thing is not the page (`#theorem`, `#breadcrumb`, `#fogalmak.oszto`) |
| the page | `WebPage`, or `CollectionPage` for the four list pages |
| the thing itself | `CreativeWork` + `additionalType` naming a verified Wikidata concept — `Q65943` theorem, `Q11538` mathematical proof, `Q114425676` mathematical definition, nothing for a remark |
| structure | `isPartOf` / `hasPart` for the ownership chain and the embedding chapter, with three-line `Chapter` and `Book` stubs |
| the graph | `citation`, one edge per outgoing reference, pointing at the exact anchor the prose links to — which is where the target page declares its `DefinedTerm` |
| terms | a `DefinedTerm` per term the node introduces, with `alternateName` for synonyms and `inDefinedTermSet` naming the glossary |
| navigation | `BreadcrumbList`, from the same chains the visible breadcrumb row uses |
| the site | `Organization` + `WebSite`, on the locale root only |
| left out | inbound edges, claims, member lists, `author`, and any `Article` type |

Size, measured on the built export rather than estimated: **2649 B of JSON**, 2693 B
with its `<script>` wrapper, on the worked theorem page, whose markup is now 25641 B
and carries no inbound rows at all — against 30280 B of markup and a 9671 B `incoming`
section before the branch. The "about 2.2 KiB" this section first printed understated
its own worked example: the block as printed in §5.1 of the design minifies to 2583 B,
and the shipped one carries the untruncated `description`.

Across the export: **542 blocks, 1748678 B of markup** — 537 entity pages, the four
list pages, and the locale root. Counted with their wrappers, an entity page's block
runs 1881 B at the smallest, 3034 B at the median, and 8567 B on `gyuru-test`, which
has the most terms to declare. That is 1.67 MiB of structure bought for the 5.29 MiB
of repeated rows §4.4 removed.

### 5.2 `llms.txt`

One markdown file at `/llms.txt`, generated at build time from the graph so it cannot
go stale: a title, a paragraph saying what the site is, and then linked sections for
the knowledge-base root, the definitions and theorems indexes, the glossary, and the
books — with the live counts beside them.

**As built: 1502 B, 7 links, 3 sections.** The third is one this section did not list —
`## Egyéb`, holding the home page and a pointer to `sitemap.xml`. It is there because a
map whose every entry is inside the knowledge base does not say where the site starts
or where the exhaustive list is, and both are one line. `scripts/gen-llms-txt.mjs`
writes it and `scripts/check-llms-txt.mjs` gates every link and every count in it.

**Curated, not exhaustive.** The convention favours a short map over a dump, and the
exhaustive list already exists twice: the sitemaps, and the index pages' own markup.
537 entity links here would be 40 KiB of the same thing a third time, which is the §5.6
argument of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#56-the-root-and-the-two-index-pages)
applied to a different file.

It is the natural home for a pointer to the whole-graph file if that ever lands, which
is the one reason to build it before that question is settled rather than after.

### 5.3 Formula fidelity: the LaTeX belongs in the markup

Measured on 2026-09-07, and this was the surprise of the review. `lib/utils/math.ts`
calls KaTeX with `output: 'html'`, so the export contains **zero**
`<annotation encoding="application/x-tex">` elements — the LaTeX source of every
formula on the site is absent from the served bytes. A text extractor gets the visual
glyph run instead, and superscripts flatten:

| | what a tag-strip yields |
|---|---|
| authored | `a^{p-1}\equiv 1\pmod p` |
| today, `output: 'html'` | `a p − 1 ≡ 1 ( mod p )` — legible, but reads equally as *a·p−1* |

On a site whose value to a model is mathematical statements, that ambiguity is a
citation risk, and it is the one thing §1.7 of the design says extraction genuinely
destroys.

**The fix is one word in `lib/utils/math.ts`: `output: 'htmlAndMathml'`** (D11). KaTeX
then wraps each formula in a MathML subtree alongside the visual one, and that subtree
carries the authored LaTeX in an `<annotation encoding="application/x-tex">` — a text
node, so even a naive converter reads it.

**Verified non-breaking, not assumed.** `app/layout.tsx` imports the whole of
`katex/dist/katex.min.css`, and the shipped bundle contains
`.katex-mathml{clip:rect(1px,1px,1px,1px);…overflow:hidden;position:absolute}`. The
MathML is therefore invisible; the page looks identical.

#### The three options, priced

| option | markup added | reaches a naive tag-strip | reaches an HTML parser | reaches a screen reader |
|---|---|---|---|---|
| the body as `text` in the JSON-LD | +756 KiB | only if scripts are read | yes | no |
| `data-tex` on the formula spans | +141 KiB | **no** — attributes are not text | yes | no |
| **`output: 'htmlAndMathml'`** | **+3.16 MiB estimated; +8.74 MiB measured** | **yes** | yes | **yes** |
| a clean `.md` sibling per page | 0 on the page | yes, if fetched | yes | n/a |

Two of them died on measurement. **`text` was 5.4× too expensive for what it delivered:**
the LaTeX source across the corpus is 141 KiB, the whole-body text is 756 KiB, so 81% of
those bytes would have been prose the extractor already reads perfectly — and 72% of the
total landed on the 190 proof pages, whose median body is 2050 B against a theorem's 321
B. **`data-tex` was cheap and inert:** attributes do not survive text extraction, which
is the one path that needed serving.

#### What it costs, site-wide

An earlier figure in this plan was knowledge-base-only and therefore wrong — the
chapters carry more mathematics than the knowledge base does — and the figure that
replaced it was wrong too, by more. **Two of this table's four rows were badly off**,
and the correction is the second column. The estimates are kept beside the
measurements rather than overwritten, because which estimates held is the point of
keeping a record at all.

| | markup, estimated 2026-09-07 | markup, measured 2026-09-08 |
|---|---|---|
| KaTeX markup, all 588 pages, before | 9.87 MiB — 21.3% of all markup | **25794153 B — 24.60 MiB, 53% of all markup** |
| `htmlAndMathml` adds | +3.16 MiB | **+8.74 MiB** |
| the first half removes | −5.29 MiB | −5.26 MiB |
| **net** | −2.1 MiB | **+3.48 MiB** |

**The MathML cost 2.8× the estimate.** Measured on the finished export: 30987
`katex-mathml` subtrees totalling 9089482 B, an average of **293 B per formula**. At
phase 1a, before phase 2 deferred 332 of them with their rows, there were 31319 of
them totalling 9161056 B — and the two builds either side of that phase differ by
9161216 B of markup, 46.79 → 55.53 MiB, for one word in `lib/utils/math.ts`. The two
measurements agree to 160 bytes. The "KaTeX markup today" row was low by a much wider
margin: a whole `<span class="katex">` subtree averaged 824 B before the MathML and
1123 B after, so the formulas were already **half** the markup on this site before any
MathML was added, not a fifth of it. With the MathML they are 34788109 B — 33.18 MiB
of the export's 51.94 MiB, **64% of all markup**, and the largest single thing on the
site by a wide margin.

**So the net flips sign.** With phase 2's −5.26 MiB, the branch adds **+3.48 MiB**
of markup rather than saving 2.1 MiB. §2.4 has the whole sequence including the
JSON-LD, and lands at +5.15 MiB across the branch.

**And the served column does not double the way it was drafted to.** MathML is
duplicated in the RSC payload — 31301 escaped subtrees against the markup's 30987 — so
it does cost roughly twice again there. The first half's saving does *not* double:
option A (D2) deliberately keeps the payload's rows, so its served saving is the same
−5.26 MiB, not −10.58. The whole export now serves 147.03 MiB, 95.09 MiB of it payload.

Taken anyway, because bytes are bandwidth while the things this plan fights are junk
links and duplicated prose — and hidden MathML is neither. At 2.8× the price the
argument is thinner, and it is D11's accessibility ground, not its byte ground, that
carries it.

#### And the reason it is really worth doing

With `output: 'html'`, the only text-bearing span KaTeX emits carries
`aria-hidden="true"`. **Every formula on the site is currently announced as nothing by a
screen reader.** That is an accessibility defect on a mathematics site, this is its fix,
and it is a better justification than extraction is. Hence its own commit and its own
phase, independent of both halves of this plan.

Two caveats to carry into that commit:

- **A naive extractor now reads each formula three times** — MathML glyphs, then the
  LaTeX, then the visual span: `a p − 1 ≡ 1 ( m o d p ) a^{p-1} \equiv 1 \pmod p a p − 1
  ≡ 1 ( mod p )`. The LaTeX arrives, wrapped in noise. An extractor honouring
  `aria-hidden` sees two copies rather than three.
- **Find-in-page may match the clipped MathML text.** Minor, and nothing can be done
  about it short of not shipping MathML.

Fifteen text assertions across the e2e suite could in principle see the doubled
`textContent`. The fixtures carry no mathematics today, so they will probably pass
untouched; the run is what settles it.

## 6. Decision log

**All eleven shipped.** Each entry below now ends with what was built and where, and
two of them say where the build disagreed with the decision — D5's `@id` rule and D9's
markup gate. Nothing here was reversed.

### D1 — Inbound lists are produced on reveal; everything else is still revealed only

This supersedes the inbound-list half of §2.1 and D6 of the page-layout sub-plan. The
rule becomes: *anything a crawler should follow is in the served markup, except an
inbound-reference list, which is the transpose of edges other pages already state.*
The `context` panel, the `reference` panels, the body, the ownership chain, the
indexes, and the glossary are unchanged.

The sub-plan itself is **not edited** — it records what was decided in August, and
that record stays accurate. §7.3 is where the current statement of the rule goes.

**Shipped** in phases 2 and 3. `DEFERRED_PANEL_KINDS` in
`components/kb/KbEntityPage.tsx` is the list; the current statement of the rule is in
`docs/content-site-and-static-generation.md`, and the sub-plan was left alone.

### D2 — The rows stay server-rendered; only the HTML pass is gated

Option A of §4.1. The server keeps building the rows, so the markup a reader sees on
open is byte-identical to today's, and no row logic exists twice.

**Shipped** in phase 2, as `components/kb/panels/DeferredPanelContent.tsx`. The
prediction it rests on held exactly: the payload's backlink rows read 14401 before the
change and 14401 after (§4.4).

### D3 — Scope is the three inbound lists

`incoming`, `term`, and `claim`. §3.3 has the numbers for why `context` and
`reference` stay.

**Shipped** unchanged. The export carries 537 `incoming`, 217 `term` and 150 `claim`
sections with no content, beside 537 `context` sections with their 1074 links and 3515
`reference` sections with their rows.

### D4 — JSON-LD states outgoing edges only

No page declares what cites it. The graph is recovered by transposing, which is how
every other link on the web works, and it keeps the largest page's structured data at
a few KiB instead of a few hundred.

**Shipped**, and gated: assertion 7 of `scripts/check-structured-data.mjs` requires
every `citation` target to be an address the page's own markup already links, which an
inbound reference cannot be. The largest block on the site is `gyuru-test`'s, at 8567 B.

### D5 — One script per page, `@graph`, `@id`s are canonical URLs

So that nodes cross-reference by id within a page and across pages, and so a checker
can assert "every `@id` in the export is either a URL the export contains or a
fragment on the page that declares it".

**Shipped, with the checker's rule tightened.** The "either … or" turned out to be
unimplementable as two alternatives: read literally the second adds nothing, because
the page being read is in the export by definition; read loosely it exempts every
`#theorem`, `#proof` and `#breadcrumb` id from the base check, which is the drift the
rule exists to catch — and while it was written that way the gate missed a broken id.
`scripts/check-structured-data.mjs` asserts **one** requirement instead: strip the
fragment, and a URL on our own origin must have a file behind it. Nothing needed the
escape. 12952 addresses resolve that way in the export, and 5 off-origin ones are
counted and skipped. §9 of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#9-how-it-gets-checked)
states the rule in its implemented form.

### D6 — Structured data is derived from the graph, never authored

Same reason `kbExcerpt` is derived: there are 537 of these pages, and no content file
will grow a `jsonld:` field.

**Shipped.** `lib/content/structured-data.ts` reads the graph and nothing else; no
content file changed on this branch.

### D7 — A reader with no JavaScript loses the inbound lists

Accepted, with a line of explanation in the `incoming` panel rather than silence.
See §4.3; §9 records the wording, which is no longer open.

**Shipped** in phase 2, exactly as recommended: the `term` and `claim` sections are
hidden outright by `noJsCss` in `components/kb/Panel.tsx`, and the `incoming` section
carries one line that speaks for all three. One line per page, not one per section —
537 of them across the export, which `scripts/check-deferred-panels.mjs` counts.

### D8 — No new API, no new request at read time

The site stays a static export served from R2. Both halves are build-time work.

**Shipped.** Nothing on this branch fetches anything at read time. `llms.txt` is
written by `prebuild`; the JSON-LD is rendered into the page.

### D9 — The RSC payload files are disallowed in `robots.txt`

`Disallow: /*.txt` in `app/robots.ts`. The `*.txt` files — 587 of them, one per page,
counted wrongly as 589 when this was written (§2.2) — are Next's RSC payloads:
a full second copy of every page's content, including the inbound rows the first half
removes from the markup. Nothing in the markup links to them, and only a client-side
navigation fetches one, which no crawler performs. So disallowing them costs a reader
nothing and takes 21 MiB of duplicate content out of a crawler's reach.

`robots.txt` is itself a `.txt` at the root, and the pattern nominally covers it —
harmless, because a crawler fetches `robots.txt` before it has any rules to apply. The
sitemaps are `.xml`.

**And the pattern would hide `/llms.txt`, which D10 now adds**, so the rule is a pair:

```
Disallow: /*.txt
Allow: /llms.txt
```

**RFC 9309** — the robots.txt standard, not a Google house rule — resolves a conflict
by the longest matching path and breaks a tie in favour of `Allow`. `/llms.txt` is nine
characters against `/*.txt`'s six, so the allow wins for every crawler that implements
the standard.

**And a crawler that does not implement it fails open here, not closed.** This
paragraph first said such a crawler "skips `llms.txt`, which is the acceptable failure
here", and that is backwards. `/*.txt` needs wildcard support to match anything at all,
and Next emits the `Allow` lines *before* the `Disallow`, so a first-match parser —
Python's stdlib `urllib.robotparser`, for one — permits everything. `/llms.txt` stays
reachable either way. What such a crawler loses is the payload rule, which is
duplicate-content hygiene rather than access control, so losing it is the harmless
direction. `65d96f7` corrected the same wrong framing in `app/robots.ts`.

**Shipped** in phase 1, with the `Allow` line following in phase 5a. **The "21 MiB"
above was never right and is now far out:** the 587 payload files totalled 60628790 B,
**57.82 MiB**, at `bd59046`, and total 71777304 B, **68.45 MiB**, today — phase 1a's
MathML lands in the payload too. The comment in `app/robots.ts` still carries the old
figure — §12.4.

### D10 — One curated `llms.txt`, generated from the graph

§5.2. Generated rather than authored, for the reason `kbExcerpt` is derived: a hand-kept
file listing counts of a knowledge base that changes every release is a file that lies
within a release. Curated rather than exhaustive, because the exhaustive list already
exists in the sitemaps and in the index pages' markup.

**Shipped** in phase 5a: 1502 B, 7 links, 3 sections. The third section, `## Egyéb`,
is one §5.2 did not list — see there.

### D11 — The LaTeX goes into the markup, as MathML

§5.3. `lib/utils/math.ts` switches from `output: 'html'` to `output: 'htmlAndMathml'`,
so every formula ships its authored LaTeX in an `<annotation encoding="application/x-tex">`
that a text extractor can read. Verified visually non-breaking: the `.katex-mathml`
clipping rule is in the shipped CSS.

**This reverses an earlier draft of this decision**, which put the body text in the
JSON-LD instead. Two measurements killed that: the whole-body `text` cost 756 KiB to
deliver 141 KiB of actually-missing LaTeX, 72% of it on proof pages; and it put content
in a channel meant for structured data, so a crawler reading the markup — which is where
crawlers read content — gained nothing. `data-tex` attributes were the other rejected
option: 141 KiB and inert, because attributes are not text.

**Decided on accessibility grounds first.** With `output: 'html'` every formula on the
site is invisible to a screen reader. Extraction is the second reason, not the first.

Its own phase and its own commit: it touches every page on the site, it belongs to
neither half of this plan, and it should be revertible alone.

**Shipped** in phase 1a, and **it cost 2.8× what this decision priced it at**: +8.74
MiB of markup, not +3.16 MiB — 293 B on each of 31319 formulas at the time, gated by
`scripts/check-mathml.mjs`, which finds 30987 annotations and 1601 authored formulas
verbatim in a tag-strip of the export. §5.3 has the corrected tables.

**The decision stands at the corrected price**, and it is worth being explicit about
why rather than letting the arithmetic decide after the fact. The reason given above
is accessibility, stated first and on its own: every formula on the site was announced
as nothing. That argument does not consult the byte count. What the correction does
change is the *secondary* claim — this is no longer a change that pays for itself out
of the first half's saving, and §5.3 no longer says it is. The lever if the bytes ever
matter is `output: 'mathml'`, in §11, which was measured at 522 B against 1349 B for
the same formula and would take roughly 6 MiB back out.

## 7. Change inventory

### 7.1 The first half

| file | change |
|---|---|
| `components/kb/panels/DeferredPanelContent.tsx` | new, client — renders children once its panel has been opened |
| `components/kb/Panel.tsx` | wrap the deferred kinds; adjust `noJsCss` so an empty section is not revealed |
| `components/kb/KbEntityPage.tsx` | mark which sections defer (one constant, one list) |
| `components/kb/panels/BacklinksPanel.tsx`, `TermPanel.tsx`, `ClaimPanel.tsx` | doc comments only — each states "§2.1 requires these rows in the served HTML", which stops being true |
| `components/kb/HighlightOnArrival.tsx` | doc comment only — the paragraph explaining why the click is intercepted on `document` cites the rows being server-rendered |
| `e2e/kb-backlinks.test.ts`, `kb-select.test.ts`, `kb-sweep.test.ts` | the no-JavaScript and served-markup assertions invert; the with-JavaScript ones stand |
| new gate | ~~the built markup carries no `backlinks-panel_link` outside a `<script>`~~ — **not what was built.** A correct export keeps 3515 of them, because `ReferencePanel` renders the same row from the same stylesheet for every *outgoing* reference. `scripts/check-deferred-panels.mjs` scopes the rule by `data-kb-panel-kind` instead: a deferred section carries nothing but the no-JavaScript line, and a section that is not deferred must still carry its content. §4.4 and §8 have the reasoning |

### 7.2 The second half

| file | change |
|---|---|
| `lib/content/structured-data.ts` | new — builds the `@graph` for every knowledge-base page kind from the content graph |
| `components/kb/StructuredData.tsx` | new — renders one `application/ld+json` script |
| `app/[locale]/[[...path]]/page.tsx` | render it for the four list kinds and the four entity kinds |
| `app/page.tsx` (or the home branch of the route) | the `Organization` and `WebSite` nodes |
| `test/structured-data.test.mjs` | new — shape, ids, and relations over the fixture graph |
| `scripts/check-structured-data.mjs` | new postbuild gate — see §8 |
| `scripts/gen-llms-txt.mjs` | new — writes `public/llms.txt` from the graph, joining the existing prebuild generators |
| `package.json` | the new gate joins `postbuild`; the generator joins `prebuild` and `predev` |
| `.gitignore` | `public/llms.txt` is generated, like the other generated assets |

### 7.3 The payload files

| file | change |
|---|---|
| `app/robots.ts` | `Disallow: /*.txt` plus `Allow: /llms.txt` on production, with the comment D9 asks for. Its own commit — it is neither half of this plan, and it should be revertible on its own |
| `lib/utils/math.ts` | `output: 'htmlAndMathml'` — one word, every page on the site, D11. Its own commit, for the same reason |

### 7.4 Documents

**No past plan is edited.** `yp-162-page-layout-sub-plan.md` and
`yp-162-knowledge-graph-urls-plan.md` record what was true and decided when they were
written, including §2.1 and D6 — the rule that put the inbound rows in the served
markup, and §5's deferral of structured data. A planfile is a record of a decision, not
a live specification, so the way to change the rule is to decide it here (D1) and to
make the *living* documentation say the current thing.

| document | change |
|---|---|
| `docs/plans/yp-151-yp-172-kb-jsonld-structure-sub-plan.md` | **written** — the JSON-LD design and explainer |
| `docs/content-site-and-static-generation.md` | its knowledge-base section gains a short paragraph on what is and is not in an entity page's markup, and one on the structured data. Living doc, so it cites the code — `components/kb/Panel.tsx`, `lib/content/structured-data.ts` — and never this plan |

`docs/seo-migration/post-launch-verification.md` lists JSON-LD under "Follow-ups (out
of YP-129 scope)". That is a checklist of a past release and stays as it is; the
follow-up is simply done, and this plan is where that is recorded.

**Checked on close-out, and left alone.** The line reads "JSON-LD structured data
(Article/Book/BreadcrumbList/Organization)" — a wish written before any of this was
designed. `BreadcrumbList`, `Book` and `Organization` all ship; `Article` deliberately
does not, and §6 of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#6-the-type-mapping-and-the-wikidata-uris)
has the reason — it would make every entity page a candidate for a rich result that
needs an author and an image we do not have. A follow-up list naming a type that the
work then chose against is not wrong, it is a list of what someone wanted in
2026; nothing in it is a claim about the current build, so nothing in it is stale.

**Both changes below shipped.** `docs/content-site-and-static-generation.md` has its
paragraph on what an entity page's markup does and does not carry, and its section on
the structured data and `llms.txt`. Both cite the code and neither cites this plan.
`docs/quality-gates-and-artifacts.md` gained the four new gates — and §12.2 records
one thing it says that is not true, which this work happened to notice and which
belongs to no phase here.

### 7.5 What the inventory above missed

The inventory was close, and these are the additions the work turned up. Listed so the
next reader of a change inventory knows what kind of thing it tends to miss.

| file | why it changed |
|---|---|
| `lib/content/lastmod.ts` | new — `dateModified` needed `.generated/content-lastmod.json`, and the reader and its key builders lived inside `app/sitemap.ts`. Lifted out so both consumers key the map identically; a second reader that keyed it differently would silently emit no dates at all |
| `app/sitemap.ts` | follows the lift, and is 19 lines shorter for it — 120 lines to 101 |
| `lib/i18n/metadata.ts` | exports `toIsoTime` and a new `pageTitleOf`, so a `Book` or `Chapter` node is named what that page's own `<title>` calls it rather than deriving the title a second time |
| `lib/content/kb-sections.ts` | `publishedCount` becomes the exported `kbPublishedCount`, because an index page's `numberOfItems` and the card a reader sees have to be one count, not two |
| `lib/content/graph.ts`, `components/kb/EntityChrome.tsx` | doc comments that cited §2.1's "these rows are in the served HTML" and stopped being true |
| `components/kb/panel.module.scss` | the class the no-JavaScript line is styled and gated by |
| `scripts/check-anchors.mjs` | rewritten to read hrefs from the RSC payload as well as the markup — §4.4 |
| `scripts/check-mathml.mjs`, `scripts/check-llms-txt.mjs` | two gates the inventory folded into other rows; each is its own postbuild step |
| `e2e/support/derive-fixtures.mjs`, `e2e/support/fixtures.ts` | the inverted assertions need fixtures that know which panel kinds defer |

Nine postbuild steps run in all: `set-html-lang`, `split-sitemap`, `check-build-version`,
`check-analytics-build`, `check-anchors`, `check-mathml`, `check-deferred-panels`,
`check-structured-data`, `check-llms-txt`.


## 8. Verification

| what | how |
|---|---|
| the rows are gone from the markup | strip `self.__next_f` scripts from every built page, then assert the sections whose `data-kb-panel-kind` is deferred carry nothing but the no-JavaScript line, while the ones that are not deferred still carry their content — `scripts/check-deferred-panels.mjs`. **Not** "no `backlinks-panel_link` remains", which was this row's first wording and would fail on a correct export: §4.4 has the 3515 legitimate ones and the reason |
| the rows still arrive on open | the existing `e2e/kb-backlinks.test.ts` suite, unchanged in its with-JavaScript half: 236 rows on `gyuru-test`, the tree's depths, the counts, the ordering |
| the arrival highlight still works | `e2e/kb-highlight.test.ts` — a row followed still lands with the parameter |
| no-JavaScript pages are not broken | `e2e/kb-sweep.test.ts`, reworked: the three sections are hidden or carry their line, and nothing else about the page changes |
| every page has exactly one valid JSON-LD block | postbuild gate `scripts/check-structured-data.mjs`: parse it, one script per page, `@context` present |
| the ids join up | the same gate: every absolute `@id`/`item`/`citation`/`url` URL on our own origin resolves to a file in the export — the shape of `check-anchors.mjs`, over JSON instead of hrefs. The "or it is a fragment on the page that declares it" alternative is not implemented: read literally it is subsumed (the page being read is in the export by definition), and read loosely it would exempt every `#theorem` and `#breadcrumb` id from the base check, which is the drift the rule exists to catch. Off-origin URLs are counted and skipped: the export has **five** such `citation` entries over **four distinct URLs** — `en.wikipedia.org/wiki/Gaussian_integer` from two remark pages, plus `hu.wikipedia.org` on Fermat and on Euler and `oeis.org/A001567`. The gate reports occurrences, so it prints five |
| the vocabulary is right | Google Rich Results Test and validator.schema.org on one page of each kind, on staging, by hand — the checklist is §8.1. **Both are done: `validator.schema.org` clean, and the Rich Results Test passed with the breadcrumb detected** |
| the mathematics survives extraction | a postbuild check that every `<span class="katex">` in the export carries an `<annotation encoding="application/x-tex">`, and that a tag-strip of one known formula contains its authored LaTeX verbatim |
| the page still looks the same | the e2e suite, plus one screenshot comparison on a math-dense chapter — the MathML must stay clipped |
| `llms.txt` is true | postbuild gate: it exists, every link in it resolves to a file in the export, and every count in it matches the graph |
| `llms.txt` is reachable | `curl` it on staging, and check `robots.txt` allows it while a page's `.txt` payload is disallowed |
| the byte effect | re-run §2's measurements and write the numbers into §10 |

### 8.1 The manual validation pass — **done**

Everything else in the table is automated. This one is not, and cannot be: the two
tools are hosted, they need a reachable URL or a paste box, and what they check is
whether the vocabulary says what we meant — which is a judgement, not an assertion.
`scripts/check-structured-data.mjs` deliberately stops short of it (its own header
says so).

**Status, split by tool.**

- **`validator.schema.org` — run, and clean.** The output was put through it by hand
  and it reported **no errors and no warnings**. Nothing in §7's list of deliberate
  omissions drew a complaint, and no property was flagged as used on a type that does
  not take it. Which of the eight pages below were pasted in was not recorded, so the
  per-page boxes stay unticked; the verdict is recorded, its coverage is not.
- **Google Rich Results Test — run, and passed.** The procedure below was followed
  over the eight pages listed, and the outcome was a pass: **`BreadcrumbList` is
  detected as one valid item, with no errors.** That is the specific expectation this
  half existed to confirm, because breadcrumbs are the only rich result this design
  targets. Nothing beyond the pass and that detection was reported back, so nothing
  more is claimed here.

**Before you start.** Staging is `noindex` and its `robots.txt` is `Disallow: /`, so
the Rich Results Test's *URL* mode will report the page as unavailable to Google. Use
its **Code** tab instead: open the page, view source, copy the contents of the
`<script type="application/ld+json">` element, and paste that. `validator.schema.org`
has the same choice and the same reason to prefer the paste box. Run URL mode against
production instead, after release, as a separate confirmation that the deployed bytes
are the ones that were validated.

Eight pages, one per kind the builder has a branch for:

| # | page | kind | what the block should hold |
|---|---|---|---|
| 1 | `/hu/tudasbazis/tetelek/kis-fermat-tetel` | theorem | `WebPage` → `CreativeWork` (Wikidata Q65943), `hasPart` its proofs and remarks, `citation`, `Chapter` + `Book`, `BreadcrumbList` |
| 2 | `/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1` | proof | `CreativeWork` (Q11538) whose `isPartOf` is the theorem |
| 3 | `/hu/tudasbazis/tetelek/kis-fermat-tetel/megjegyzesek/1` | remark | a `CreativeWork` with **no** `additionalType`, and the off-site `citation`s |
| 4 | `/hu/tudasbazis/definiciok/oszthatosag` | definition with terms | `CreativeWork` (Q114425676), `about` + `teaches`, and four `DefinedTerm`s whose `inDefinedTermSet` is the glossary |
| 5 | `/hu/tudasbazis/tetelek` | index | `CollectionPage` → `ItemList`, named and counted, members not enumerated |
| 6 | `/hu/tudasbazis/fogalmak` | glossary | `CollectionPage` → `DefinedTermSet` |
| 7 | `/hu/tudasbazis` | knowledge-base root | `CollectionPage` with its trail and nothing else |
| 8 | `/hu` | locale root | `Organization` + `WebSite`, and the `logo` |

**Google Rich Results Test** — <https://search.google.com/test/rich-results>

- [x] Pages 1–7: **Breadcrumbs** is detected as one valid item, with **0 errors**.
- [x] Page 8: **0 errors**. A `Logo` item may or may not be detected; either is fine,
      the `Organization` node is there for consumers rather than for a rich result.
- [x] Every page: no item is reported *invalid*. "No items detected" for
      `CreativeWork`, `ItemList` or `DefinedTerm` is **expected and not a failure** —
      the tool only reports the types Google has a rich result for, and none of those
      do. This is the trap to avoid reading as a problem.
- [ ] Any warning is written down here with a decision beside it. **None was reported
      back**, so there is nothing below; this box stays open because it records an act
      of writing down, and no warning was passed on to write.

**`validator.schema.org`** — <https://validator.schema.org/> — **run: no errors, no
warnings.** The boxes below stay unticked because the pass was reported as a verdict
over the output rather than page by page.

- [ ] All eight pages: **0 errors**.
- [ ] Every warning is one we chose. §7 of the [JSON-LD
      design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#7-what-we-leave-out-and-why)
      lists what is deliberately absent, so a warning about a missing optional property
      is expected; a warning about a property used on a type that does not take it is a
      finding, and belongs in §10 of the design or in a fix.
- [ ] The Wikidata `additionalType` URIs are accepted as written —
      `http://www.wikidata.org/entity/…`, `entity` not `wiki`, `http` not `https`
      ([§6 of the design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#6-the-type-mapping-and-the-wikidata-uris)
      has the reasoning; a validator that rewrites them is telling us something).

Record the outcome in this section: eight lines, page and verdict. If nothing is
wrong, that is still the record that it was looked at. Two lines so far, and the
difference between them is deliberate: **Google Rich Results Test, the eight pages
above, passed with `BreadcrumbList` detected as one valid item and no errors**, and
**`validator.schema.org`, whole output, no errors and no warnings**. Only the first
carries a page-by-page coverage claim, which is why only its boxes are ticked; the
validator's verdict was reported over the output rather than page by page, and ticking
its boxes on the strength of the other tool's run would be inventing coverage.

---

## 9. What was settled, and what is left

Settled on 2026-09-07, and every one of them shipped as decided:

| | question | decision | as built |
|---|---|---|---|
| 1 | the main entity's type | `CreativeWork` + `additionalType` | 537 `CreativeWork` nodes in the export |
| 2 | which type URIs | Wikidata concept URIs, each verified against the Wikidata API — see §6 of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#6-the-type-mapping-and-the-wikidata-uris) | `http://www.wikidata.org/entity/…`, `entity` not `wiki`, `http` not `https` |
| 3 | claims | omitted from the structured data | no `Claim` node anywhere |
| 4 | inbound edges in JSON-LD | omitted; the transpose argument stands | gated — assertion 7 of `check-structured-data.mjs` |
| 5 | `ItemList` on the index pages | named and counted, members not enumerated | 2 `ItemList` nodes, 0 `itemListElement` on them |
| 6 | the `*.txt` RSC payloads | `Disallow: /*.txt` — D9 | phase 1, with `Allow: /llms.txt` following in 5a |
| 7 | the `term` and `claim` panels | in scope; no inbound rows for them in the markup either | 217 `term` and 150 `claim` sections, all empty |
| 9 | `datePublished` | from the embedding chapter | via `lib/content/lastmod.ts` and the chapter's `published-at` |

### 9.1 The three that were left open

**What a reader with no JavaScript sees — decided, and shipped in phase 2.** The
recommendation of §4.3 is what was built: the `term` and `claim` sections are hidden
outright, and the `incoming` section carries one line that speaks for all three, so a
page with 34 panel sections shows the sentence once rather than 34 times. The
mechanism is `noJsCss` in `components/kb/Panel.tsx`; a deferred section with no line is
hidden, and the one with a line is revealed. The locale key is **`kbPanelNoJs`** and
the string is:

> A hivatkozások listájához JavaScript szükséges. Ugyanez igaz az egyes fogalmakra és
> állításokra szűkített listákra is.

("The list of references needs JavaScript. The same is true of the lists narrowed to a
single term or claim.") One string, not three, which is the whole reason the line lives
in the `incoming` section. `scripts/check-deferred-panels.mjs` asserts exactly one of
them per page and that it is inside the `incoming` section — 537 across the export.

**Whether `teaches` stays alongside `about` — decided: both ship.** §7.1 of the design
has the argument, and nothing in the build contradicted it: the pair costs about 60
bytes per term, `teaches` is the more precise statement and `about` the more widely
consumed one, and a definition page makes both truthfully. If one ever has to go it is
`teaches`, and the change is one word: `TERM_PREDICATES` in
`lib/content/structured-data.ts` is a list precisely so that dropping one is deleting
one entry rather than editing a builder.

**A brand logo asset for `Organization.logo` — still open, and the only design question
that is.** It ships pointing at `assets/generated/og-thumbnail.jpg`, which is verified
1200×630: a social card, not a logo. Google's `Organization.logo` wants something
square-ish and it is the one property here that has a rich-result consumer. Carried to
§12.5 and to §10.2 of the design.

## 10. Phases

Each ends with a commit and a review gate. Phase 2–3 are the first half, 4–6 the
second, and phase 1 is neither: either group can ship without the other, and the
`robots.txt` line can ship without any of them.

**All of them are done.** The commit each became is in the last column; phase 0 was a
throwaway build and left none. A ninth commit, `65d96f7`, sits outside the table: it
fixes the `app/robots.ts` comment phase 1 wrote, and is a correction rather than a
phase. **Nothing on this branch is unfinished:** the manual validation of §8.1, which
lives inside phase 6 and needed a browser rather than another commit, is done on both
halves.

| # | phase | why here | commit |
|---|---|---|---|
| 0 | Confirm the payload mechanism | one throwaway build with the wrapper in place, measuring markup and payload on `gyuru-test`. If a `ReactNode` prop does *not* survive into the payload unrendered, option A is dead and §4.1 B is the plan. Nothing is committed. | nothing committed; option A confirmed |
| 1 | `Disallow: /*.txt` | D9. One line, one commit, independent of everything else here. | `90f1630` |
| 1a | KaTeX emits MathML | D11. One word in `lib/utils/math.ts`, every page on the site, decided on accessibility grounds. Independent of both halves, and first because the e2e suite has to run against it before anything else moves. | `2d32504` |
| 2 | Defer the three inbound panels | `DeferredPanelContent`, the `Panel` wiring, the no-JavaScript line and the `noJsCss` adjustment, and the doc comments that claim the rows are in the served HTML. | `5a627f6` |
| 3 | Tests, the markup gate, and the living doc | invert the no-JavaScript assertions, keep the rest, add the postbuild gate, record the byte measurement, and give `content-site-and-static-generation.md` its paragraph. | `02ab439` |
| 4 | The structured-data builder and the entity pages | `lib/content/structured-data.ts` plus the four entity branches, with unit tests over the fixture graph. | `bf17bd7` |
| 5 | The list pages and the site nodes | the four list kinds, and `Organization` + `WebSite` on the locale root. | `1ce3b05` |
| 5a | `llms.txt` | the generator, the prebuild wiring, and the `Allow` line in `robots.ts` — D10 and D9. Independent of the JSON-LD; sequenced here only because it wants the counts the graph already gives phase 5. | `3f2b5cc` |
| 6 | The JSON-LD gate, the validators, and the living doc | the postbuild parse/id gate, the Rich Results Test and `validator.schema.org` by hand on staging, and the second paragraph in the living doc. | `f4a5e96` — **§8.1 done by hand afterwards, both tools** |
| 7 | Close out | measurements back into §2, and any follow-up written down where it belongs — option B of §4.1, and the JSON-LD design's own §10 list. | this document |

## 11. Out of scope

- **Structured data on chapter, book, article, and newsletter pages.** Worth doing,
  and a natural follow-up once the builder exists — but the ask is the knowledge base,
  and `Book`/`Chapter` typing for the narrative is its own design.
- **Option B of §4.1** — the compact data array. A byte optimization, revisited only
  if the payload measurement says it matters. The measurement is now in, and §12.1 has
  the number it bought.
- **Removing the RSC payload.** Not possible without leaving the App Router; already
  investigated under YP-122 item 9.
- **The whole knowledge graph as one generated file.** Designed and argued in §10 of
  the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#101-the-whole-graph-as-one-file--designed-not-scheduled); not built here.
  The per-page blocks are the prerequisite, not the alternative — the same builder
  emits both, so this gets cheaper by waiting rather than more expensive.
- **A clean `.md` sibling per entity page.** Considered and declined: it would have
  needed a markdown renderer for the whole block model — the largest piece of work
  anyone proposed for this plan — to deliver what D11 delivers for one word, and it
  would have made a second source of truth for content. It stays a lever rather than a
  rejected idea: if the edge logs later show AI crawlers fetching a lot and citing
  little, that is when to build it.
- **`output: 'mathml'`, without the KaTeX HTML.** Measured at **522 B against 1349 B**
  for the same formula — it would cut roughly 6 MiB from the export while delivering the
  LaTeX, the accessibility, and native rendering. It also moves typography from KaTeX's
  engine to the browser's across 588 pages, on a site that cares visibly about type. A
  two-page spike sometime, not this plan.
- **Redirects, URL changes, content edits.** Nothing here moves a URL.

---

## 12. Follow-ups this work leaves behind

Written here rather than in a transcript, because a follow-up nobody wrote down is a
follow-up nobody does. §12.2 and §12.3 are not this plan's work at all — they are
things the branch happened to walk into, and they had nowhere else to be recorded.

### 12.1 Option B of §4.1 — the compact data array

**What it would now buy, as a number.** Phase 2 took the markup copy of the inbound
rows and left the payload's alone, which is what option A promised and what §4.4
measured: 14401 rows before, 14401 after. So the entire remaining prize is that one
copy. The RSC payload is 95.09 MiB of the export's 147.03 MiB served bytes, and the
587 addressable `*.txt` files it also exists as total 68.45 MiB. `gyuru-test` is the
extreme: 942815 B served for 83803 B of markup, because 859012 B of payload carries the
891 rows the markup no longer does.

**What it would cost.** Everything §4.1 B said, with one figure now confirmed from a
second direction: the row labels carry mathematics. 332 of 14225 labels hold `$…$`, and
the payload still ships 31301 rendered `katex-mathml` subtrees against the markup's
30987 — the difference being exactly those labels. A client renderer either pulls KaTeX
into the bundle for 2.3% of labels, or ships pre-rendered KaTeX HTML in the data, which
returns much of the saving in the one place it was largest. It also means writing the
row markup a second time, in a client component, with `BacklinkList`'s tree and
ordering reproduced.

**Whether to do it.** Only if the payload's bytes turn out to matter to somebody. They
are not in the crawl path any more — D9 disallowed the `*.txt` files, and the inline
copy is inside `<script>` — so this is a bandwidth question, not an SEO one. The
cheaper lever on the same bandwidth is `output: 'mathml'` (§11): roughly 6 MiB, one
word, and no second renderer. Do that first if bytes are the goal.

### 12.2 `pnpm lint` cannot run, and the gate catalogue overstates what does

Not introduced here and not fixed here. Recorded because the next person to trust
`docs/quality-gates-and-artifacts.md` on this point will be wrong.

**`pnpm lint` fails.** `apps/website`'s `lint` script is `next lint`, which Next 15.5
deprecates ("will be removed in Next.js 16") and which, finding no ESLint
configuration, drops into an interactive setup prompt. With no TTY it exits 1 without
linting anything. There is no `eslint` dependency and no ESLint configuration file
anywhere in the repository.

**And `next build` does not lint either.** `docs/quality-gates-and-artifacts.md` used
to say the website build "**also runs ESLint + `tsc`**", and to repeat it under its
known gaps: "the website is linted + typechecked, but only inside `next build`". The
`tsc` half is true. The ESLint half was not: `next build` does call the lint runner,
but with no configuration present the runner warns `No ESLint configuration detected`
and returns without checking a file (`next/dist/lib/eslint/runLintCheck.js`).
**Nothing in this repository has ever been linted by a gate.** The doc has been
corrected to say so.

The fix is a decision, not a patch: adopt the ESLint CLI as the deprecation notice
suggests (`npx @next/codemod@canary next-lint-to-eslint-cli .`), add the config and the
dependency, and give it a step of its own in CI — or drop the `lint` script and the
claim together. Either is honest; the current state is neither.

### 12.3 A local production-mode build fails on the analytics gate

`SITE_ENV=production pnpm build` fails locally at `scripts/check-analytics-build.mjs`,
reporting that `NEXT_PUBLIC_GA_MEASUREMENT_ID` is empty when `.env.local` sets it.

The gate is right about its rule and wrong about its inputs. `next build` reads
`.env.local` itself; the pre- and postbuild scripts run as bare `node` and do not, which
is exactly what `scripts/lib/load-env.mjs` exists for — seven scripts import it and
`check-analytics-build.mjs` is not one of them. So the build bakes the measurement id
into the export and the gate that checks for it looks in an environment that never had
it. On CI the variable is exported by the workflow, so both see it and nobody notices.

Reproduced on 2026-09-08: `SITE_ENV=production node scripts/check-analytics-build.mjs`
exits 1 with the empty-id message, against an export that carries the id. One import
fixes it. Deliberately not fixed here — this plan changed no gate, and a gate change
belongs in a commit that says so.

### 12.4 The `app/robots.ts` comment understates the payload by 3×

This branch's own, and small. Phase 1 wrote into `app/robots.ts` that disallowing the
`*.txt` payloads "removes ~21 MiB of duplicate content". Measured, it was 60628790 B —
**57.82 MiB** — at the commit phase 1 branched from, and phase 1a's MathML has since
taken it to 71777304 B, **68.45 MiB**. So the comment was low by 2.8× when it was
written and is low by 3.3× now. The rule is unaffected — it is the comment's
arithmetic that is wrong, not the decision — and D9 carries the measured numbers. Left
for a commit that changes code, because this phase changed none.

### 12.5 Carried from the design

§10 of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#10-follow-ups)
holds the rest, and is the list to read next: the whole graph as one file, a real brand
logo for `Organization.logo` (the last open question of §9), structured data for
chapters and books, `sameAs` to Wikidata, `competencyRequired`, and the `.md` sibling
that stays a lever rather than a plan.
