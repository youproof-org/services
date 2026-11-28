# Claim noun registry

Give a claim a label, the way a definition or a theorem has one. An entity names what
its claims are called, the word and its inflected forms live in the label registry,
and claim templates read `target.label` instead of carrying the noun.

This is the later phase named in decision 7 of
`docs/plans/centralize-display-templates/plan.md`. It builds on that plan and on
`docs/plans/centralize-entity-labels/plan.md`.

Status: first version, for review. The open questions are listed at the end.

## Current state

Measured on the content repo's `references-refactor` branch at `c9ed62d`, after
steps 4 and 4a of the display templates plan: the references are lists, and the
hand-chained lists are list references. Rerun with
`node measure.cjs <content dir> <js-yaml module path>`, next to this plan.

65 entity files hold 217 claim blocks: 46 theorems, 12 definitions and 7 remarks.
Their claims are cited 867 times: 844 through a template and 23 as literal text
(`disztributivitási szabály`, always the same claim). A list reference counts once
for each claim it names. 58 entities are cited through a claim.

80 of the collection's templates accept a claim: 60 for a single claim and 20 list
templates. By the word they write for the claim:

| Noun | Word | Templates | Of which list | Citations | From the parent or its proof | From elsewhere |
|---|---|---|---|---|---|---|
| `point` | pont | 34 | 9 | 527 | 50 | 477 |
| `statement` | állítás | 10 | 4 | 135 | 125 | 10 |
| `property` | tulajdonság | 7 | 3 | 90 | 79 | 11 |
| `ring-axiom` | gyűrűaxióma | 8 | 3 | 34 | 0 | 34 |
| `axiom` | axióma | 4 | 1 | 18 | 5 | 13 |
| `condition` | feltétel | 3 | 0 | 15 | 6 | 9 |
| `order-axiom` | rendezési axióma | 4 | 0 | 11 | 0 | 11 |
| `peano-axiom` | Peano-axióma | 3 | 0 | 6 | 0 | 6 |
| `group-axiom` | csoportaxióma | 1 | 0 | 2 | 2 | 0 |
| no word | | 6 | 0 | 6 | 0 | 6 |

The last row is the templates that write no word for the claim at all, only its
number: `a [24.1. Tétel 3.]` or a bare `[3.]`. They were mostly the non-final
members of hand-chained lists, which is why step 4a took their citations from 57 to
6. Four of the six are unused now.

What the numbers show:

- **The noun is not one per entity.** 37 of the 58 parents are cited with more than
  one noun. In almost every case it is `pont` plus one other word.
- **`pont` is structural, the other words say what the claim is.** `pont` goes with
  the parent named in the possessive (`a 24.1. Tétel 2. pontja`), and 477 of its 527
  citations come from another file. `állítás` and `tulajdonság` stand alone
  (`a 2. állítás`), and most of their citations are in the parent's own file or its
  proof, where the parent needs no naming. So any claim can be called a `pont` of
  its parent, whatever else it is called.
