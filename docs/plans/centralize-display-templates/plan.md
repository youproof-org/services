# Centralize reference display templates

Move the display templates out of the individual references and into one collection
in the content repo. A reference names a template and its target. The template text
lives in the collection.

This builds on the entity labels work (`docs/plans/centralize-entity-labels/plan.md`)
and is developed on a branch off `centralize-entity-labels`. The difference: the label
registry is code in the services repo, while the template collection is content, so a
new template needs no services release.

Status: the design is agreed. The decisions are listed at the end.

## Current state

Every content file with inline references carries a `references` dictionary keyed by
a symbolic name. Each entry has a `display` (the template or literal text) and a
`target` (an FQN or a URL). The body uses an entry as `[symbolic-name]`, any number
of times.

Measured on the content repo working tree (branch `content/yp-101-section-26.8`,
849 YAML files, 778 files or nodes with a `references` map):

| Target type | References | With `{...}` template | Used more than once |
|---|---|---|---|
| term | 6,647 | 1 | 2,805 |
| theorem | 815 | 730 | 113 |
| claim | 710 | 695 | 125 |
| definition | 664 | 641 | 99 |
| section | 251 | 221 | 31 |
| chapter | 199 | 135 | 56 |
| remark | 75 | 0 | 9 |
| proof | 29 | 0 | 2 |
| external | 88 | 0 | 12 |
| book, article, page | 13 | 0 | 3 |
| **Total** | **9,491** | **2,423** | **3,255** |

The types in scope (definition, theorem, proof, remark, claim, section, chapter) hold
2,743 references. What the numbers show:

- **The same few templates are copied thousands of times.** The in-scope types use
  95 distinct templates after whitespace is normalized.
  `{the(target.index)} [{target.index} {capital(target.label.canonical)}]` alone
  appears 904 times. 39 of the 95 are used once.
- **Whitespace variants count as different templates today.** `base('ine', target.label)`
  and `base('ine',target.label)` are 64 definition references each.
- **Claims are the long tail.** 64 of the 95 templates are claim templates. They
  differ by the noun for the claim (`állítás`, `tulajdonság`, `pont`, `gyűrűaxióma`,
  `feltétel`), by its case, and by whether the parent entity is named.
- **Some in-scope references carry literal text.** 321 have no `{...}`: repeated
  phrases (`megjegyzés` 74 times, `előző fejezet` 30, `bizonyítás` 14), theorem
  names used as link text (`kis Fermat-tétel` 15), and 32 with no `display` at all
  (see below).
- **One term reference uses a template.** `in-the-reflexiv-relacio-definition` in
  `knowledge-base/halmazelmelet/remarks/antiszimmetrikus-relacio-megjegyzes.yaml`
  targets a term but renders its parent definition (`a [3.2. Definíció]ban`), through
  `target.parent`. It is a reference to the definition written against the wrong
  target, and step 4 retargets it. After that no term reference uses a template.
  Three more term displays contain braces, but those are LaTeX
  inside `$...$` (`modulo $p^{c+1}$ maradékosztály`), not templates.
