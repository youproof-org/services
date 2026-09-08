# Knowledge-base structured data: the JSON-LD design

**Tickets:** YP-151, YP-172.
**Parent plan:** [inbound references out of the HTML, and JSON-LD in](yp-151-yp-172-kb-inbound-refs-and-jsonld-plan.md).
**Status:** **built**, in phases 4, 5, and 5a of the parent plan, on
`feat/yp-151-yp-172-kb-jsonld-and-inbound-refs`. `lib/content/structured-data.ts` is
the builder, `components/kb/StructuredData.tsx` renders it,
`test/structured-data.test.mjs` tests it over the fixture graph, and
`scripts/check-structured-data.mjs` gates the export. 542 blocks ship — 537 entity
pages, four list pages, and the locale root. **The one thing not done is half of the
manual vocabulary validation** (§8.1 of the parent plan): `validator.schema.org` has
been run by hand over the output and reported no errors and no warnings; Google's Rich
Results Test has not been run. §8 and §10 below say what changed between the design and
the build.
Written to be read by someone who has never used JSON-LD, so §§1–2 explain the format
before §§3–7 design ours.
**Every example below is real** — the names, URLs, ids, terms, and dates were taken
from the local export on 2026-09-07, not invented, and re-checked against the built
export on 2026-09-08.

---

## 1. What JSON-LD is, in five minutes

### 1.1 A block of JSON in the page that the browser never draws

```html
<script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "WebPage", "name": "A kis Fermat-tétel" }
</script>
```

That is the whole mechanism. A browser sees a `<script>` with a type it does not
execute, so it ignores it — nothing about the page's look, layout, or behaviour
changes. Google, Bing, and the AI crawlers read it on purpose. It's the same idea as
`<meta name="description">`, except it can describe *relationships between things*
instead of one string per page.

We add exactly one such block per knowledge-base page.

### 1.2 The four keys that start with `@`

Ordinary keys (`name`, `url`, `citation`) are vocabulary. The four with an `@` are
the machinery:

| key | what it does |
|---|---|
| `@context` | names the dictionary the other keys come from. Ours is always `"https://schema.org"`, which is the vocabulary Google, Bing, and Yandex jointly maintain. Without it, `name` is just a word; with it, `name` means schema.org's `name`. |
| `@type` | what kind of thing this is — `WebPage`, `CreativeWork`, `DefinedTerm`. Picked from the schema.org type list; you can give two (`["CreativeWork", "LearningResource"]`) when both are true. |
| `@id` | **the name of the thing being described**, as a URL. Not a link to follow — an identifier. This is the key that makes JSON-LD worth using; §1.3 is entirely about it. |
| `@graph` | "here are several things, not one". A page states more than one fact — what the page is, what it's about, where it sits — so our block is always a `@graph` array of objects. |

### 1.3 Why identifiers are URLs, and what that buys

Every object in a JSON-LD block describes *a thing*, and `@id` says which thing. Use
a URL as that id and two separate pages can talk about the same thing without
coordination.

Concretely, from our own content. The theorem page says:

```json
{ "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem",
  "@type": "CreativeWork",
  "name": "A kis Fermat-tétel" }
```

Its proof page — a different document, generated independently — says:

```json
{ "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1#proof",
  "@type": "CreativeWork",
  "isPartOf": { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem" } }
```

A machine that reads both now knows the proof belongs to that theorem, because both
documents used the same id for it. `{ "@id": "…" }` on its own means "the thing I
named, described elsewhere" — it is a *reference*, not a copy. That is the "LD" in
JSON-LD: **linked** data. Ids join across pages, across sites, and across
vocabularies.

This is also why our whole knowledge graph can be expressed without any page listing
what cites it: each page states its own outgoing edges against shared ids, and the
inbound direction is what you get by reading the other pages. Two pages naming
`…/kis-fermat-tetel#theorem` in `citation` *are* its inbound links.

### 1.4 A property is either a value or an edge

```json
"name": "A kis Fermat-tétel"                       ← a literal value
"citation": { "@id": "https://youproof.org/…" }    ← an edge to another thing
"citation": [ { "@id": "…" }, { "@id": "…" } ]     ← several edges
```

Nothing more to it. A design in JSON-LD is therefore two questions: which things do
we name, and which edges do we state between them.

### 1.5 Who reads it

- **AI crawlers and answer engines — the audience this is for.** The goal is being
  cited by them, and citation follows understanding. A model reading our HTML has to
  infer from Hungarian prose and CSS classes that "A kis Fermat-tétel" is a theorem,
  that the page under `/bizonyitasok/1` proves it, and that the page defines no terms
  of its own but leans on four other definitions. JSON-LD states all of that in a form
  that needs no inference and no Hungarian. §1.7 turns this into the test every
  property in this document has to pass.
- **Google** — secondary here. Of what we emit, `BreadcrumbList` is the only piece with
  a visible payoff: the breadcrumb trail under a search result comes from it rather
  than from the URL. Everything else is understanding, not decoration, and no design
  choice below is made for a rich result.
- **Validators** — `validator.schema.org` and Google's Rich Results Test, which is
  how we check the block is not quietly malformed. A checking tool, not an audience.

### 1.6 What it is not

- Not a ranking factor on its own, and not a substitute for the page's content.
- Not a place to put anything that contradicts the page — a mismatch between JSON-LD
  and visible content is a manual-action risk. Everything we emit is derived from the
  same graph the page renders from, so the two cannot disagree.
- Not validated by the browser. A trailing comma or a bad type silently produces
  nothing. Hence the gate in §9.

### 1.7 The test this design applies

