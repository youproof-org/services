# Inbound references out of the HTML, and JSON-LD in

**Tickets:** YP-151, YP-172 — two items carried out of the knowledge-graph work
([§5 of the URL plan](yp-162-knowledge-graph-urls-plan.md#5-structured-data-json-ld--out-of-scope-separate-backlog-item)
deferred the JSON-LD half explicitly).
**Repos touched:** `youproof-org/services` only. No content edits, no infra edits.
**Status:** proposed. Nothing implemented.

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

## 2. Measured state

Measured on 2026-09-07 against the local export in `apps/website/out` — 540 built
knowledge-base pages: 84 definitions, 191 theorems, 190 proofs, 72 remarks, and the
three list pages under `tudasbazis/` (the root sits a level up). A deployed build
generates 389 of the entity pages, because an unpublished chapter takes its entities'
pages with it.

### 2.1 What the inbound lists cost today

| measurement | result |
|---|---|
| served bytes, all 537 entity pages | 68.8 MiB |
| of that, the RSC (Flight) payload | 42.9 MiB — **62%** |
| markup (served bytes minus the payload) | 25.8 MiB |
| **markup that is inbound-reference rows** | **5.29 MiB — 20.5% of all markup** |
| — the `incoming` panel | 2.56 MiB, 5322 rows |
| — the `term` panels | 2.22 MiB, 4496 rows |
| — the `claim` panels | 535 KiB, 932 rows |
| inbound rows in the markup | 10750 |
| `<a>` elements in the markup | 28806, of which **10750 (37%) are inbound rows** |
| average per page | 49.3 KiB of markup, 10.1 KiB of it inbound rows |
| median page | 22 rows in total, 1.5 KiB of `incoming` panel |
| worst page (`definiciok/gyuru-test`) | 1.23 MiB served; 883 rows in markup; the `incoming` panel alone is 106 KiB and 236 rows |

So a crawler reading an average entity page spends a fifth of the markup, and more
than a third of the links it finds, on rows that repeat what other pages already say
about themselves. On the worst page it is most of the document.

### 2.2 Two things worth knowing before choosing an approach

**The rows are already served twice.** Every one of them appears once as markup and
once inside the `self.__next_f.push(...)` scripts — the App Router's RSC payload,
which is expected boilerplate for a static export
([content-site doc](../content-site-and-static-generation.md#__next_f-script-tags-are-expected-not-a-bug)).
On `gyuru-test` that is 883 occurrences in the markup and 883 in the payload. **Any
approach that keeps the panel working keeps one of those two copies**, because the
copy in the payload is how the content reaches the client at all. §3 is about which
copy goes.

**The payload is also a URL.** The export contains 589 `*.txt` files — the same RSC
payloads, addressable (`out/hu/tudasbazis/definiciok/gyuru-test.txt` is 691 KiB) and
allowed by `robots.txt` on production. Nothing in the markup links to them; Next
fetches them for client-side navigation. They are a second, unmanaged copy of every
page's whole content, inbound rows included. That is a finding of this measurement
rather than part of the ask — D9 is what became of it.

### 2.3 What is available for JSON-LD, without new content

| datum | source |
|---|---|
| canonical absolute URL | `absoluteUrl` + the `urlFor*` helpers in `lib/content/urls.ts` |
| page name | `kbNodeTitle(graph, node)` — the derived title a `<title>` already uses |
| description | `kbExcerpt(node)` — the same string `<meta name="description">` gets |
| breadcrumb chain | `kbEntityBreadcrumbs` / `kbListBreadcrumbs` |
| the owner and the children | `node.proves`, `node.attachedTo`, `node.proofs`, `node.remarks` |
| the chapter and book a node is embedded in | `graph.embedding.get(fqn)` |
| outgoing references | `node.references`, resolved through `kbRefs` — median 5 per page, max 32, 3475 in total |
| terms and their synonyms | `node.terms`, and `graph.glossary` for the set (341 glossary rows over 217 canonical terms) |
| `datePublished` | the embedding chapter's `publishedAt` — no entity carries one |
| `dateModified` | `.generated/content-lastmod.json`, keyed as `app/sitemap.ts` keys it |

Nothing has to be authored, and no locale strings are needed: JSON-LD carries no
text a reader sees.

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

| | before phase 2 | after phase 2 |
|---|---|---|
| markup, all 588 HTML files | 55.53 MiB | **50.31 MiB** (−5.22 MiB, −9.4%) |
| backlink rows in the markup | 14417 | **3515** |
| the same rows in the RSC payload | 14401 | 14401 — unchanged, as §4.1 A predicted |
| `gyuru-test` served bytes | 1359614 | **924870** (−32.0%) |
| `gyuru-test` backlink rows in the markup | 891 | **7** |

Both columns are measured on a build that already carries the MathML of phase 1a, so
the difference is phase 2's alone.

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
has the MathML half to fold in as well.

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

Size: about 2.2 KiB on the worked theorem page, whose markup is 29.4 KiB today, 9.3 KiB
of it inbound rows.

### 5.2 `llms.txt`

One markdown file at `/llms.txt`, generated at build time from the graph so it cannot
go stale: a title, a paragraph saying what the site is, and then linked sections for
the knowledge-base root, the definitions and theorems indexes, the glossary, and the
books — with the live counts beside them.

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
| **`output: 'htmlAndMathml'`** | **+3.16 MiB** | **yes** | yes | **yes** |
| a clean `.md` sibling per page | 0 on the page | yes, if fetched | yes | n/a |

Two of them died on measurement. **`text` was 5.4× too expensive for what it delivered:**
the LaTeX source across the corpus is 141 KiB, the whole-body text is 756 KiB, so 81% of
those bytes would have been prose the extractor already reads perfectly — and 72% of the
total landed on the 190 proof pages, whose median body is 2050 B against a theorem's 321
B. **`data-tex` was cheap and inert:** attributes do not survive text extraction, which
is the one path that needed serving.

#### What it costs, site-wide

The earlier figure in this plan was knowledge-base-only and therefore wrong. The
chapters carry more mathematics than the knowledge base does:

| | markup | served, with the RSC payload's copy |
|---|---|---|
| KaTeX markup today, all 588 pages | 9.87 MiB — 21.3% of all markup | — |
| `htmlAndMathml` adds | **+3.16 MiB** | **+6.32 MiB** |
| the first half removes | −5.29 MiB | −10.58 MiB |
| **net** | **−2.1 MiB** | **−4.3 MiB** |

So it consumes about 60% of the first half's saving. Taken anyway, because bytes are
bandwidth while the things this plan fights are junk links and duplicated prose — and
hidden MathML is neither.

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

### D1 — Inbound lists are produced on reveal; everything else is still revealed only

This supersedes the inbound-list half of §2.1 and D6 of the page-layout sub-plan. The
rule becomes: *anything a crawler should follow is in the served markup, except an
inbound-reference list, which is the transpose of edges other pages already state.*
The `context` panel, the `reference` panels, the body, the ownership chain, the
indexes, and the glossary are unchanged.

The sub-plan itself is **not edited** — it records what was decided in August, and
that record stays accurate. §7.3 is where the current statement of the rule goes.

### D2 — The rows stay server-rendered; only the HTML pass is gated

Option A of §4.1. The server keeps building the rows, so the markup a reader sees on
open is byte-identical to today's, and no row logic exists twice.

### D3 — Scope is the three inbound lists

`incoming`, `term`, and `claim`. §3.3 has the numbers for why `context` and
`reference` stay.

### D4 — JSON-LD states outgoing edges only

No page declares what cites it. The graph is recovered by transposing, which is how
every other link on the web works, and it keeps the largest page's structured data at
a few KiB instead of a few hundred.

### D5 — One script per page, `@graph`, `@id`s are canonical URLs

So that nodes cross-reference by id within a page and across pages, and so a checker
can assert "every `@id` in the export is either a URL the export contains or a
fragment on the page that declares it".

### D6 — Structured data is derived from the graph, never authored

Same reason `kbExcerpt` is derived: there are 537 of these pages, and no content file
will grow a `jsonld:` field.

### D7 — A reader with no JavaScript loses the inbound lists

Accepted, with a line of explanation in the `incoming` panel rather than silence.
See §4.3, and §9 for the wording that is still open.

### D8 — No new API, no new request at read time

The site stays a static export served from R2. Both halves are build-time work.

### D9 — The RSC payload files are disallowed in `robots.txt`

`Disallow: /*.txt` in `app/robots.ts`. The 589 `*.txt` files are Next's RSC payloads —
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

Google resolves a conflict by the longest matching path, and ties in favour of `Allow`
— `/llms.txt` is nine characters against `/*.txt`'s six, so the allow wins. A crawler
that implements `Disallow` but not `Allow` skips `llms.txt`, which is the acceptable
failure here.

### D10 — One curated `llms.txt`, generated from the graph

§5.2. Generated rather than authored, for the reason `kbExcerpt` is derived: a hand-kept
file listing counts of a knowledge base that changes every release is a file that lies
within a release. Curated rather than exhaustive, because the exhaustive list already
exists in the sitemaps and in the index pages' markup.

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
| new gate | the built markup carries no `backlinks-panel_link` outside a `<script>` |

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

## 8. Verification

| what | how |
|---|---|
| the rows are gone from the markup | strip `self.__next_f` scripts from every built page, then assert the sections whose `data-kb-panel-kind` is deferred carry nothing but the no-JavaScript line, while the ones that are not deferred still carry their content — `scripts/check-deferred-panels.mjs`. **Not** "no `backlinks-panel_link` remains", which was this row's first wording and would fail on a correct export: §4.4 has the 3515 legitimate ones and the reason |
| the rows still arrive on open | the existing `e2e/kb-backlinks.test.ts` suite, unchanged in its with-JavaScript half: 236 rows on `gyuru-test`, the tree's depths, the counts, the ordering |
| the arrival highlight still works | `e2e/kb-highlight.test.ts` — a row followed still lands with the parameter |
| no-JavaScript pages are not broken | `e2e/kb-sweep.test.ts`, reworked: the three sections are hidden or carry their line, and nothing else about the page changes |
| every page has exactly one valid JSON-LD block | postbuild gate `scripts/check-structured-data.mjs`: parse it, one script per page, `@context` present |
| the ids join up | the same gate: every absolute `@id`/`item`/`citation`/`url` URL on our own origin resolves to a file in the export — the shape of `check-anchors.mjs`, over JSON instead of hrefs. The "or it is a fragment on the page that declares it" alternative is not implemented: read literally it is subsumed (the page being read is in the export by definition), and read loosely it would exempt every `#theorem` and `#breadcrumb` id from the base check, which is the drift the rule exists to catch. Off-origin URLs — the four Wikipedia and OEIS references the prose makes — are counted and skipped |
| the vocabulary is right | Google Rich Results Test and validator.schema.org on one page of each kind, on staging, by hand — the checklist is §8.1, and it is **still outstanding** |
| the mathematics survives extraction | a postbuild check that every `<span class="katex">` in the export carries an `<annotation encoding="application/x-tex">`, and that a tag-strip of one known formula contains its authored LaTeX verbatim |
| the page still looks the same | the e2e suite, plus one screenshot comparison on a math-dense chapter — the MathML must stay clipped |
| `llms.txt` is true | postbuild gate: it exists, every link in it resolves to a file in the export, and every count in it matches the graph |
| `llms.txt` is reachable | `curl` it on staging, and check `robots.txt` allows it while a page's `.txt` payload is disallowed |
| the byte effect | re-run §2's measurements and write the numbers into §10 |

### 8.1 The manual validation pass — **not done**

Everything else in the table is automated. This one is not, and cannot be: the two
tools are hosted, they need a reachable URL or a paste box, and what they check is
whether the vocabulary says what we meant — which is a judgement, not an assertion.
`scripts/check-structured-data.mjs` deliberately stops short of it (its own header
says so). **Status: outstanding.** It is the one item of phase 6 that is not finished,
and it is a few minutes' work for a person with a browser once the branch is on
staging.

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

- [ ] Pages 1–7: **Breadcrumbs** is detected as one valid item, with **0 errors**.
- [ ] Page 8: **0 errors**. A `Logo` item may or may not be detected; either is fine,
      the `Organization` node is there for consumers rather than for a rich result.
- [ ] Every page: no item is reported *invalid*. "No items detected" for
      `CreativeWork`, `ItemList` or `DefinedTerm` is **expected and not a failure** —
      the tool only reports the types Google has a rich result for, and none of those
      do. This is the trap to avoid reading as a problem.
- [ ] Any warning is written down here with a decision beside it.

**`validator.schema.org`** — <https://validator.schema.org/>

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
wrong, that is still the record that it was looked at.

---

## 9. What was settled, and what is left

Settled on 2026-09-07:

| | question | decision |
|---|---|---|
| 1 | the main entity's type | `CreativeWork` + `additionalType` |
| 2 | which type URIs | Wikidata concept URIs, each verified against the Wikidata API — see §6 of the [JSON-LD design](yp-151-yp-172-kb-jsonld-structure-sub-plan.md#6-the-type-mapping-and-the-wikidata-uris) |
| 3 | claims | omitted from the structured data |
| 4 | inbound edges in JSON-LD | omitted; the transpose argument stands |
| 5 | `ItemList` on the index pages | named and counted, members not enumerated |
| 6 | the `*.txt` RSC payloads | `Disallow: /*.txt` — D9 |
| 7 | the `term` and `claim` panels | in scope; no inbound rows for them in the markup either |
| 9 | `datePublished` | from the embedding chapter |

Left open, all small:

- **What a reader with no JavaScript sees.** The line to show, and where. The mechanics
  are in §4.3: with no JavaScript every panel section is revealed inline at once, so a
  page like `oszthatosag` would show four term sections and its claim sections
  simultaneously, each one empty. One line repeated up to 34 times down a page is the
  thing to avoid; one line in the `incoming` section that also speaks for the term and
  claim ones is the proposal. Needs one new locale string either way.
- **A brand logo asset** for `Organization.logo` — the OG thumbnail is a 1200×630
  social card, not a logo.
- **Whether `teaches` stays alongside `about`** for the terms a node introduces —
  §7.1 of the JSON-LD design has the argument for keeping both.

## 10. Phases

Each ends with a commit and a review gate. Phase 2–3 are the first half, 4–6 the
second, and phase 1 is neither: either group can ship without the other, and the
`robots.txt` line can ship without any of them.

| # | phase | why here |
|---|---|---|
| 0 | Confirm the payload mechanism | one throwaway build with the wrapper in place, measuring markup and payload on `gyuru-test`. If a `ReactNode` prop does *not* survive into the payload unrendered, option A is dead and §4.1 B is the plan. Nothing is committed. |
| 1 | `Disallow: /*.txt` | D9. One line, one commit, independent of everything else here. |
| 1a | KaTeX emits MathML | D11. One word in `lib/utils/math.ts`, every page on the site, decided on accessibility grounds. Independent of both halves, and first because the e2e suite has to run against it before anything else moves. |
| 2 | Defer the three inbound panels | `DeferredPanelContent`, the `Panel` wiring, the no-JavaScript line and the `noJsCss` adjustment, and the doc comments that claim the rows are in the served HTML. |
| 3 | Tests, the markup gate, and the living doc | invert the no-JavaScript assertions, keep the rest, add the postbuild gate, record the byte measurement, and give `content-site-and-static-generation.md` its paragraph. |
| 4 | The structured-data builder and the entity pages | `lib/content/structured-data.ts` plus the four entity branches, with unit tests over the fixture graph. |
| 5 | The list pages and the site nodes | the four list kinds, and `Organization` + `WebSite` on the locale root. |
| 5a | `llms.txt` | the generator, the prebuild wiring, and the `Allow` line in `robots.ts` — D10 and D9. Independent of the JSON-LD; sequenced here only because it wants the counts the graph already gives phase 5. |
| 6 | The JSON-LD gate, the validators, and the living doc | the postbuild parse/id gate, the Rich Results Test and `validator.schema.org` by hand on staging, and the second paragraph in the living doc. |
| 7 | Close out | measurements back into §2, and any follow-up written down where it belongs — option B of §4.1, and the JSON-LD design's own §10 list. |

## 11. Out of scope

- **Structured data on chapter, book, article, and newsletter pages.** Worth doing,
  and a natural follow-up once the builder exists — but the ask is the knowledge base,
  and `Book`/`Chapter` typing for the narrative is its own design.
- **Option B of §4.1** — the compact data array. A byte optimization, revisited only
  if the payload measurement says it matters.
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
