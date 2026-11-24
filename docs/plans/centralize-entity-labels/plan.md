# Centralize KB entity labels

Replace the per-entity `labels` blocks with one registry of labels per locale, per
KB entity type, per variant. An entity names its variant; the words and their
inflected forms live in the registry.

## Current state

The type word is defined in three places in this repo:

- `ENTITY_LABEL_HU` in `apps/website/lib/content/display-template.ts`, the fallback
  word per type, also read by `kbTypeLabel` in `apps/website/lib/content/graph.ts`
  and by `apps/website/components/content/EmbeddedEntity.tsx`.
- `TYPE_LABELS` in `apps/website/components/content/blocks/RecallBlock.tsx`, with
  abbreviated Hungarian forms.
- `kbBacklinkKindProof` and `kbBacklinkKindRemark` in
  `apps/website/lib/i18n/locales.json`.

In the content repo, 160 of 578 KB entities carry their own block:

```yaml
labels:
  canonical: lemma
  cases:
    in: { base: lemmá, suffix: ban }
```

Each block lists only the cases its author needed. Measured problems:

- **Theorems use three words.** `tétel`, `lemma` (32 entities) and `következmény`
  (13 entities) are all type `theorem`.
- **Case keys are inconsistent.** `to` means `-hoz/-hez` in most files, `-nek` in one
  and `-re` in another. `of-2` and `of-of` both mean `-jának`. `plural` splits as
  `tétel` + `ek`, `plural-in` as `tételek` + `ben`.
- **Missing cases fail silently.** `base(case, label)` falls back to `canonical` and
  `suffix(case, label)` to `''`, so a reference to an entity without that case
  renders the bare word where an inflected one was written.
- **Base and suffix are mixed across cases.** 18 references use
  `base('plural-in', …)` with `suffix('in', …)`. Seen on definition targets, which
  carry no `plural-in`, so these likely render the singular word today.

The base/suffix split is required and stays. Every inflected display template puts
the base inside the link text and the suffix after it, for example
`{the(target.index)} [{target.index} {capital(base('ine', target.label))}]{suffix('ine', target.label)}`.
The base can differ from `canonical` (`lemmá` + `ban`), so suffixes alone are not
enough. The `inflect()` builtin is unused in the content.

## Design

### Registry

New file `apps/website/lib/i18n/entity-labels.json`:

```json
{
  "hu": {
    "theorem": {
      "default": "theorem",
      "variants": {
        "theorem":   { "canonical": "tétel",        "cases": { "ine": { "base": "tétel",        "suffix": "ben" } } },
        "lemma":     { "canonical": "lemma",        "cases": { "ine": { "base": "lemmá",        "suffix": "ban" } } },
        "corollary": { "canonical": "következmény", "cases": { "ine": { "base": "következmény", "suffix": "ben" } } }
      }
    },
    "definition": { "default": "definition", "variants": { "definition": { "canonical": "definíció", "cases": {} } } },
    "proof":      { "default": "proof",      "variants": { "proof":      { "canonical": "bizonyítás", "cases": {} } } },
    "remark":     { "default": "remark",     "variants": { "remark":     { "canonical": "megjegyzés", "cases": {} } } }
  }
}
```

(Cases abbreviated. The registry lists every case the content uses, for every
variant.)

Rules:

- Variant keys are kebab-case symbolic names and are the same in every locale. A new
  locale adds words and cases, never keys.
- `default` names one of the type's own variants.
- `canonical` is lowercase, as today. Callers capitalize.
- No short or abbreviated form.
- Case keys are fixed per locale. The Hungarian set is below.

### Hungarian case keys

Grammatical names, after the Leipzig glossing abbreviations:

| Key | Case | Suffix | Replaces |
|---|---|---|---|
| `ine` | inessive | -ban/-ben | `in` |
| `ela` | elative | -ból/-ből | `from` |
| `acc` | accusative | -t | `obj` |
| `all` | allative | -hoz/-hez | `to` where it meant -hoz/-hez |
| `dat` | dative | -nak/-nek | `to`, `for` where they meant -nak/-nek |
| `sub` | sublative | -ra/-re | `to`, `onto` where they meant -ra/-re |
| `ins` | instrumental | -val/-vel | `with` |
| `pl` | plural nominative | -k/-ek | `plural` |
| `pl-ine` | plural inessive | -kban/-ekben | `plural-in` |
| `poss` | possessive | -ja/-je | `of` |
| `poss-dat` | possessive dative | -jának/-jének | `of-2`, `of-of` |
| `poss-ine` | possessive inessive | -jában/-jében | `in-of` |
| `poss-ela` | possessive elative | -jából/-jéből | `from-of` |

The final set is whatever the content needs after migration. A key with no use is
left out.

### Entity files

An entity names its variant with `label`, or omits it to get the type's default:

```yaml
label: lemma
```

The `labels` block is removed from the content model. The loader rejects it.

### Accessor and validation

`entityLabels(locale, type, variant?)` returns the existing `EntityLabels` shape
(`{ canonical, cases }`), so `base`, `suffix` and `capital` in
`display-template.ts` keep working unchanged. The build fails on:

- an unknown `label` variant for the entity's type;
- a `labels` block in an entity file;
- a display template that asks for a case the target's variant does not define;
- a registry entry whose `default` is not one of its variants, or whose variant key
  is not kebab-case.

## Steps

### 1. Registry and accessor (services)

Add `entity-labels.json`, its types, the accessor and the registry checks, with unit
tests.

### 2. Point code at the registry (services)

- Remove `ENTITY_LABEL_HU`. `display-template.ts`, `kbTypeLabel` in `graph.ts` and
  `EmbeddedEntity.tsx` read the registry.
- `RecallBlock` shows the variant's capitalized `canonical`. It needs the locale and
  the target's variant, passed from `ContentBlocks`.
- Remove `kbBacklinkKindProof` and `kbBacklinkKindRemark`. `kbChainBelowTop` reads
  the registry.
- `definitionsIndex` and `theoremsIndex` stay in `locales.json`. They are page titles.
- Update the comments in `apps/website/lib/i18n/config.ts` that name the removed
  constant and keys.

### 3. Loader (services)

The loader reads `label`, resolves it through the registry, and rejects `labels`.
Add the display-template case check. Steps 1 to 3 merge together with the content
change, since the loader no longer accepts the old format.

### 4. Content migration (content repo)

Branch `centralize-entity-labels` off `content/yp-94-chapter-26`, so the next content
release carries the change.

A one-off script:

- replaces each `labels` block with `label: <variant>` (`lemma` for canonical
  `lemma`, `corollary` for `következmény`), or deletes it where the canonical word is
  the type default;
- rewrites each case key in display templates to its grammatical key, choosing
  between `all`, `dat` and `sub` by the suffix the target's old block gave;
- reports every reference whose case its target did not define, including the 18
  `plural-in` references, for review instead of guessing.

Update the "Labels System" section of `docs/content-model.md`.

### 5. Verification

Build `out/` with the current services and content, then with both branches, and
diff the two. Expected differences:

- recall blocks show the full word instead of `Def.`, `Biz.` and `Megj.`;
- references that rendered a bare word through the silent fallback now render the
  inflected form.

Any other difference is a migration bug. Each expected difference is listed for
review before merging.

### 6. Editor (editor repo)

`media/src/editor/LabelsEditor.tsx` becomes a variant picker for the entity's type,
writing `label`. It needs the variant list, which it reads from the registry or keeps
as its own copy. Separate PR.

## Delivery

- Services: branch `centralize-entity-labels` off `development`. One commit per step,
  with approval before each commit.
- Content: branch `centralize-entity-labels` off `content/yp-94-chapter-26`.
- Services and content are deployed together. No dual-format release.