The audience that matters most here is not Google's rich results — it is the AI
crawlers and answer engines, and the goal is being cited by them. That gives one test
for every candidate property, applied throughout §§3–7:

> **Does an HTML-to-text conversion of the page lose it?**

Because that is what most AI pipelines do first. If the extracted text already carries
a fact, stating it again in JSON-LD adds bytes and no understanding. If extraction
destroys it, JSON-LD is the only place it survives.

Measured on `kis-fermat-tetel`'s article markup, a naive tag-strip yields:

```
22.1. Tétel A kis Fermat-tétel Legyen p > 0 egy tetszőleges pozitív prímszám, továbbá
a egy tetszőleges egész szám, amely relatív prím p-hez. Ekkor teljesül az alábbi
kongruencia: a p − 1 ≡ 1 ( mod p ) … ♣ ↓ Alárendelt lap: Bizonyítás
```

So extraction on these pages is **good, not garbage** — better than assumed before it
was measured. What it keeps: the prose, the titles, the link text, the ownership
labels. What it loses:

| lost in extraction | so it belongs in JSON-LD |
|---|---|
| that this is a *theorem* rather than a definition — the page says "Tétel", which needs Hungarian to read | `additionalType`, a language-independent URI |
| *which* thing a reference points at — the link text is the term, not its identity | `citation` against the target's own `@id` |
| that two names are one term rather than two competing pages | `alternateName` on a `DefinedTerm` |
| that all 217 term names form one vocabulary | `inDefinedTermSet` |
| when the content was published and last edited | `datePublished`, `dateModified` |
| **superscript structure**: `a^{p-1}` flattens to `a p − 1`, which reads equally as *a·p−1* | **not this document.** The markup will carry it, once KaTeX emits MathML — D11 of the parent plan. See §7.7 for why the content does not come in here |

And what extraction keeps is exactly what this design declines to restate: the index
lists (§5.6), the titles, and the visible ownership links.

---

## 2. Our block, built up in four steps

Real page: `/hu/tudasbazis/tetelek/kis-fermat-tetel` — the theorem "A kis
Fermat-tétel", which has one proof, one remark, no terms of its own, and five
outgoing references. It is introduced in the chapter "Kínai maradéktétel, kis Fermat-tétel, az
RSA bizonyítása" of the book "Kriptográfia, rejtjelezés".

### Step 1 — the page exists, and here is its name

```json
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel",
  "url": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel",
  "name": "A kis Fermat-tétel",
  "description": "Legyen egy tetszőleges pozitív prímszám, továbbá a egy tetszőleges egész szám…",
  "inLanguage": "hu"
}
```

Nothing here is new information — `<title>`, `<meta name="description">`, and
`<link rel="canonical">` already say it. Worth having anyway, because the next three
steps hang off it.

### Step 2 — the page is *about* something, and that something is a theorem

A web page and the thing it documents are two different things. Google's own guidance
treats them that way, and it matters for us: the *proof page* is a page, but the
*proof* is a mathematical object that also appears as a part of a theorem described
on another page. So we name both, and link them with `mainEntity`:

```json
"@graph": [
  {
    "@type": "WebPage",
    "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel",
    "mainEntity": { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem" }
  },
  {
    "@type": "CreativeWork",
    "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem",
    "additionalType": "http://www.wikidata.org/entity/Q65943",
    "name": "A kis Fermat-tétel",
    "inLanguage": "hu"
  }
]
```

`#theorem` is a fragment on the page's URL — a perfectly good id for "the theorem
this page is about", and one no other page can collide with.

`additionalType` is how we say "theorem" when schema.org has no such type. It takes a
URL that identifies a type in some other vocabulary, and Wikidata is the usual
choice: `Q65943` is Wikidata's entry for *theorem*, "in mathematics, a statement that
has been proved". §6 has all four, verified.

### Step 3 — where the page sits

Two independent placements, both real edges:

```json
{
  "@type": "CreativeWork",
  "@id": "…/kis-fermat-tetel#theorem",
  "isPartOf": { "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak" },
  "datePublished": "2020-05-14T22:00:00Z",
  "dateModified": "2026-08-26T14:24:56+02:00"
},
{
  "@type": "Chapter",
  "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak",
  "name": "Kínai maradéktétel, kis Fermat-tétel, az RSA bizonyítása",
  "isPartOf": { "@id": "https://youproof.org/hu/konyvek/alice-es-bob" }
},
{
  "@type": "Book",
  "@id": "https://youproof.org/hu/konyvek/alice-es-bob",
  "name": "Kriptográfia, rejtjelezés - A titkolózás tudománya"
}
```

`Chapter` and `Book` are real schema.org types, so the narrative chain is stated in
the vocabulary's own terms. Those two nodes are three lines each and give any crawler
the book → chapter → entity chain **from a single page**, without following a link.

And the navigational placement, which is the one with a visible search-result payoff:

```json
{
  "@type": "BreadcrumbList",
  "@id": "…/kis-fermat-tetel#breadcrumb",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Főoldal",    "item": "https://youproof.org/hu" },
    { "@type": "ListItem", "position": 2, "name": "Tudásbázis", "item": "https://youproof.org/hu/tudasbazis" },
    { "@type": "ListItem", "position": 3, "name": "Tételek",    "item": "https://youproof.org/hu/tudasbazis/tetelek" },
    { "@type": "ListItem", "position": 4, "name": "A kis Fermat-tétel" }
  ]
}
```

Those four items are exactly what `kbEntityBreadcrumbs` already builds for the
visible breadcrumb row, so the two cannot drift. The last item carries no `item`
because it is the current page — that is Google's documented convention.

### Step 4 — the edges of the knowledge graph