- **Authors already fake multi-references.** 129 places in the body chain two to five
  in-scope references with a comma or a conjunction, using a second key with an
  index-only display for all but the last one, such as
  `[the-x-chapter-index], [the-y-chapter-index] és [the-z-chapter]`. See
  [Hand-chained lists](#hand-chained-lists-in-the-content).
- **Reuse is mostly a term thing.** 16% of in-scope references are used more than
  once. For terms it's 42%, up to 33 uses of one key in a file.
- **28 declared references are never used** (see below).

### References without a display, and unused references

The 32 references without a `display` fall into two groups:

- 13 are in chapter 27 (`07-kitekintes-es-jovokep/27-alice-es-bob-jovoje`, sections
  02, 03, 04, 06, 07 and 08). They are used in the body, so they render as a
  `[key]` error span until the chapter's migration gives them a display.
- 19 are leftovers that nothing uses: one in chapter 18
  (`gyuruhomomorfizmus-magja-es-kepe` in `08-maradekosztalygyuruk.yaml`) and 18 in
  knowledge-base proofs, theorems and remarks. Each is keyed by the bare name of its
  target, which suggests a tool added them and no sentence picked them up.

The 28 unused references are those 19 plus nine with a display:

- seven in `04-a-szamelmelet-alapjai/16-alice-es-bob-alaptetele/05-a-szamelmelet-alaptetele.yaml`:
  `in-the-szamelmelet-alaptetele-def`, `ufd`, `commutative-ring-short`,
  `domain-short`, `ring-with-identity-short`, `commutativity-of-ring`,
  `being-a-domain`;
- `first-degree` in `knowledge-base/polinomok/theorems/maradekos-osztas-elsofoku-polinommal.yaml`;
- `subset` in `knowledge-base/primalitas/proofs/miller-rabin-nemtanuk-fedocsoportja-bizonyitas.yaml`.

They are removed before the migration (step 4).

`node scripts/check-refs.mjs --unused` reports 94, not 28. The other 66 are used.
Its `REF_RE` only matches lowercase keys, while the website's pattern in
`InlineText.tsx` also accepts uppercase, so every use of a key such as
`ring-Z-of-integers` or `residue-class-mod-I` is invisible to the script. That also
means the script never checks that those uses are declared. Step 4 fixes the pattern
first, so the unused list can be trusted.

In services, `resolveDisplayTemplates` in `apps/website/lib/content/graph.ts` resolves
each entry's `display` in place with `resolveTemplate` and `buildContext` from
`lib/content/display-template.ts`. `components/content/InlineText.tsx` matches
`[key]` with `\[([a-zA-Z][a-zA-Z0-9-]*)\]`, capitalizes the display at a sentence
start, and turns the span from the first `[` to the last `]` of the display into the
link. So a display has one link and an entry has one `href`.

The editor shows each reference inline as a purple `[symbolic-name]` and lists the
entries in a references panel (`media/src/editor/RefsPanel.tsx`). It has no template
renderer.

## Design

### Template collection (content repo)

One file per locale: `content/display-templates/display-templates.<locale>.yaml`. A
template name is unique within its file.

```yaml
the-index-label:
  targets: [definition, theorem]
  template: "{the(target.index)} [{target.index} {capital(target.label.canonical)}]"

the-index-label-ine:
  targets: [definition, theorem]
  template: "{the(target.index)} [{target.index} {capital(base('ine', target.label))}]{suffix('ine', target.label)}"

the-index-chapter:
  targets: [chapter]
  template: "{the(target.index)} [{target.index} fejezet]"

remark:
  targets: [remark]
  template: megjegyzés
```

Rules:

- Names are kebab-case. Each locale has its own set of templates, because what a
  template has to express depends on the language: Hungarian needs one per case,
  English needs none of those and may need others. Two locales can share names where
  the same shape makes sense in both, and nothing requires them to. This differs
  from the label registry, where variant keys are the same in every locale.
- A reference always names a template of its own file's locale. Translating a content
  file therefore means choosing the templates again, not only translating text.
- `targets` lists the target types the template accepts. A reference whose target is
  another type fails the build. The type decides which context fields exist
  (`target.label` for entities, `target.parent` for claims), so this check replaces
  today's behaviour of leaving an unresolvable `{...}` in the page.
- The expression language is kept and extended. What exists stays valid: `{path}`,
  `the`, `capital`, `base`, `suffix`, `inflect`, and `[...]` for the link, so today's
  templates move into the collection unchanged. The extensions this plan needs are
  the `list` form with its positional forms and grouping (see
  [Multi-references](#multi-references)). Other additions, such as new builtins for a
  locale with different article or agreement rules, go into the engine in services
  as they come up. A new template needs no services release, a new builtin does.
- A template with no `{...}` is allowed. It covers the repeated literal phrases.
- The collection is looked up by the locale of the file that holds the reference,
  because the template is part of that file's sentence. Case keys are still checked
  against the target's locale, as today.
- A locale's file must define every template that locale's content uses.

Naming convention, so the names stay guessable: an optional `the-` prefix for the
article, then what is shown (`index`, `index-label`, `index-label-title`), then an
optional case key from the label registry (`-ine`, `-acc`).

In the editor, authors see the rendered result, not the name. The template picker
lists each applicable template as it would render for the reference's actual target,
for example `az [1.2. Definíció]ban`, with the name beside it. The name is what
appears in the raw YAML and in the collection file.

**One template per case, not a case parameter.** A `case` argument on the reference
would cut the per-case copies of each shape, but it adds a second concept to every
reference and to the picker. With rendered previews a flat list is easy to use, and
the collection lands at roughly 40 to 50 templates outside the claim tail. Revisit if
the list gets unwieldy.

### References list (content files)

`references` becomes a list. The body refers to an item as `[i]`, the zero-based
index.

```yaml
references:
  - { display: the-index-label-ine, target: definitions.peano-axiomarendszer }
  - { display: the-index-chapter, target: books.alice-es-bob.chapters.alice-es-bob-szamelmeletet-epit }
  - { text: kis Fermat-tétel, target: theorems.kis-fermat-tetel }
  - { text: Wikipedia, target: "https://hu.wikipedia.org/wiki/Prímszám" }
```

An item has a target and exactly one of:

- `display`: a template name from the collection;
- `text`: literal link text, with `[...]` marking the link as today.

`text` is what keeps terms and external URLs out of scope. Their displays are free
text (804 distinct displays across the term references), so they move into the list
unchanged as `text` items. The in-scope types can use `text` too, for link text that
is prose and not a pattern, such as a theorem's name inside a sentence. A `text` with
a `{...}` expression is a build error: an expression belongs in the collection.

The whole `references` structure changes at once, terms and URLs included. Keeping
term references in a keyed dictionary next to a list would mean two token syntaxes in
one body and both editor UIs alive.

The `[i]` token needs a new pattern in `InlineText.tsx`, `\[(\d+)\]`. No narrative
field contains such a token outside `$...$` math today. They do occur in formula
blocks and typewriter rows (`[0]_3`), so step 1 confirms those fields are never
parsed for references.

### Single use

**Decided: each item is used exactly once.**

For:

- Reuse stops paying for itself. An item is two short fields once the template text
  is gone, so sharing one saves a line and nothing else.
- `[i]` removes the one thing a shared key gave the raw YAML, a readable name.
- The token and the item are the same thing. Editing a reference changes that one
  occurrence, with no question of which other sentences it touches. Today 963 targets
  are already declared under several keys in one file because one sentence needed a
  different case than another.
- The references panel can go. So can unused entries (28 today), since an item
  without a token and a token without an item are both build errors.
- A canonical order becomes possible (see below).

Against:

- **More items.** Single use adds 8,138 items to today's 9,491. 7,521 of those are
  term references, and only 593 are in scope. The largest file reaches 175 items.
  Written in flow style, that's one line per reference occurrence.
- **Retargeting touches every occurrence.** An FQN rename already runs as a script
  across files, so this adds lines to a diff, not a new sort of work.
- **Raw YAML gets harder to read and review.** `[12]` says nothing without counting
  list items. This comes from the index token more than from single use, but single
  use makes the lists longer. Content PR review depends on the editor or on a
  rendered preview from then on.

**Canonical order.** With single use, the list is in the order the tokens appear in
the file, so `[i]` is the i-th reference a reader meets. `check-refs.mjs` enforces it
and gets a `--fix` mode that renumbers. The cost is diff noise: inserting a reference
near the top of a file renumbers every token after it. Deleting an item shifts the
later indexes under any ordering rule, so a free order wouldn't avoid renumbering, it
would only add a second valid way to write the same file.

### Multi-references

A multi-reference is one item with several targets, rendered by one template:

```yaml
- display: the-chapters-ine
  targets:
    - books.alice-es-bob.chapters.alice-es-bob-rendet-tesz
    - books.alice-es-bob.chapters.alice-es-bob-eladosodik
    - books.alice-es-bob.chapters.alice-es-bob-gyuruje
```

An item has `target` or `targets`, never both. `target` is the short form of a
one-item list, and the loaded model always holds a list.

**Decided: list templates with positional forms and optional grouping.** The
template says how an item looks depending on its position, and what goes between
items. It works for any count it allows.

The model is the list patterns of CLDR, the Unicode locale data that
`Intl.ListFormat` in JavaScript reads. CLDR describes how a language joins a list
with four patterns: one for a pair, and a start, a middle and an end pattern for
longer lists. That gives `A és B` and `A, B és C` in Hungarian from one definition.
The design borrows that idea and adds one thing CLDR doesn't have: the item itself
can look different by position, which the article and the noun need.

```yaml
the-chapters-ine:
  targets: [chapter]
  list:
    count: { min: 2 }
    item:
      first:  "{the(target.index)} [{target.index}]"
      middle: "[{target.index}]"
      last:   "{the(target.index)} [{target.index} fejezet]"
      separator: ", "
      last-separator: " és "
    after: "ekben"
```

| Targets | Result |
|---|---|
| 13, 14 | a [13.] és a [14. fejezet]ekben |
| 13, 14, 15 | a [13.], [14.] és a [15. fejezet]ekben |
| 13, 14, 15, 16 | a [13.], [14.], [15.] és a [16. fejezet]ekben |

Where the link ends is the template's choice, as it is for single references. Here
the noun is inside the last link and only the ending is in `after`, which matches
how the content links `[15. fejezet]ekben` today. A template with
`last: "... [{target.index}]"` and `after: " fejezetekben"` would render the same
words with the noun outside the link.

- `first`, `middle`, `last` and `only` are ordinary single-target templates. Each is
  resolved against its own target, so `the()` picks the article per item and each
  `[...]` links to that item's target.
- `only` is the form of an item that is alone. `middle` defaults to `first`, and
  `last` to `middle`. `only` has no default: a lone item usually needs both the
  article of `first` and the noun of `last`, and no rule can merge the two.
- `before` and `after` are text around the whole list.
- `count` is an exact number (`count: 3`) or a range with `min` and `max` subfields
  (`count: { min: 2, max: 4 }`). `min` defaults to 1. Leaving out `max` makes the
  range open. `min` must be smaller than `max`, since a range of one value is
  written as the exact number. A reference with a target count outside it fails the
  build.
- A template has `template` (exactly one target) or `list`, never both.

#### Grouping

A flat list breaks when the targets don't share the word that ends it. Four lemmas
can end in one `Lemma`. Two lemmas and two corollaries can't. So a list template can
group its targets, and render a list of lists:

```yaml
the-entities:
  targets: [definition, theorem]
  list:
    count: { min: 2 }
    group-by: label
    item:
      first:  "{the(target.index)} [{target.index}]"
      middle: "[{target.index}]"
      last:   "[{target.index} {capital(target.label.canonical)}]"
      only:   "{the(target.index)} [{target.index} {capital(target.label.canonical)}]"
      separator: ", "
      last-separator: " és "
    group:
      separator: ", "
      last-separator: ", valamint "
```

| Targets, as listed in the reference | Result |
|---|---|
| 14.1 (lemma), 15.3 (corollary), 15.2 (lemma), 15.4 (corollary) | a [14.1.] és [15.2. Lemma], valamint a [15.3.] és [15.4. Következmény] |
| the same, after 15.3 becomes a lemma | a [14.1.], [15.2.] és [15.3. Lemma], valamint a [15.4. Következmény] |
| 14.1 (lemma), 15.2 (lemma) | a [14.1.] és [15.2. Lemma] |

- `group-by` names what the members of a group share:
  - `label`: the target's type and label variant;
  - `parent`: the entity that owns the target, for claims;
  - `type`: the target's type (definition, theorem, chapter and so on).
- The targets are sorted by their position in the content before they are grouped,
  so the lists read in ascending index order whatever order the reference lists
  them in. That is why the second row reads 14.1, 15.2, 15.3. It also keeps a list
  right when an entity moves and its index changes. Decided: sorting is the
  default. A template can set `order: authored` to keep the reference's own order,
  for a sentence that names its targets in a deliberate sequence.
- Groups come in the order of their first member after sorting.
- The `item` forms and separators apply inside each group, with positions counted per
  group. `group` gives the separators between groups.
- Without `group-by` the whole list is one group, which is the flat case above.
- A template with `group-by`, or with a `count` whose `min` is 1, must define `only`,
  because a group can shrink to one member when a label changes. The template check
  enforces it.

The second row is the point. When an entity's variant changes, every list that names
it regroups on the next build. No content file is edited and no build fails.

Grouping by `parent` also fits the most common claim shape in the content, where the
parent entity is named once and the claim indexes follow
(`a 24.1. Tétel 1. és 2. pontja`). 50 of the 51 claim lists have one parent, and the
one that spans two becomes two groups.

Grouping replaces the `common` context this plan proposed earlier, under which a
template could read a field all targets share and the build failed when they
stopped sharing it. A variant change in one file would then have failed the build
over sentences in other files. Inside a group the shared field is the item's own
(`target.label`, `target.parent`), so nothing extra is needed.

Is it worth the complexity? The engine cost is small: one more loop, and the same
positional logic applied at two levels. The content today has no list that mixes
label variants and four that mix a definition with a theorem, so the immediate gain
is modest. The reason to build it now is that a list template without it is only
correct while its targets happen to agree, and the claim lists need the same
mechanism anyway. One rule follows for template authors: a list template that ends
in a word taken from a label must group by `label`. A fixed word such as
`fejezetekben` needs no grouping, because `targets: [chapter]` already guarantees
it fits.

#### Options considered for the count

| Option | Templates needed | Verdict |
|---|---|---|
| Fixed count, `{t1.index}`, `{t2.index}` placeholders | One per count per shape | Simple engine, but the 129 existing lists span two to five items, so every shape needs four copies. And a fixed layout can't regroup. |
| One template with a text per count (`1:`, `2:`, `3:`) | One per shape, with a body per count | Fewer names, same amount of text, a hard upper bound, and no regrouping. |
| Positional forms with grouping | One per shape | One definition for any count. |

Positional forms cover the lists in the content today: every in-scope list with three
or more members repeats one middle form and one separator, and ends with one
conjunction.

**A possible later extension: an exact-count override.** Some phrasing only exists
for one count. Hungarian has `mind a 13., mind a 14. fejezetben` for exactly two, and
nothing like it for three. If a template needed that, its `list` could carry a
complete, hand-written template for that one count beside the positional forms, and
the engine would use it when a reference has exactly that many targets. The
references wouldn't change, since they only name the template and the targets. That
is all the earlier sentence meant. Nothing in the content needs it today, so it
isn't part of this plan.

**Resolved displays become segments.** A list has several links, so the resolved
display can't stay a string with one `[...]`. `RefEntry` gets a list of segments,
each either plain text or link text with its own target, `href` and `kbHref`. A
single reference is the one-link case of the same shape. Sentence-start
capitalization applies to the first segment. Every target of a multi-reference
counts as an incoming reference on its own, so the backlink rows and
`data-target-fqn` work per link.

### Hand-chained lists in the content

`chained-references/collect.cjs` next to this plan finds the lists authors chained by
hand. It writes every place to `chained-references/places.json` and the distinct
shapes to `chained-references/summary.md`. Run it with the content directory and a
`js-yaml` module path as arguments.

The heuristics:

- **Strict match.** Two or more reference tokens in one string, where the text
  between neighbours is only an optional case ending glued to the previous link, a
  comma or a conjunction (`és`, `vagy`, `illetve`, `valamint`, `meg`, a dash or a
  slash), and an optional article.
- **Loose match.** The text between is up to 40 characters with no sentence
  punctuation, the earlier reference has an index-only display, and the next one
  targets the same type. An index-only display has no noun of its own, so a later
  reference has to supply it.
- Math spans are masked first, and formula content and typewriter rows are skipped.
- A place is in scope when every member targets an in-scope type.

Result on the current content:

| Scope | Places |
|---|---|
| In scope | 129 (128 strict, 1 loose) |
| Mixed (an in-scope reference next to a term or URL) | 30 |
| Out of scope (terms, URLs, people) | 285 |

The in-scope places have 2 members (105), 3 (18), 4 (4) or 5 (2). By type: 51 claim
lists, 39 chapter, 20 theorem, 5 section, 4 definition, and 10 that mix types
(definition with theorem, claim with theorem or definition).

They reduce to 60 distinct shapes, where a shape is the types, the first, middle and
last display, and the separators. 12 shapes cover 75 places and 42 shapes occur once.
Many shapes differ only in details a list template makes irrelevant: whether the
last member links the noun, whether a middle member repeats the article, or which
case ending the body glues on after the list. The most common ones, with example
indexes:

| Places | Renders as | Kind |
|---|---|---|
| 15 | `a 6. és a 7. fejezet` + ending in the body | chapter |
| 14 | `a 24.1. Tétel 1. és 2. pontja` | claim |
| 13 | `a 13., 14. és 15. fejezet` + ending in the body, 3 to 5 members | chapter |
| 6 | `a 12.3. és a 12.4. Tétel` | theorem |
| 4 | `a 16.2. és a 16.3. Tételek` | theorem |

Three things the data says about the template design:

- **The case ending sits in the body today.** After the last link the sentence goes
  on with `ekben`, `eket`, `ban`. A list template takes the noun and its ending into
  `after`, so each case needs its own template, as for single references.
- **Claim lists share a parent.** The largest claim shape names the parent entity
  once and then lists claim indexes. 50 of the 51 claim lists have a single parent.
  Grouping by `parent` renders this shape, and handles the one list that spans two
  entities.
- **No list mixes label variants today.** Four of the 28 definition and theorem
  lists mix a definition with a theorem. None mixes a `lemma` or a `corollary` with
  another variant.
- **Mixed-scope places stay as they are.** A term next to a definition
  (`[peano-addition] és [the-peano-szorzas-definition]`) is two references in a
  sentence, not one list.

The collector also checks each in-scope place against what a list template does,
which is to sort the targets by position and optionally group them:

| What the place needs | Places |
|---|---|
| Flat list: one type, one label variant | 68 |
| Claims of one parent | 50 |
| Group by type (a definition with a theorem) | 4 |
| Group by parent (claims of two entities) | 1 |
| A claim next to an entity | 6 |

- **20 places are not in ascending order.** The author named a later target first.
  With sorting as the default, converting them reorders the sentence. 12 of the 20
  are claim lists of one parent, 3 are flat lists and 5 pair a claim with an
  entity. Each needs a choice in step 4a: accept the sorted order, or use a
  template with `order: authored`. The positions are computed by the script from
  the chapter order, the embed order and the claim order, as an approximation of
  what the site computes, so the build is the final word.
- **No place interleaves its groups**, so grouping alone never reorders one.
- **A claim next to an entity fits none of the `group-by` values well.** Grouping by
  `type` separates them, but a claim item needs its parent named and an entity item
  doesn't, so one `item` block can't render both. Decided: these six stay as
  separate references. Each member is already a complete phrase with its own
  article and noun, so they render as today.
- **46 places have a case ending glued on in the body**: `ben` 14, `ekben` 12, `et`
  7, `eket` 5, `ban` 4, and four others once each. These endings tell which case
  variants of the list templates are needed.

The migration converts these places to multi-references (step 4a).

### Effect on the knowledge base

Everything on a knowledge-base page that reads references was checked against the
change. `kbEntityRowLines` and the backlink row texts don't read displays, so they
are unaffected. The rest:

| Feature | Code | Effect |
|---|---|---|
| Backlink counts and their order | `buildBacklinkIndex` in `lib/content/graph.ts`, `BacklinksPanel.tsx` | **Visible change, see below** |
| Outgoing reference panels | `referencePanels` in `components/kb/panels/ReferencePanel.tsx` | Has to walk every target of an item. One panel per distinct target stays. Panel order follows the list, which becomes the order of appearance. |
| Links on a knowledge-base page | `kbRefs` in `lib/content/urls.ts` | Swaps `href` for `kbHref` per entry today. Has to do it per link segment. |
| Structured data citations | `citationIds` in `lib/content/structured-data.ts` | Has to walk every target. Its output is deduplicated and sorted, so it doesn't change. |
| Page excerpts | `kb-excerpt.ts` | Has its own copy of the inline token pattern and reads `display` as a string. Needs the `[i]` token and the plain text of the segments. |
| Highlight on arrival | `lib/kb/highlight.ts`, `data-target-fqn` in `InlineText.tsx` | Works per link, so each link of a multi-reference carries its own target. No change in behaviour. |

**Backlink counts change.** The index counts one per
*declared* reference, not one per use in the text. A section that declares one key
for a theorem and uses it five times shows a count of 1 today. A section that
declares five keys for five grammatical cases shows 5. With single use there is no
declaration apart from the use, so the count becomes the number of times the source
cites the target. Measured on the content: of 7,766 source and target pairs, 2,934
(38%) get a different count, almost all higher, and the total goes from 8,940 to
16,922. The rows are ordered by count, so their order changes too.

Decided: count every citation. That is what the code comment on
`buildBacklinkIndex` already describes ("a section citing an entity five times is
one row saying five"). Rows stay ordered by count, and the chapter and section
totals stay the sums of their rows.

**A multi-reference is an incoming reference for each of its targets.** One item
with three targets adds one citation to three incoming lists, so every consumer
walks targets, never items:

- `buildBacklinkIndex` adds one to the count of each target. Two claims of the same
  entity in one multi-reference add two to the entity's overall list and one to each
  claim's own narrowing, exactly as two chained single references do today.
- Each target renders exactly one link. The template check enforces it: an item
  form has at most one `[...]`, and a form without one is a link as a whole. So
  every incoming reference has a link to land on, and `before`, `after` and the
  separators never carry one.
- Arriving from a backlink row highlights only the link of the entity the reader
  came from, not the whole list, because `data-target-fqn` sits on each link.
- The same target twice in one reference is a build error. It would count one
  mention twice and render the same link twice.
- Converting a hand-chained list (step 4a) keeps the targets, so it must leave every
  backlink count unchanged. The equivalence check asserts that.
- Removing one target from a multi-reference in the editor removes that one incoming
  reference and leaves the others.

One effect of the cleanup in step 4: the 28 unused references count as incoming
references today, and each produces an outgoing reference panel and a citation for
something the text never mentions. Removing them removes those.

The formula block passes only its lead-in and lead-out to `InlineText`, so `[0]_3`
inside formula content is safe from the new `[i]` pattern.

### Validation

The build fails on:

- a `references` dictionary (the old format), naming the file;
- an item with both or neither of `display` and `text`, or of `target` and `targets`;
- a `display` that isn't a template in the file's locale;
- a target type the template doesn't accept, or a target count outside `count`;
- a `{...}` expression in a `text`;
- a `[i]` with no item, an item with no `[i]`, an item used twice, or a list that
  isn't in order of appearance;
- a template with an unknown expression or builtin, a case key no locale declares, or
  both `template` and `list`;
- a list template that can render a lone item (through `group-by`, or a `count`
  whose `min` is 1) and has no `only` form;
- a `count` range whose `min` is not smaller than its `max`;
- an item form with more than one `[...]`;
- a reference that lists the same target twice;
- a `group-by` its target types don't support, such as `parent` on chapters.

`check-refs.mjs` in the content repo checks the same rules, since content PRs never
build the site. It reads the collection from its own repo, so unlike the label check
it needs nothing from services for this.

A template nothing uses is a warning from `check-refs.mjs --unused`, not an error.
Authors add templates ahead of the text that uses them.

### Editor

**Inline display.** A reference shows as its rendered display in purple, with `[...]`
around each link segment, for example `az [1.2. Definíció]ban` or
`a [13.], [14.] és a [15.] fejezetekben`. The colour marks where the reference
starts and ends, and the brackets mark what will be a link. Sentence-start
capitalization is applied, so the text reads as it will on the site. The reference
is one atomic unit in the text field: the caret steps over it and can't land inside.

**The reference lives in the text, and the list is written on save.** In the
editor's in-memory model each reference token holds its own item (template or text,
and targets). There is no separate list to keep in step. On load, the editor turns
`[i]` and the `references` list into these tokens. On save, it walks the body in
order, writes the list and numbers the tokens. Everything that changes the text then
handles the references with no extra bookkeeping:

- deleting a token with Backspace or Delete removes the reference;
- deleting or replacing a selection, by typing, pasting or cutting, removes every
  reference inside it;
- deleting a block with its delete button removes the references in it, including
  those in nested blocks of a subsection or details block, and in removed list items;
- moving or reordering blocks changes the order, and the next save renumbers;
- undo and redo restore a reference with its details, because they restore the token;
- copy and paste carry the reference with the text, within a file and across files.
  A pasted copy is a new, independent reference.

A selection can't start or end inside a reference, so a reference is always deleted
whole. The author never sees or types an index.

**Creating a reference.** Typing `[` opens the create popup at the caret and inserts
nothing into the text, not even an empty `[]`. The author picks the target, then the
template from the rendered previews, and confirming inserts the finished token at
the caret. Escape closes the popup and leaves the text unchanged. Typing `[` inside
a `$...$` math span doesn't open the popup, since brackets are ordinary there. `[[`
keeps its meaning for term insertions.

**Editing a reference.** Clicking a reference opens the same popup with its details:
the template, picked from the templates that accept the targets' types and count,
each shown rendered against the actual targets; a switch to literal `text`; and the
target. For a multi-reference the popup holds the ordered target list with add,
remove and reorder, and the preview shows how the targets group. `RefsPanel.tsx` and
its hooks go.

**Popup placement.** The popup must never cover the reference it edits:

- it anchors to the token's rectangle. A token that wraps over two lines counts as
  the union of its line boxes;
- it opens below the token, left-aligned with it. If there isn't room below, it
  flips above. If neither side fits, it takes the larger side and scrolls inside;
- it shifts sideways to stay within the editor pane, without moving over the token's
  lines;
- it follows the token while the text scrolls, and closes when the token leaves the
  view;
- the token stays highlighted while its popup is open, and the preview in the popup
  updates the token live.

The create popup follows the same rules with the caret as its anchor.

**Collection editing.** Decided: the collection file is hand-edited YAML. The editor
reads it and reloads when it changes on disk.

**Where the renderer lives.** Decided: the template engine moves into a
dependency-free package under `packages/` in services. The website uses it, and the
editor bundles it from the services checkout. One implementation, so the editor
can't render differently from the site.

The engine also needs the values it reads: chapter, section and entity indexes, and
the labels. The entity index comes from the embed order within a chapter
(`buildEmbedding` in `graph.ts`), so the editor needs the same numbering over its own
loaded content. Step 7 starts by checking what the editor's loader already computes,
and the numbering logic moves into the shared package if the editor lacks it.

### Later phases

The model leaves room for these without another format change:

- **Terms.** A term reference is already a list item with `text`. Centralizing it
  means giving a term its named inflected forms once, in the term's definition, and
  letting a reference pick one. That is a template with `targets: [term]` reading
  `target.forms`, or a `form` field on the item. Either fits the item shape.
- **Claim nouns.** Most of the 64 claim templates exist because the claim's noun is
  written into the template. If an entity declared what its claims are called, with
  the inflected forms in the label registry, claim templates could read
  `target.label` like entity templates do, and the tail would shrink to about a
  dozen. Until then the migration creates the claim templates as they are.
- **Figure self-references.** `self-reference.display` on a figure uses the same
  engine with its own context. It stays inline for now.
- **Books and standalone items.** 13 references, all literal today. They become
  `text` items and can get templates whenever one is worth naming.

## Steps

### 1. Collection loader and checks (services)

Load `content/display-templates/display-templates.<locale>.yaml` into the raw graph, with types and
the template checks. Confirm typewriter rows are not parsed for references (formula
content isn't, see [Effect on the knowledge base](#effect-on-the-knowledge-base)).
Unit tests.

### 2. Engine: list templates and segments (services)

Move the engine into a dependency-free package under `packages/`, and add list
resolution with positional forms and grouping. Change the
resolved display from a string to segments, and render segments in `InlineText.tsx`.
Existing single references go through the new path, with unchanged output.

### 3. References list (services)

The loader reads the list form, resolves `display` through the collection and
rejects the dictionary form. `InlineText.tsx` and `kb-excerpt.ts` match `[i]`, ideally
from one shared pattern instead of the two copies they have today. Update the
knowledge-base consumers listed under
[Effect on the knowledge base](#effect-on-the-knowledge-base): `buildBacklinkIndex`,
`referencePanels`, `kbRefs` and `citationIds`. Add the reference checks
from the validation section. Update the walkers that use the reference key in their
messages (`validateReferences`, `resolveDisplayTemplates`) to name the index. Bump
`RAW_GRAPH_VERSION` from 5 to 6, since the raw entries change shape.

As with the label change, the rejection has to fail the deploy's `website` job before
any upload.

### 3a. Docs (services)

No version bump. The released version is 2.3.2, and the entity labels branch already
bumps it to 2.4.0. That branch is released together with this one, not on its own,
so 2.4.0 covers both content contract changes.

Update `docs/content-site-and-static-generation.md` and `docs/i18n-design.md` where they
describe references. §8 of `docs/i18n-design.md` lists no shared schema package as a
non-goal, which `packages/display-templates` has changed. Update it to say what is
shared and why.

### 4. Content migration (content repo)

A one-off script:

- collects the distinct templates of the in-scope types, normalizes whitespace, and
  writes the collection with generated names for review. The names are reviewed and
  fixed by hand before the rewrite runs;
- rewrites each `references` dictionary as a list in order of appearance, one item
  per use, and each `[key]` as `[i]`;
- turns in-scope literal displays that repeat (`megjegyzés`, `előző fejezet`,
  `bizonyítás`) into templates, and the rest into `text`;
- moves term, external, book and standalone references over as `text` items;
- stops on a reference that is unused or has no display. The cleanup below removes
  them first, so one that appears later is a new mistake.

Before the rewrite, as separate commits:

- fix `REF_RE` in `scripts/check-refs.mjs` so it matches keys with uppercase letters,
  and fix whatever the script then reports;
- remove the 28 unused references listed under
  [Current state](#references-without-a-display-and-unused-references);
- retarget `in-the-reflexiv-relacio-definition` in
  `knowledge-base/halmazelmelet/remarks/antiszimmetrikus-relacio-megjegyzes.yaml`
  from `definitions.reflexiv-relacio.terms.reflexive-relation` to
  `definitions.reflexiv-relacio`, and replace `target.parent` with `target` in its
  display. The rendered text stays the same. The link moves from the term's anchor
  to the definition, which is an intended change for the equivalence check;
- give the 13 chapter 27 references a display, or confirm they get one with that
  chapter's own migration before this one runs.

Update the "References System" section of `docs/content-model.md`, and `CLAUDE.md`
where it describes references.

In services, update `apps/website/e2e/kb-backlinks.test.ts` against the migrated
content. It hard-codes the backlink counts and row order of the `gyuru-test` page,
which change with single use (34, 2 and 2 today; 68, 7 and 2 in a trial conversion,
in a different order). It runs in the deploy's `website` job before the upload, so it
has to land before the first deploy with migrated content. Take the numbers from the
real migration after step 4a, since a conversion can change the order.

### 4a. Convert the hand-chained lists (content repo)

Convert as many of the 129 in-scope places as possible to multi-references:

- Design the list templates from `chained-references/summary.md`, merging shapes that
  differ only in link extent or a repeated article. The target is a small set per
  type and case, not one template per shape.
- A script rewrites each place from `places.json` whose shape maps to a template:
  the chained tokens and the case ending glued after them become one token, and the
  items become one item with `targets`.
- Places that fit no template are listed for a decision: a new template, a rewrite
  of the sentence, or leaving them as separate references. The 30 mixed-scope places
  are left alone.
- Rerun `collect.cjs` on the result. What it still finds is the list of places that
  were deliberately not converted.

A conversion may change which words are inside a link. It must not change the text,
except in the places that are not in ascending order today, where the outcome of
the decision above is recorded. Each
converted place goes into the manifest of intended changes with its old and new
rendering (step 6).

### 5. Content-side check (content repo)

Extend `scripts/check-refs.mjs` with the validation rules and the `--fix` renumbering.
`ref-check.yml` already runs it on pull requests.

The script doesn't keep its own copy of the rules or of the YAML parser, so it can't
drift from the build. Services builds one JavaScript file from the packages (the
template checks, the collection and reference readers, the token grammar) with the
js-yaml it uses, commits it, and fails CI when the file is out of date with its
sources. `check-refs.mjs` loads that file from the services checkout locally, and
`ref-check.yml` downloads it from services `stable/staging`, as it does for
`entity-labels.json`. Without a services checkout a local run skips the reference
checks with a warning, as it already does for labels.

Until this step, the script still reads only the old dictionary format, so on the
migrated content it passes without checking any reference. The content repo's
`CLAUDE.md` and `.claude/skills/link-references/SKILL.md` say so and send authors to
the site build instead. Once the script checks the list, update both to say what it
checks, and describe `--fix` in the skill's workflow.

### 6. Output equivalence check

Reuse the two-layer check and its scripts from
`docs/plans/centralize-entity-labels/equivalence`. Layer 1 keys each reference by
source file and position instead of by key.

Run it twice. After step 4 the intended changes are:

- the retargeted `in-the-reflexiv-relacio-definition` link;
- the backlinks, panels and citations the 28 removed references produced;
- the backlink counts and the row order that follows from them. These are checked by
  rule, not listed one by one: every count must equal the number of times the source
  cites the target in its text.

Reference displays and page text must be identical, so any other difference is a
migration bug. After
step 4a the manifest holds exactly the converted places, and for each of them the
page text with the markup stripped must be identical before and after, and only the
link boundaries may differ. The backlink counts must not change at all, since a
conversion keeps the targets. The exception is a place where the sorted order was
accepted over the authored one: its entry records the reordered text.

### 7. Editor (editor repo)

It starts with three changes in services, so the editor bundles shared code instead of
keeping copies of it:

- Move the collection reader from `apps/website/lib/content/loader.ts` into
  `packages/display-templates`, with the defaults it fills in (`middle` from `first`,
  `last` from `middle`, `last-separator` from `separator`, an exact `count` as a
  range). The list resolver relies on those defaults, so the editor has to read the
  collection the same way. The reference list reader goes with it: `readReferences`
  and `referenceTexts` from `loader.ts` and the token grammar in
  `apps/website/lib/content/inline-tokens.ts`, so the editor and the site agree on
  which items a file has, which tokens its text holds and in what order.
- Add a second package for content addressing and labels, kept apart from the
  template engine. It takes `lib/content/fqn.ts`, which replaces the editor's
  hand-kept copy in `src/content/fqn.ts`, and the code that interprets the label
  registry and the locale list: the registry types, `validateEntityLabelRegistry`,
  the case-key and variant lookups, and reading the locales. These are pure
  functions over the parsed JSON. `packages/display-templates` then imports
  `RefTargetKind` from it, in place of the compile-time check that its target types
  match the website's.
- Move the numbering and the template context into the packages: the embedding and
  the chapter, section and entity indexes (`buildEmbedding`), the context the
  expressions read, `buildContentPositions`, `groupKeys` and the resolution of a
  file's references into segments. The editor computes no indexes of its own, so
  without this it can't render a reference the way the site does. The functions take
  plain data that both the website's graph and the editor's loaded content produce.
  The editor numbers only what it loaded. Where it can't find a chapter, section or
  embedded entity that the site's build would fail on, it shows an error instead of
  numbering what's left, so its numbers never silently differ from the site's.

`locales.json` and `entity-labels.json` stay in `apps/website/lib/i18n` as data. The
editor keeps reading them from the services checkout at startup, so a new locale or
label variant reaches it without an editor release, and `check-refs.mjs` in the
content repo keeps reading `entity-labels.json` by path.

Then, in the editor, one commit or a few per step:

1. Bundle the extension host with esbuild, resolving the shared packages from the
   services checkout (`SERVICES_DIR`, else `../services`).
2. Use `content-model` for reference paths, locales and the label registry, in place
   of the editor's own `fqn.ts` and parsing.
3. Read the collection with the shared reader, report its problems, and reload it
   when it changes on disk.
4. Build the content outline from what the editor loads and number it with the
   shared code, reporting missing content as described above.
5. Read the `references` list and `[i]` tokens with the shared reader, over the same
   text fields as the site. Refuse to save a file that still has a `references`
   dictionary, as it does for a `labels` block.
6. Hold each reference in its token, and write the list and number the tokens on save.
7. Render references inline as atomic tokens.
8. Replace the panel with the create and edit popup.
9. Release editor 2.0.0, in a separate PR, because 1.3.0 loses data on migrated
   content: it ignores the list, so a save drops it and leaves the `[i]` tokens behind.

## Delivery

The label change and this one ship as one release, from a `references-refactor`
branch in each repo. One commit per step, with approval before each commit.

- Services: `references-refactor` carries the label change too, and reaches
  `development` in one PR.
- Content: `references-refactor` is off `content/yp-94-chapter-26`. It's merged back
  into `content/yp-94-chapter-26`, and chapter 26 is finalized on that branch with
  the migrated content. The migration rewrites nearly every content file, so nothing
  else merges into that branch meanwhile, or the scripts are rerun on conflict. They
  are repeatable for that reason.
- Editor: released first, as 2.0.0. Until chapter 26 is finalized, the only content
  being edited is that branch, which already has the migrated content, so nobody
  needs the old format in the editor.
- Services and content are released together after chapter 26 is finalized.
- No dual-format release. Services goes first, as in the entity labels runbook: new
  services with old content fails the build before upload, and old services with new
  content would render wrong with no gate to catch it. The deployment steps and the
  one `pr-gate` bypass are the same as in that plan.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Single use or reuse of an item | Single use, with canonical order |
| 2 | Do term and URL references move into the list now | Yes, as `text` items; only their templates stay out of scope |
| 3 | Arity of multi-reference templates | Positional forms with a `count` (exact or `min`/`max`), plus grouping, sorted by position by default |
| 4 | One template per case, or a `case` argument | One per case |
| 5 | Where the renderer lives | A shared package in services, bundled by the editor |
| 6 | Convert the 129 chained lists to multi-references | As many as possible, script-assisted, in step 4a |
| 7 | Claim noun registry | Later phase, separate plan |
| 8 | Backlink counts after single use | Count every citation |
| 9 | Places that chain a claim with an entity | Stay separate references |
| 10 | Collection editing in the editor | Hand-edited YAML, reloaded on file change |