- **Leaving `pont` aside, an entity has one noun.** 45 parents are cited with a noun
  other than `pont`. 40 of them use exactly one. The other five account for 20 of
  311 citations (see [Minority references](#minority-references)).
- **Theorems split between two words.** 28 theorems mainly use `állítás` and 12
  mainly use `tulajdonság`. The axiom words belong to four definitions. 13 parents
  are only ever cited as `pont` or with no word, four of them remarks.
- **The 40 templates of the eight nouns other than `pont` have 20 shapes.** Each
  noun repeats a subset of the same shapes: with or without the article, a few
  cases, the parent named with `szerinti`, and the same again as lists.
- **The `pont` family is the larger half and a declared noun doesn't touch it.** Its
  34 templates differ by how the parent is named, by case and by link extent, never
  by noun.

The display templates plan estimated that the claim tail would shrink to about a
dozen templates. With the measured data it shrinks from 80 to 60: the 40 noun
templates become 20, and the 34 `pont` templates and the 6 without a word stay. See
[The `pont` family](#the-pont-family) for what it would take to go further.

The site already names a claim in one more place. `kbPanelClaim` in
`apps/website/lib/i18n/locales.json` is `{index}. állítás`, the panel title on a
knowledge-base page (`KbEntityPage.tsx`, `ReferencePanel.tsx`). So the ring axioms
show as `1. állítás` on the ring definition's page while the text calls them
`gyűrűaxióma`.

## Design

### Registry

`apps/website/lib/i18n/entity-labels.json` gets a `claim` entry per locale, with the
same shape as an entity type:

```json
"claim": {
  "default": "statement",
  "variants": {
    "statement":   { "canonical": "állítás",          "cases": { "acc": { "base": "állítás",          "suffix": "t" } } },
    "property":    { "canonical": "tulajdonság",      "cases": { "acc": { "base": "tulajdonság",      "suffix": "ot" } } },
    "condition":   { "canonical": "feltétel",         "cases": {} },
    "axiom":       { "canonical": "axióma",           "cases": { "ine": { "base": "axiómá",           "suffix": "ban" } } },
    "ring-axiom":  { "canonical": "gyűrűaxióma",      "cases": { "acc": { "base": "gyűrűaxiómá",      "suffix": "t" } } },
    "group-axiom": { "canonical": "csoportaxióma",    "cases": {} },
    "order-axiom": { "canonical": "rendezési axióma", "cases": { "acc": { "base": "rendezési axiómá", "suffix": "t" } } },
    "peano-axiom": { "canonical": "Peano-axióma",     "cases": { "ins": { "base": "Peano-axiómá",     "suffix": "val" } } }
  }
}
```

(Variant cases abbreviated. The forms shown are the ones the collection's templates
write today.)

Rules, on top of the existing ones:

- A type in the registry is the type of a label, not the type of an entity. Until
  now the two were the same list. `claim` is the first label type that isn't a KB
  entity: a claim has no file and no page, and its label is chosen by the entity
  that holds it. Step 1 has the code changes this needs.
- Every variant defines every case key its locale declares, as for entities. That is
  8 variants with 13 Hungarian cases each. The cases the templates use today are
  `acc`, `ine`, `ins`, `pl`, `poss` and `poss-ine`. No new case key is needed.
- `canonical` may start with a capital when the word is a proper noun.
  `validateEntityLabelRegistry` in the same file rejects any uppercase today, which
  `Peano-axióma` fails. The check changes to compare the canonical word with its first letter
  aside. Entity templates capitalize the word and claim templates don't, so the
  canonical form has to carry the capital itself.
- Variant keys are the same in every locale, as for entities. A locale that needs no
  special word for the ring axioms still defines `ring-axiom`, with whatever it
  calls them.

**No `point` variant.** `pont` is not what a claim is, so an entity never declares
it. See [The `pont` family](#the-pont-family).

### Entity files

A definition, theorem or remark names the noun of its claims with `claim-label`, or
omits it to get the default:

```yaml
name: gyuru-test
claim-label: ring-axiom
```

One field for all the entity's claims. The data has no entity whose claims need
different nouns from each other, so a claim block gets no field of its own.

The default is `statement`. It is the most common noun (28 parents), it is what the
knowledge-base panel says today, and the 13 parents cited only as `pont` never
render it in a reference. A default per parent type was considered and left out:
theorems would still need `statement`, and the definitions and remarks that use a
noun at all each use their own.

### Template context

A claim target gets `label`, next to `index`, `name`, `type` and `parent`:

| Target type | Fields |
|---|---|
| `claim` | `index`, `name`, `type`, `label`, `parent.index`, `parent.label` |

`target.label` is `entityLabels(locale, 'claim', parent['claim-label'])`, in the
existing `EntityLabels` shape, so `base`, `suffix`, `inflect` and `.canonical` work
on it unchanged. `buildContext` fills it, and the claim shape in
`packages/display-templates/src/check.ts` declares it, which is what lets the
template check accept the new templates. The case key check already covers any
`target.label` path.

`buildContext` is in `packages/display-templates/src/context.ts`, shared by the
website and the editor. It reads the parent from the content outline, as an
`OutlineEntity` (`packages/content-model/src/outline.ts`), which carries the
entity's `label` and not yet the noun of its claims. So the outline entity gains a
`claimLabel` field, and whoever builds the outline fills it: `outlineEntity` in
`apps/website/lib/content/outline.ts` for the site, and the editor's loader for the
editor. The editor then needs no claim logic of its own.

### Templates

The 29 single-claim noun templates collapse to 11, one per shape:

| New template | Renders, for a `property` and a `ring-axiom` | Replaces |
|---|---|---|
| `the-index-claim-label` | a [3. tulajdonság], a [2. gyűrűaxióma] | 8 |
| `index-claim-label` | [3. tulajdonság] | 6 |
| `index-claim-label-acc` | [3. tulajdonság]ot, [2. gyűrűaxiómá]t | 4 |
| `the-parent-index-label-per-index-claim-label` | a [24.5. Tétel szerinti 3. tulajdonság] | 4 |
| `the-parent-index-label-per-index-claim-label-acc` | a [18.1. Definíció szerinti 2. gyűrűaxiómá]t | 1 |
| `the-parent-index-label-index-claim-label-poss` | a [24.1. Tétel 2. állítása] | 1 |
| `index-claim-label-poss` | [2. állítás]a | 1 |
| `index-claim-label-poss-ine` | [2. állítás]ában | 1 |
| `index-claim-label-pl` | [2. gyűrűaxiómá]k | 1 |
| `the-index-claim-label-ine` | az [1. axiómá]ban | 1 |
| `the-index-claim-label-ins` | az [1. Peano-axiómá]val | 1 |

The indexes are examples. The names follow the collection's pattern and are reviewed
by hand before the rewrite, as in the display templates migration.

Seven of today's templates, with 12 references between them, put the case ending
inside the link, where the registry's split puts it after: `index-statement-acc`,
`index-statement-poss`, `the-parent-index-label-index-statement-poss`,
`index-ring-axiom-acc`, `index-ring-axiom-pl`, `index-peano-axiom-acc` and
`the-parent-index-label-per-index-order-axiom-acc`. The accusative is already
inconsistent: `[3. tulajdonság]ot` has the ending outside and `[2. gyűrűaxiómát]`
inside. A template that reads `base` and `suffix` moves the link boundary by one or
two letters and changes no text. Each such reference goes into the manifest of
intended changes, or its template uses `inflect` inside the link to keep today's
boundary. Decide per template in step 4.

The 11 noun list templates collapse to 9:

| New list template | Renders, for two claims | Replaces |
|---|---|---|
| `the-indexes-claim-label` | a [2.] és [3. tulajdonság] | 2 |
| `each-the-index-claim-label` | a [2.] és a [3. gyűrűaxióma] | 2 |
| `each-the-index-claim-label-pl` | a [2.] és a [3. állítás]ok | 1 |
| `the-indexes-claim-label-acc` | a [2.] és [3. gyűrűaxiómá]t | 1 |
| `indexes-claim-label-acc` | [2.] és [3. állítás]t | 1 |
| `indexes-claim-label-pl` | [2.] és [3. gyűrűaxiómá]k | 1 |
| `indexes-claim-label` | [2.] és [3. axióma] | 1 |
| `the-parent-index-label-per-indexes-claim-label` | a [24.5. Tétel szerinti 2.] és [3. tulajdonság] | 1 |

The ninth, `the-parent-index-label-indexes-statement-pl-poss`
(`a [24.1. Tétel 2.] és [3. állítás]ai`), keeps its word. It needs a plural
possessive, which is not a Hungarian case key today, and two citations don't justify
adding one to every variant.

Every claim list template groups by `parent`. An entity has one claim noun, so a
group never mixes nouns, and `groupKeys` needs no `label` group for claims.

The six templates without a word and the 34 `pont` templates stay as they are. Ten
of the 80 templates are cited by no claim today, three of them noun templates.
Removing those is a cleanup that doesn't depend on this plan.

### Minority references

Five parents are cited with two nouns other than `pont`:

| Parent | Nouns | Likely reading |
|---|---|---|
| `definitions.gyuru-test` | `ring-axiom` 34, `axiom` 8 | `axióma` is the short form |
| `definitions.peano-axiomarendszer` | `axiom` 10, `peano-axiom` 6 | `axióma` is the short form |
| `theorems.reszcsoport-feltetele` | `property` 9, `condition` 3 | either word fits |
| `theorems.gyuru-reszbenrendezesenek-tulajdonsagai` | `statement` 10, `property` 2 | strays |
| `theorems.asszocialtsag-tulajdonsagai` | `property` 7, `statement` 1 | one stray |

The entity declares the majority noun, with one proposed exception: the Peano
definition declares `peano-axiom` although `axióma` is used more, because the short
form can stay a template of its own and the specific word can't. By count 20
citations are in the minority, and 24 with that exception. Each has three outcomes,
chosen in a review with the content owner like the `plural-in` one:

- take the declared noun, so the text changes and the reference goes into the
  manifest;
- keep a template with the word written in. This fits the short form: the three
  `axiom` templates stay, accepted on any claim, for the 18 citations that say
  `axióma` about a ring or Peano axiom;
- become a `text` item, for a one-off.

The "Likely reading" column is a guess from the counts. Nobody has read the
sentences yet.

### The `pont` family

A declared noun leaves these 34 templates alone, because their word doesn't depend
on the entity. They could still move their inflection into the registry, and three
ways were looked at:

| Option | Effect | Verdict |
|---|---|---|
| Leave `pont` written in the templates | 34 templates stay. Chapter and section templates write `fejezet` and `szakasz` the same way. | This plan |
| A `point` variant, and a template field that pins the variant `target.label` reads | Same 34 templates, with the forms in the registry. Needs five new Hungarian case keys (`poss-acc`, `poss-sub`, `pl-poss`, `pl-poss-dat`, `pl-poss-acc`), and every variant of every type has to define each one. | Not worth it for one word |
| The reference names the noun (`noun: point`) | One template per shape for every noun. Adds a second concept to every claim reference and to the picker, which decision 4 of the display templates plan rejected for `case`. | No |

What would shrink the family is unrelated to the noun: ten of its 25 single-claim
templates are used once or not at all,
and several differ only in link extent (`pontja]` against `pont]ja`) or in writing
`megjegyzés` where `target.parent.label.canonical` would do. Merging those is a
cleanup of the collection and can happen at any time. Step 4a of the display
templates plan also replaces some of them with list templates.

### Knowledge-base panel title

`kbPanelClaim` goes, and the panel title reads the registry: the index and the
entity's claim noun. This is the same move as `kbBacklinkKindProof` in the entity
labels plan. It is a visible change: the claims of the entities that declare a
`claim-label` get their own word in the panel title (`1. gyűrűaxióma`), and the rest
keep `1. állítás` through the default.

`kbMenuClaims` (`Állítások`) stays in `locales.json`. It is a menu title for the
section, not the name of one claim.

### Validation

The build fails on:

- a `claim-label` that isn't a `claim` variant in the entity's locale;
- a `claim-label` on a proof, which can't hold claims;
- a registry whose `claim` entry breaks a registry rule (default, kebab-case keys,
  the full case set).

A `claim-label` on an entity with no claim blocks is a warning from
`check-refs.mjs`, not an error. An author can set it before writing the claims.

A template that reads `target.label` on a claim whose parent declares nothing
renders the default. That is by design and not an error, so the editor preview is
where an author sees that the word is `állítás`.

### Editor

The entity header gets a second dropdown under the label one, for the claim noun
(`EntityLabelPicker.tsx` is the model). It shows on a definition, theorem or remark
that has at least one claim block, writes `claim-label`, and removes it when the
default is chosen. It also shows when the file's value isn't a known variant, so the
bad value is visible.

The template picker needs nothing new. It renders each template against the actual
target through the shared engine, so a claim's noun shows up in the previews once
the editor's context carries `label`. The popup lists the templates for the
target's kind, most used first, so a claim's list gets up to 20 entries shorter,
depending on how many written-in nouns the review keeps.

This depends on step 7 of the display templates plan. Its services side is under
way: the registry code, the collection and reference readers, the numbering and the
template context are all in the packages, and the content checker is built from
them. The editor side has not started. The editor reads `entity-labels.json` from
the services checkout, so the claim variants reach it without an editor release.
The dropdown itself is editor code.

## Steps

### 1. Registry (services)

Add the `claim` entry to `entity-labels.json` with all 8 variants and 13 cases. The
content owner reviews the Hungarian forms before the commit.

The registry code in `packages/content-model/src/entity-labels.ts` treats label
types and KB entity types as one list in three places: `EntityLabelLocale` is keyed
by `KbEntityType`, the registry check walks `KB_ENTITY_TYPES`, and `labelType`
throws on any other type. Give those three a list of label types of their own, and
leave `KB_ENTITY_TYPES` to mean entities. Relax the lowercase check for a leading
capital. Extend
`packages/content-model/test/entity-labels.test.ts`. The website's
`lib/i18n/entity-labels.ts` only binds the registry file to those functions, so it
needs no change beyond its re-exports.

### 2. Loader and context (services)

The loader reads `claim-label` on definitions, theorems and remarks, checks it, and
rejects it on a proof. `readLabel` in `apps/website/lib/content/loader.ts` is the
model. `OutlineEntity` in `packages/content-model` gains `claimLabel`, and
`outlineEntity` in `apps/website/lib/content/outline.ts` copies it from the graph
node. `buildContext` in `packages/display-templates/src/context.ts` adds `label` to
a claim target, and the claim shape in `check.ts` declares it.
`packages/display-templates/test/context.test.ts` compares the two, so it fails
until both change. Bump `RAW_GRAPH_VERSION` from its value at the time (6 on this
branch), since the raw entries gain a field. Unit tests.

Steps 1 and 2 change the sources of `packages/content-checker/content-checker.mjs`.
Regenerate it with `pnpm --filter @youproof.org/content-checker generate` and
commit it with each of those steps. The pull request check and the deploy both fail
when the committed file is out of date.

### 3. Panel title (services)

Remove `kbPanelClaim` and its `LabelKey` entry in `lib/i18n/config.ts`. No test
names the key today, so add one for the new title. `KbEntityPage.tsx` and
`ReferencePanel.tsx` build the title from the registry. Skip this step if the
decision goes the other way.

### 3a. Docs (services)

Update `docs/content-site-and-static-generation.md` and `docs/i18n-design.md` where
they describe labels and reference templates.

Version: the label and template changes ship as one release, 2.4.0, from
`references-refactor`. This phase comes after it, so it gets its own bump, to
2.5.0. If it ends up in that release, it gets none.

### 4. Content migration (content repo)

A one-off script, on a branch off the content branch that holds the migrated
references (see [Delivery](#delivery)):

- sets `claim-label` on each entity whose claims are cited with a noun other than
  `pont` and other than the default. From the data that is the 12 `property`
  theorems, the `condition` theorem and the four axiom definitions;
- adds the 19 templates to the collection under reviewed names;
- rewrites each reference that uses one of the 40 noun templates to the matching
  new template, when the noun is the parent's declared one;
- lists the minority references for review and leaves them unchanged until each
  has a decision;
- removes the noun templates that nothing uses any more.

The script stops if a rewritten reference would render different text, so a wrong
`claim-label` can't pass.

Update the "Labels System" and "References System" sections of
`docs/content-model.md`, the template name pattern there, and the content repo's
`CLAUDE.md` and `.claude/skills/link-references/SKILL.md` where they describe claim
templates.

### 5. Content-side check (content repo)

`scripts/check-refs.mjs` no longer keeps its own copy of the template rules. It
runs the build's checks from `packages/content-checker/content-checker.mjs`, a
committed file that services generates from the packages, and it reads
`entity-labels.json` beside it. So the work splits in two:

- **Comes with services.** The template checks, including the claim shape that
  allows `target.label` and the case key check on it, reach the script through the
  regenerated checker (step 2). Nothing is written in the content repo for them.
- **Written in the script.** The entity field checks are still the script's own,
  line by line: `label` is checked against the registry there today. Add the same
  for `claim-label`: it is a `claim` variant of the entity's locale, and it sits on
  a definition, theorem or remark. Warn on a `claim-label` in a file without claim
  blocks.

`ref-check.yml` downloads the checker and the registry from services
`stable/staging`. Until this plan's services change is there, a content pull
request that uses a template reading `target.label` on a claim fails the check, and
so does one that sets `claim-label`. Run the script locally against the services
branch until then, as the entity labels plan did.

### 6. Output equivalence check

Reuse the check in `docs/plans/centralize-display-templates/equivalence`. Its
`layer1.mjs` keys every reference by source file and position and dumps the
resolved segments, so it shows a changed noun and a moved link boundary as
different things. `build.sh` and `layer2.mjs` still come from
`docs/plans/centralize-entity-labels/equivalence`. Two additions:

- `layer1.mjs` dumps the reference panels' targets and order, not the claim panel
  titles. Add the titles that `KbEntityPage.tsx` and `ReferencePanel.tsx` build;
- `layer1-diff.mjs` has a mode per step of that plan (`step4`, `step4a`). Add one
  for this migration, with its own intended-changes file next to this plan.

The intended changes are:

- the minority references whose review chose the declared noun;
- the references whose link boundary moves (see [Templates](#templates));
- the panel titles of the entities that declare a `claim-label`, checked by rule:
  each title must be the index and the declared noun.

Everything else must be identical.

### 7. Editor (editor repo)

This comes after the nine editor steps of the display templates plan, which end
with editor 2.0.0. Those steps have the editor bundle the shared packages from the
services checkout and build the content outline from what it loads. On top of that:

1. Read `claim-label` in the editor's loader and pass it into the outline entity as
   `claimLabel`. The shared `buildContext` then gives the template previews the
   claim noun.
2. Add the claim noun dropdown to the entity header.
3. Release a new editor version, built against a services checkout that has step 2.

Add the checks that need a real VS Code window to a manual test list next to this
plan, as `docs/plans/centralize-display-templates/editor-manual-tests.md` does for
2.0.0: the dropdown writes and removes the field, and the previews of a claim
reference follow it.

Separate PR. An editor that predates it can't set the noun, and its previews of a
template that reads `target.label` on a claim fail the shared template check.

Check first whether editor 2.0.0 keeps a top-level field it doesn't know when it
saves an entity file. Editor 1.3.0 dropped the `references` list that way, which is
why the display templates plan releases the editor first. If 2.0.0 would drop
`claim-label`, this editor version has to be out before authors edit migrated
content.

## Delivery

- Services: branch `claim-noun-registry`, which carries `references-refactor`. That
  branch holds the label and the template changes and reaches `development` in one
  PR, as one release. Merge it in again as it moves, and merge `development`
  instead once it has landed. One commit per step, with approval before each commit.
- Content: a branch off `content/yp-94-chapter-26` after the content
  `references-refactor` branch is merged back into it, and after step 4a of the
  display templates plan, so the claim lists are already list templates when this
  migration runs. If chapter 26 is still being finalized there, the same rule
  applies as for that migration: nothing else merges meanwhile, or the script is
  rerun on conflict.
- Editor: before the content migration reaches a branch authors edit, if the check
  in step 7 shows an older editor would drop `claim-label`. Otherwise in any order.
- Both mismatched pairs are safe, so this needs no freeze and no `pr-gate` bypass:

| Pair | Result |
|---|---|
| New services, old content | Builds and renders as before. No entity declares a `claim-label`, and the old templates are still valid. Only the panel title can differ, and without a `claim-label` it doesn't. |
| Old services, new content | Build fails before the upload. The template check rejects `target.label` on a claim, and `doc-examples` loads the whole graph in the unit-test step. |

  Services goes first, then content. Content pull requests are checked with the
  services code on `stable/staging` (step 5), which is one more reason for that
  order.

## Non-goals

- Shrinking the `pont` family (see [The `pont` family](#the-pont-family)).
- A noun per claim block.
- The 23 `disztributivitási szabály` references. They name one claim by what it
  says, not by its number, and stay `text` items.
- A `label` group for claims in list templates. Every claim list groups by
  `parent`, which already keeps one noun per group.
- Labels for chapters and sections (see open question 9).

## Open questions

| # | Question | Proposal |
|---|---|---|
| 1 | Is 80 to 60 templates worth a registry entry, a content field and an editor control? | Yes, mostly for what it fixes beyond the count: the panel title, one place for the inflected forms, and words ready for the English locale. Worth confirming before step 1. |
| 2 | Default noun | `statement` for every parent type |
| 3 | Does the knowledge-base panel title read the registry | Yes |
| 4 | The minority references | Review one by one. Keep the three `axiom` templates for the short form, and declare `peano-axiom` on the Peano definition. |
| 5 | Templates whose case ending is inside the link today | Move the boundary and list the change, unless the review prefers `inflect` |
| 6 | Does `pont` move into the registry | No |
| 7 | Field name | `claim-label` |
| 8 | Rename the registry from entity labels to labels, now that a type in it is a label type | Yes for the concept and the code names. The file name `entity-labels.json` is read by path from the editor, from `check-refs.mjs` and from `ref-check.yml`, so renaming it is cheapest on `references-refactor`, before editor 2.0.0 and the 2.4.0 release. After that it needs the three repos to change together. |
| 9 | Do `fejezet` and `szakasz` become label types too | They fit the same shape, with one variant each and `target.label` on chapter and section targets. It removes no template, since each type has one word, but 18 templates write one of the two words today, most with a case ending, and the English locale needs its own words. The list templates write `fejezeteket`, a plural accusative, which would be a new case key for every variant. Proposal: a follow-up after this plan, not part of it. |