```json
{
  "@type": "CreativeWork",
  "@id": "…/kis-fermat-tetel#theorem",

  "hasPart": [
    { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1#proof" },
    { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/megjegyzesek/1#remark" }
  ],

  "citation": [
    { "@id": "https://youproof.org/hu/tudasbazis/definiciok/egesz-szamok-halmaza#fogalmak.egesz-szam" },
    { "@id": "https://youproof.org/hu/tudasbazis/definiciok/pozitiv-es-negativ-egesz-szamok#fogalmak.pozitiv-egesz-szam" },
    { "@id": "https://youproof.org/hu/tudasbazis/definiciok/primtulajdonsagu-elem#fogalmak.primtulajdonsagu-elem" },
    { "@id": "https://youproof.org/hu/tudasbazis/definiciok/relativ-primek#fogalmak.relativ-prim" },
    { "@id": "https://youproof.org/hu/tudasbazis/tetelek/egesz-szamok-kozotti-kongruencia#fogalmak.egesz-szamok-kozotti-kongruencia" }
  ]
}
```

Those five `citation` entries are the theorem's five outgoing references, deduplicated
— the page's prose links to `relativ-prim` and `egesz-szam` twice each, and one edge
is one edge.

Note what the ids are: **not** the target pages, but the exact anchors the prose links
to, which is where those pages declare their `DefinedTerm` nodes (§5.3). So
"A kis Fermat-tétel cites the term *relatív prím*, defined at
`/definiciok/relativ-primek#fogalmak.relativ-prim`" is stated once, by us, and joins
up with what that page says about itself. Do this on all 537 pages and the whole
knowledge graph is machine-readable, in both directions, with **no page listing its
inbound references** — which is what makes the parent plan's first half safe.

That is the entire design. §5 is the same four steps applied to each page kind.

---

## 3. The vocabulary we use, key by key

| key | means | our value |
|---|---|---|
| `@type: WebPage` | a page | every knowledge-base page |
| `@type: CollectionPage` | a page that lists things | the root, the two indexes, the glossary |
| `@type: CreativeWork` | a work — text, a document, an intellectual object | the definition, theorem, proof, or remark itself |
| `@type: Chapter`, `Book` | exactly what they say | the embedding chapter and its book, as three-line stubs |
| `@type: DefinedTerm` | a term in a controlled vocabulary | each term a node introduces |
| `@type: DefinedTermSet` | the vocabulary the terms belong to | the glossary, once |
| `@type: BreadcrumbList`, `ListItem` | an ordered trail | the breadcrumb row |
| `@type: Organization`, `WebSite` | the publisher, and the site | home page only |
| `additionalType` | "and it is also this kind of thing, per this other vocabulary" | the Wikidata URI for theorem / proof / mathematical definition (§6) |
| `mainEntity` | "this page is primarily about that thing" | page → entity |
| `isPartOf` | containment, upwards | proof → theorem; remark → owner; entity → chapter; chapter → book; every page → the site |
| `hasPart` | containment, downwards | theorem → its proofs and remarks; definition → its remarks |
| `citation` | "this work cites that work" | every outgoing reference in the prose, deduplicated — 3520 edges across the export, 3515 of them to our own anchors and 5 to the off-site sources of §5.4 |
| `about` | "this work is about that thing" | the terms the node introduces |
| `teaches` | "this work helps you learn that concept" | the same terms — see §7.1 for why both |
| `inDefinedTermSet` | which vocabulary a term belongs to | the glossary's id |
| `alternateName` | other names for the same thing | a term's synonyms |
| `name`, `description`, `url` | the obvious | the derived title, `kbExcerpt`, the canonical URL |
| `inLanguage` | BCP-47 language tag | `"hu"` |
| `datePublished` | first published | the embedding chapter's `published-at` |
| `dateModified` | last edited | the node's entry in `.generated/content-lastmod.json` |
| `breadcrumb` | page → its trail | by id |
| `publisher` | who publishes | the `Organization` node, by id |

Twenty-two keys, all of them standard, none of them invented.

---

## 4. The `@id` scheme

One rule: **an `@id` is the page's canonical absolute URL, plus a fragment when the
thing is not the page itself.**

| thing | `@id` |
|---|---|
| the page | `https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel` |
| the definition / theorem / proof / remark | same, `+ #definition` / `#theorem` / `#proof` / `#remark` |
| a term | same, `+ #` its own anchor id — `#fogalmak.oszto`, the id the markup already uses |
| the breadcrumb trail | same, `+ #breadcrumb` |
| the glossary as a vocabulary | `https://youproof.org/hu/tudasbazis/fogalmak#glossary` |
| the site | `https://youproof.org/#website` |
| the publisher | `https://youproof.org/#organization` |
| a chapter, a book | their own canonical page URLs, no fragment |

Two consequences worth stating. **A term's id is a URL that actually resolves** to the
place the term is defined, fragment included, because it is the anchor the glossary
already links to. And **every id is built by the existing URL helpers** — nothing in
the structured data concatenates a path, for the same reason nothing else in the
codebase does.

---

## 5. Worked examples, complete

### 5.1 A theorem — `/hu/tudasbazis/tetelek/kis-fermat-tetel`

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel",
      "url": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel",
      "name": "A kis Fermat-tétel",
      "description": "Legyen egy tetszőleges pozitív prímszám, továbbá a egy tetszőleges egész szám…",
      "inLanguage": "hu",
      "isPartOf": { "@id": "https://youproof.org/#website" },
      "breadcrumb": { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#breadcrumb" },
      "mainEntity": { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem" }
    },
    {
      "@type": "CreativeWork",
      "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem",
      "additionalType": "http://www.wikidata.org/entity/Q65943",
      "name": "A kis Fermat-tétel",
      "inLanguage": "hu",
      "datePublished": "2020-05-14T22:00:00Z",
      "dateModified": "2026-08-26T14:24:56+02:00",
      "isPartOf": { "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak" },
      "hasPart": [
        { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1#proof" },
        { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/megjegyzesek/1#remark" }
      ],
      "citation": [
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/egesz-szamok-halmaza#fogalmak.egesz-szam" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/pozitiv-es-negativ-egesz-szamok#fogalmak.pozitiv-egesz-szam" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/primtulajdonsagu-elem#fogalmak.primtulajdonsagu-elem" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/relativ-primek#fogalmak.relativ-prim" },
        { "@id": "https://youproof.org/hu/tudasbazis/tetelek/egesz-szamok-kozotti-kongruencia#fogalmak.egesz-szamok-kozotti-kongruencia" }
      ]
    },
    {
      "@type": "Chapter",
      "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak",
      "name": "Kínai maradéktétel, kis Fermat-tétel, az RSA bizonyítása",
      "isPartOf": { "@id": "https://youproof.org/hu/konyvek/alice-es-bob" }
    },
    {
      "@type": "Book",
      "@id": "https://youproof.org/hu/konyvek/alice-es-bob",
      "name": "Kriptográfia, rejtjelezés - A titkolózás tudománya"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Főoldal", "item": "https://youproof.org/hu" },
        { "@type": "ListItem", "position": 2, "name": "Tudásbázis", "item": "https://youproof.org/hu/tudasbazis" },
        { "@type": "ListItem", "position": 3, "name": "Tételek", "item": "https://youproof.org/hu/tudasbazis/tetelek" },
        { "@type": "ListItem", "position": 4, "name": "A kis Fermat-tétel" }
      ]
    }
  ]
}
```

**2649 B of JSON as built**, 2693 B with its `<script>` wrapper — all of it structure,
none of it content. The "about 2.2 KiB" this line first carried understated even the
block printed above, which minifies to 2583 B; the shipped one is larger still because
its `description` is the whole sentence rather than the truncated one printed here. The
page it sits on now serves 25641 B of markup and no inbound-reference rows at all,
against 30280 B of markup and a 9671 B `incoming` section before the parent plan's
first half.

Across the export the 542 blocks total 1748678 B of markup, and — counted the same
way, wrapper included — an entity page's block runs from 1881 B to 8567 B with a median
of 3034 B.

**No body text, and no formulas.** An earlier draft carried the statement here as a
`text` property; §7.7 records why that is gone and where the mathematics went instead.

### 5.2 A proof — `/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1`

Same shape; three differences, all of them structural:

```json
{
  "@type": "CreativeWork",
  "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel/bizonyitasok/1#proof",
  "additionalType": "http://www.wikidata.org/entity/Q11538",
  "name": "Bizonyítás: A kis Fermat-tétel",
  "isPartOf": [
    { "@id": "https://youproof.org/hu/tudasbazis/tetelek/kis-fermat-tetel#theorem" },
    { "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-bob-es-a-kinaiak" }
  ],
  "citation": [ "…" ]
}
```

1. `additionalType` is Wikidata's *mathematical proof*.
2. `isPartOf` is an array: the proof belongs to its theorem **and** sits in the
   chapter. Both are true, and `isPartOf` takes many values.
3. `name` is the derived title (`kbNodeTitle`), because 262 of the 537 nodes have no
   authored title of their own and `#proof` still needs naming.

Its `hasPart` lists its own remarks, when it has any.

### 5.3 A definition with terms — `/hu/tudasbazis/definiciok/oszthatosag`

This is where `DefinedTerm` earns its place. The definition introduces four terms,
one of which has a synonym:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag",
      "name": "Oszthatóság",
      "mainEntity": { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#definition" },
      "breadcrumb": { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#breadcrumb" },
      "isPartOf": { "@id": "https://youproof.org/#website" },
      "inLanguage": "hu"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#definition",
      "additionalType": "http://www.wikidata.org/entity/Q114425676",
      "name": "Oszthatóság",
      "inLanguage": "hu",
      "datePublished": "2019-12-29T12:42:01Z",
      "dateModified": "2026-08-26T14:24:56+02:00",
      "isPartOf": { "@id": "https://youproof.org/hu/konyvek/alice-es-bob/fejezetek/alice-es-bob-alaptetele" },
      "about": [
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszto" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthato" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.tobbszoros" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthatosagi-relacio" }
      ],
      "teaches": [
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszto" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthato" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.tobbszoros" },
        { "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthatosagi-relacio" }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszto",
      "name": "osztó",
      "url": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszto",
      "inDefinedTermSet": { "@id": "https://youproof.org/hu/tudasbazis/fogalmak#glossary" }
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthatosagi-relacio",
      "name": "oszthatósági reláció",
      "alternateName": ["oszthatóság"],
      "url": "https://youproof.org/hu/tudasbazis/definiciok/oszthatosag#fogalmak.oszthatosagi-relacio",
      "inDefinedTermSet": { "@id": "https://youproof.org/hu/tudasbazis/fogalmak#glossary" }
    }
    // … `oszthato` and `tobbszoros`, same shape; plus Chapter, Book, BreadcrumbList
  ]
}
```

Three things this makes machine-readable that the HTML only implies:

- **which URL is the definitional home of a term.** Today a crawler has to infer it
  from the glossary's link target.
- **that "oszthatóság" and "oszthatósági reláció" are one term**, via `alternateName`,
  rather than two pages competing for the same query.
- **that all 217 canonical terms belong to one vocabulary**, via `inDefinedTermSet`
  pointing at the glossary's id from every page that introduces a term.

### 5.4 A remark, and the citations that leave the site

The same, minus `additionalType` — Wikidata has no entry for a mathematical remark
worth pointing at, and inventing one is worse than omitting the key. `isPartOf` names
its owner, which for a remark on a proof is the proof.

**Remarks are also where the content cites the outside world, which this design did
not anticipate.** §2's step 4 says a `citation` id is "the exact anchor the prose links
to", and every worked example takes that anchor to be one of ours. It is not always.
Four external addresses are cited from the prose, all four from remark pages, and the
builder emits them as `citation` like any other outgoing reference:

| page | cited |
|---|---|
| `definiciok/egyseg/megjegyzesek/1` | `https://en.wikipedia.org/wiki/Gaussian_integer` |
| `tetelek/asszocialtsag-tulajdonsagai/megjegyzesek/1` | the same Wikipedia article |
| `tetelek/kis-fermat-tetel/megjegyzesek/1` | `https://hu.wikipedia.org/wiki/Leonhard_Euler` and `https://oeis.org/A001567` |
| `tetelek/termeszetes-szamok-minimumtetele/megjegyzesek/1` | `https://hu.wikipedia.org/wiki/Pierre_de_Fermat` |

That is five `citation` entries over four distinct URLs, out of 3520 edges in the
export. Emitting them is right rather than merely harmless: `citation` means "this work
cites that work", and a Wikipedia article is a work. It is also the one direction in
which our graph joins the rest of the web by an id somebody else already owns, which is
the whole argument of §1.3 arriving from the other side.

The consequence for §9 is that an id check cannot simply require every address to be in
the export. Off-origin addresses are counted and skipped; §9 says so, and the gate
prints the count so that a fifth one appearing is a thing somebody sees.

### 5.5 The glossary — `/hu/tudasbazis/fogalmak`

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": "https://youproof.org/hu/tudasbazis/fogalmak",
      "name": "Fogalmak",
      "inLanguage": "hu",
      "isPartOf": { "@id": "https://youproof.org/#website" },
      "breadcrumb": { "@id": "https://youproof.org/hu/tudasbazis/fogalmak#breadcrumb" },
      "mainEntity": { "@id": "https://youproof.org/hu/tudasbazis/fogalmak#glossary" }
    },
    {
      "@type": "DefinedTermSet",
      "@id": "https://youproof.org/hu/tudasbazis/fogalmak#glossary",
      "name": "Fogalmak",
      "url": "https://youproof.org/hu/tudasbazis/fogalmak",
      "inLanguage": "hu"
    }
    // + BreadcrumbList
  ]
}
```

**No `hasDefinedTerm` list.** The set has 341 rows over 217 canonical terms, which
would be roughly 30 KiB of JSON on a 106 KiB page — and every one of those terms
already names this set from its own page. The membership is stated once, from the
side that has one statement to make instead of 341.

### 5.6 The root and the two index pages

The root is `CollectionPage` + `BreadcrumbList` and nothing else — it carries three
cards, not a list of entities.

The two index pages **are** lists, and that is their subject, so the list gets named:

```json
{
  "@type": "CollectionPage",
  "@id": "https://youproof.org/hu/tudasbazis/tetelek",
  "name": "Tételek",
  "inLanguage": "hu",
  "isPartOf": { "@id": "https://youproof.org/#website" },
  "breadcrumb": { "@id": "https://youproof.org/hu/tudasbazis/tetelek#breadcrumb" },
  "mainEntity": { "@id": "https://youproof.org/hu/tudasbazis/tetelek#list" }
},
{
  "@type": "ItemList",
  "@id": "https://youproof.org/hu/tudasbazis/tetelek#list",
  "name": "Tételek",
  "numberOfItems": 191,
  "itemListOrder": "https://schema.org/ItemListOrderAscending"
}
```

**The members are not enumerated**, and the reason is not byte count — it is that
enumerating them would be the one thing we emit that reveals nothing:

1. **Class membership is already stated, 191 times, by the pages themselves.** Each
   theorem's own block carries `additionalType` = Wikidata's *theorem*. "Which of these
   URLs are theorems" is answered by the theorems, and the index is a browsing surface
   over that class rather than what defines it. An `itemListElement` array would be a
   third statement of it.
2. **The markup already says it explicitly**, not by implication: 191 named links in
   document order inside one list. Everywhere else in this design, JSON-LD states
   something the HTML only implies — that a work is a theorem, that one page proves
   another, that two names are one term. This would be the exception, and the exception
   is what makes an `ItemList` of members decoration here.
3. **It fails the §1.7 test, on the audience that matters.** The point of this work is
   AI citation, not Google decoration — so the question is what a crawler's text
   extraction loses, and a list of named links is the thing it loses least. A
   text-extracting crawler already receives 191 titles with their URLs; a
   JSON-LD-parsing one finds the same list as anchors in the same document. Either way
   the `itemListElement` array is the second copy.

   The Google answer points the same way rather than differently: a carousel needs
   `ItemList` combined with Course, Movie, Recipe, or Restaurant markup (checked
   2026-09-07), so a `CreativeWork` list is ignored there too. It is a footnote to the
   reasoning, not the basis of it.

4. **And the hub page is not the citation target.** A question like "what is the kis
   Fermat-tétel" is answered by the entity page, which has the statement, the proof
   link, and its own block. The index page is 191 links and a filter; it earns
   citations as "youproof.org indexes 191 theorems", which `numberOfItems` states in
   one line.

And it is not free: measured on the export, a `ListItem` array with names and URLs is
**34.5 KiB on the theorems index — +51% of its 67.5 KiB of markup** — and 15 KiB on the
definitions index, +49% of its 30.8 KiB. Both figures double once the RSC payload
carries its copy.

The `numberOfItems` line, by contrast, costs about 150 bytes and states the one fact
the markup makes a reader count.

**If we want the enumeration anyway**, the measured options are `url`-only `ListItem`s
at 24.8 KiB, `{"@id": …}` references into each entity's own node at 28.2 KiB, or
name-and-URL at 34.5 KiB. I would take the `@id` form, because it joins to what those
pages already say about themselves. But if the goal behind the question is *"one fetch
should give a machine the whole knowledge base"*, then 275 `ListItem`s split across two
pages is the wrong shape for it — that is the single whole-graph file in §10, and it
would carry the relations too.

### 5.7 The home page — who publishes all this

Once, on `/hu` (and the locale root only):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://youproof.org/#organization",
      "name": "youproof.org",
      "url": "https://youproof.org",
      "logo": "https://youproof.org/assets/generated/og-thumbnail.jpg"
    },
    {
      "@type": "WebSite",
      "@id": "https://youproof.org/#website",
      "name": "youproof.org",
      "url": "https://youproof.org",
      "inLanguage": "hu",
      "publisher": { "@id": "https://youproof.org/#organization" }
    }
  ]
}
```

Every other page's `isPartOf: { "@id": "https://youproof.org/#website" }` points here.
The logo needs a real square-ish brand asset rather than the OG thumbnail — flagged
in §10, not guessed at here.

---

## 6. The type mapping, and the Wikidata URIs

Verified against the Wikidata search API on 2026-09-07; each label and description is
quoted from the entity itself.

| node | `@type` | `additionalType` | Wikidata label and description |
|---|---|---|---|
| theorem | `CreativeWork` | `http://www.wikidata.org/entity/Q65943` | *theorem* — "in mathematics, a statement that has been proved" |
| proof | `CreativeWork` | `http://www.wikidata.org/entity/Q11538` | *mathematical proof* — "rigorous demonstration that a mathematical statement follows from its premises" |
| definition | `CreativeWork` | `http://www.wikidata.org/entity/Q114425676` | *mathematical definition* — "precise mathematical text which describes uniquely a mathematical term or concept" |
| remark | `CreativeWork` | — | no suitable entity; the key is omitted |

**Why the `entity/` form and not `wiki/`.** `http://www.wikidata.org/entity/Q65943` is
Wikidata's own identifier for the concept — the URI its RDF uses. `https://www.wikidata.org/wiki/Q65943`
is the *web page about* that concept. Both are seen in the wild; the identifier is the
correct thing to put in `additionalType`, and it stays `http://` because that is the
scheme Wikidata minted its identifiers with. One constant per kind, in one file, so
this is a one-line change if we ever disagree.

**Why not `Article` or `ScholarlyArticle`.** Both would make these pages candidates for
Google's Article rich result, which requires a headline, an image, a date, and an
author. We have no author in the content model and no per-entity image. The result
would be several hundred Search Console warnings for a rich result we never wanted.
`CreativeWork` carries no such expectations, and every property we use is available on
it.

---

## 7. What we leave out, and why

### 7.1 Not left out: `about` and `teaches` both — **settled, both ship**

`about` is the widely understood way to say "this work concerns that thing".
`teaches` is more precise — schema.org defines it as "the item being described is
intended to help a person learn the competency or learning outcome defined by the
referenced term", it expects a `DefinedTerm`, and it is valid directly on
`CreativeWork` (checked on schema.org, 2026-09-07). For a definition page, both
statements are true, and the pair costs about 60 bytes per term. If one has to go,
drop `teaches` — it is the less commonly consumed of the two.

**Decided: both.** Nothing in the build argued against it, and the change if that ever
reverses is one entry in `TERM_PREDICATES` in `lib/content/structured-data.ts`, which
is a list for exactly this reason.

### 7.2 Inbound references

Omitted, and this is the decision that makes the parent plan coherent: an inbound list
is the transpose of other pages' `citation` edges, and `gyuru-test` would otherwise
carry 236 of them. Stating them would put back in JSON exactly what phase 2 takes out
of the markup.

### 7.3 Claims

`schema.org/Claim` exists but was built for fact-checking — a claim someone reviewed
for truth. A mathematical claim inside a theorem is not that, and typing it so would
be a misstatement, not a simplification. Omitted; the claims stay what they are in the
markup, numbered and anchored.

### 7.4 Member lists

No `hasDefinedTerm` on the glossary set, and no `itemListElement` on the indexes —
both sets are named and counted rather than enumerated. §5.5 and §5.6.

### 7.5 `author` and `Person`

The content model has no author field. Nothing here invents one.

### 7.6 `sameAs` to Wikidata for individual theorems

"A kis Fermat-tétel" *is* Wikidata's Q160016-or-similar, and saying so would be
genuinely valuable — it would tie our page to the concept every other source uses.
But that mapping does not exist in the content and cannot be derived. A follow-up that
starts with authoring it, not a thing to guess per node.

---

### 7.7 The body text, and the mathematics in it

An earlier draft of this document carried each node's whole body here as a `text`
property, with the formulas left in LaTeX, to fix the one thing §1.7 says extraction
destroys. It is gone, for two reasons.

**The division of labour.** Markup carries content; structured data describes it.
Crawlers read the page for the content and the block for the relations, so a proof's
body inside a `<script>` tag is content filed where nobody looks for it.

**And the measurements.** The LaTeX source across the corpus is 141 KiB; the whole-body
text is 756 KiB. So 81% of what that property cost would have been prose the extractor
already reads perfectly — and 72% of the total landed on the 190 proof pages, whose
median body is 2050 B against a theorem's 321 B. Both figures are of a `text` property
that was never built, so neither can be re-measured; what *can* be, on the finished
export, is the LaTeX that shipped instead — **311 KiB of `<annotation>` text across all
588 pages, 123 KiB of it on knowledge-base pages**. Read the 141 KiB as
knowledge-base-scoped and of the right order, not as a figure this export can confirm.

The mathematics is fixed where it broke instead: `output: 'htmlAndMathml'` in
`lib/utils/math.ts`, so each formula ships its authored LaTeX in an
`<annotation encoding="application/x-tex">` that a plain tag-strip can read. D11 and
§5.3 of the parent plan have the pricing, the accessibility argument that actually
justifies it, and the two rejected alternatives.

What stays here is `description` — `kbExcerpt`, one math-stripped sentence, the same
string `<meta name="description">` gets. A sentence about the work is description; the
work is not.

## 8. Settled decisions

From the review on 2026-09-07 (numbers refer to the parent plan's open questions).
**All of them shipped as decided**; the "as built" column is what the export shows.

| | decision | as built |
|---|---|---|
| 1 | `CreativeWork` + `additionalType`. **Settled.** | 537 `CreativeWork` nodes |
| 2 | Wikidata concept URIs, verified per §6. **Settled.** | `http://www.wikidata.org/entity/…` on theorems, proofs, and definitions; nothing on remarks |
| 3 | Claims omitted. **Settled.** | no `Claim` node in the export |
| 4 | Inbound edges omitted. **Settled.** | gated: every `citation` target must be an address the page's own markup already links |
| 5 | The index lists are named and counted; their members are not enumerated. **Settled**, with the reasoning corrected in §5.6 on 2026-09-07. | 2 `ItemList` nodes with `numberOfItems` and no `itemListElement`; one `DefinedTermSet` with no `hasDefinedTerm` |
| 9 | `datePublished` from the embedding chapter. **Settled.** | via `lib/content/lastmod.ts`, which both this builder and `app/sitemap.ts` read with one keying |

Also settled, in the parent plan's decision log because they reach beyond this
document: **D10** one curated generated `llms.txt`, and **D11** the mathematics carried by the
markup, via `output: 'htmlAndMathml'`, rather than by a `text` property here — §7.7.
D11 shipped and **cost 2.8× what it was priced at**: +8.74 MiB of markup rather than
+3.16 MiB. §5.3 of the parent plan carries the corrected numbers; the decision is
unchanged, because it was made on accessibility grounds and not on bytes.

### 8.1 What the build changed about this design

Three things, none of them a reversal.

**The `@id` check is one requirement, not two.** §9 used to state it as "either exists
in the export **or** is a fragment on the page that declares it". The `or` cannot be
implemented: read literally it adds nothing, and read loosely it exempts every
`#theorem` and `#breadcrumb` from the base check. That is not hypothetical — it is what
the first draft of the gate did in phase 6, and an `@id` with no file behind it went
past it. §9 below now states the implemented form.

**Off-site citations exist.** Four external URLs, five edges, all from remark pages.
§5.4 has them. No worked example in §5 anticipated one.

**The `@id` scheme survives contact with the export unchanged otherwise.** 12952
addresses on our own origin, every one of them resolving to a file the export contains,
and no id declared twice on a page.

---

## 9. How it gets checked

A malformed block produces nothing and says nothing, so it needs a gate rather than a
glance. All three exist; the third is the one still outstanding.

- **Unit tests** over the fixture graph: the shape per page kind, the `@id`s, and the
  relations — a proof's `isPartOf` is its theorem, a theorem's `hasPart` are its
  proofs and remarks, a term's `inDefinedTermSet` is the glossary.
  `test/structured-data.test.mjs`, inside the suite's 280.
- **A postbuild gate** (`scripts/check-structured-data.mjs`), in the shape
  `check-anchors.mjs` already has, reading the built export rather than the graph:
  exactly one `application/ld+json` per knowledge-base page, `JSON.parse` succeeds,
  every `@type` is one this design uses, every `@id` is *declared* once within its page
  — a bare `{ "@id": … }` is a reference and may repeat — and **every absolute URL in an
  `@id`, `item`, `citation`, `url` or `logo`, with its fragment stripped, is a file the
  export contains.** Off-origin URLs are counted and skipped (§5.4); nothing else is
  exempt. That last one is the check that catches an id scheme drifting from the URL
  helpers. It reports 542 blocks, 12736 nodes, 12952 resolved addresses, and 5 off-site
  references.

  **One requirement, not two.** This rule used to read "…exists in the export **or** is
  a fragment on the page that declares it". Read literally the alternative is vacuous —
  the page being read is in the export by definition. Read loosely it exempts every
  `#theorem`, `#proof` and `#breadcrumb` id from the base check, which is precisely the
  drift the rule exists to catch — and the draft of this gate that read it loosely did
  let a non-resolving id through. Nothing needed the escape in the end:
  `https://<host>/#website` is declared
  on the locale root, and its base `/` is in the export as the `noindex` stub.

- **The fragments themselves are checked elsewhere.** `check-anchors.mjs` is what
  proves a `#fogalmak.oszto` id is really on the page it names, and the parent plan's
  first half moved 3898 of those links out of the markup — so that gate now reads hrefs
  from the RSC payload as well, and covers 44808 fragment links, 20455 in the markup and
  24353 in the payload. The two gates divide the work: this one checks that the address
  exists, that one that the anchor does.

- **By hand, once per page kind, on staging:** Google's Rich Results Test (expect the
  breadcrumb to be detected and nothing to be in error) and `validator.schema.org`
  (expect no warnings we did not choose). **`validator.schema.org` is done: no errors
  and no warnings, so nothing in §7's list of deliberate omissions drew a complaint.
  The Rich Results Test is not done** — §8.1 of the parent plan is the checklist, and
  that half is the one unfinished item of this work.

---

## 10. Follow-ups

Checked against the build on 2026-09-08. Everything below is still accurate and still
open; §10.2 gained two entries the build turned up, and one entry gained a real number.

### 10.1 The whole graph as one file — designed, not scheduled

The question this answers: *if one generated file could hold the entire knowledge
graph, would the per-page blocks still be needed?* **Yes — they do different jobs, and
the per-page ones are the ones that cannot be replaced.**

**Why they are not substitutes.** Retrieval and citation happen per page. When an
answer engine answers "mi a kis Fermat-tétel", it has retrieved a chunk of *one* page
and cites *that* URL, and the JSON-LD in that page travels with the chunk. A separate
graph file is a different document: it is in the model's context only if that document
was fetched, which happens at most once at index time and never at answer time. So the
per-page block is context attached to the thing being cited, at the moment of citing;
the graph file is a map for whoever is building a model of the site.

Three further asymmetries, all pointing the same way:

- **Known consumers.** Per-page JSON-LD has them — Google certainly, and any crawler
  that parses in-page structured data. A custom graph file at a custom URL has no
  standard discovery mechanism and therefore no guaranteed reader. `llms.txt` and a
  `<link rel="alternate" type="application/ld+json">` are the best available pointers,
  and neither is a specification anyone is obliged to follow.
- **Discoverability by construction.** A page's block is found by fetching the page.
  Nothing has to know it exists.
- **Failure mode.** A per-page block that nobody reads costs a median 3034 B on that
  page — the estimate here was 2.4 KiB. A graph file that nobody reads costs a build
  step and a URL, and is invisible.

**What the file buys that per-page blocks cannot.** One shot at the *whole* structure:
all 537 entities, 217 terms, their types, and every edge between them, in a form a
model can reason over without 537 fetches. And inside a single document the inbound
direction comes free — "what cites the kis Fermat-tétel" is answerable by scanning the
edge set, so even here nothing has to be duplicated in reverse.

**How it would work.** Cheaply, because it is the same builder with a different
projection:

1. `lib/content/structured-data.ts` already knows how to describe one node — it now
   exists, which is what phase 4 was for. A generator walks `graph`, calls it for every
   entity, term, chapter, and book, and concatenates the results into one `@graph` —
   the same `@id`s, the same vocabulary, so a consumer that has read a page and then
   the file sees one graph rather than two. `scripts/gen-llms-txt.mjs` is the working
   example of a prebuild generator that imports the content graph through `tsx`, so the
   wiring question is answered too.
2. It is written by a prebuild script into `public/`, the way `gen-og-images.mjs` and
   the other generators work, so the static export ships it as an ordinary file. A
   route handler with `dynamic = 'force-static'` (the pattern `app/sitemap.ts` and
   `app/robots.ts` use) is the alternative.
3. Estimated size: roughly 400–600 KiB for the entity and term nodes with their edges —
   about half of one of today's biggest pages. The 542 per-page blocks total 1748678 B
   with their breadcrumbs, chapter stubs and book stubs repeated on every page, so an
   estimate at roughly a third of that, with each node stated once, looks about right.
4. Discovery: linked from `llms.txt`, and from `<link rel="alternate">` in the document
   head. Not in the sitemaps, which are for indexable pages.
5. **Then measure whether anything fetches it.** The path is served from R2 through
   Cloudflare, so requests to it are visible in the edge logs. That turns "do AI
   crawlers use this?" from a guess into a number, which is the honest reason to build
   it small first rather than perfect.

**Sequencing.** Per-page first — phases 4 to 6 of the parent plan — then this, once the
builder it reuses exists. Waiting makes it cheaper, not more expensive. **The
prerequisite is now met:** those phases shipped, so this is a generator over an
existing builder rather than a builder and a generator together.

### 10.2 Smaller ones

- **A brand logo asset for `Organization.logo`** — the OG thumbnail is a 1200×630
  social card (verified: `assets/generated/og-thumbnail.jpg` is exactly 1200×630), not
  a logo. **This is the last open question of the design** — §9.1 of the parent plan
  closed the other two.
- **`llms.txt` could point at more than the hubs.** It ships at 1502 B with 7 links
  over 3 sections and no pointer to any per-page structured data. If the whole-graph
  file of §10.1 is ever built, this is where it gets announced — which was the reason
  for building `llms.txt` first.
- **Structured data for chapters, books, articles, and newsletters.** The `Chapter` and
  `Book` stubs we emit from entity pages are the beginning of it; the narrative pages
  describing themselves properly is its own design. One concrete thing it would fix:
  the 28 chapter and book pages link **39 distinct external addresses** — all four of
  the sources the remarks of §5.4 cite, and 35 more — and, carrying no block, say
  nothing about any of them.
- **`sameAs` to Wikidata for named theorems and definitions** (§7.6).
- **`competencyRequired`** — schema.org's "knowledge or skills needed to use this
  resource", which expects a `DefinedTerm` and would express prerequisites exactly.
  Our outgoing references to definitions are close to that already; worth a look once
  the basics are live.
- **A clean `.md` sibling per page**, if the edge logs ever show crawlers fetching a
  lot and citing little. Declined for now — §11 of the parent plan has the reasoning.

### 10.3 The caveat to keep in mind

Some AI pipelines strip `<script>` elements before a model sees the text, so JSON-LD is
a strong extra channel rather than a guaranteed one. Nothing load-bearing should live
*only* there — and it is a second reason the parent plan's first half helps: less
boilerplate per page raises the signal density of whatever the extractor does keep.
