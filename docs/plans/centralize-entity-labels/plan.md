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
  abbreviated Hungarian forms. The content has no `recall` blocks left, so this is
  dead code and goes away with the rest of the recall block support (step 2a).
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
  `base('plural-in', …)` with `suffix('in', …)`, all on theorem targets. Only
  `theorems.peano-szorzas-disztributivitas` carries a `plural-in` (`tételek` + `ben`),
  so the other 17 render the singular word today.

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
    "cases": ["ine", "ela", "acc", "all", "dat", "sub", "ins", "pl", "pl-ine", "poss", "poss-dat", "poss-ine", "poss-ela"],
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

(Variant cases abbreviated.)

Rules:

- Variant keys are kebab-case symbolic names and are the same in every locale. A new
  locale adds words, never variant keys.
- `default` names one of the type's own variants.
- `canonical` is lowercase, as today. Callers capitalize.
- No short or abbreviated form.
- Each locale declares its own case keys in `cases`. Locales differ grammatically, so
  their sets differ: a locale can have keys another lacks, and a locale without
  inflection can declare none.
- **Every variant in a locale defines every case key that locale declares, and no
  others.** So every theorem, lemma and corollary inflects the same way, and a
  template's case is valid for any target as long as the target's locale declares
  it. The Hungarian set is below.

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
- a display template whose `base` or `suffix` names a case key the target's locale
  does not declare (this covers `target.label` and `target.parent.label`);
- a registry entry whose `default` is not one of its variants, or whose variant key
  is not kebab-case;
- a variant that is missing one of its locale's case keys or defines one the locale
  does not declare.

A loader error names the file. A template error names the reference key and its
owner, such as `definition "x"` or `section "x" of "y"`, plus the case keys the
target's locale declares. Graph nodes don't record their source file, and the other
graph checks (`validateReferences`, `validateTermInsertions`) name the owner the same
way. A missing case never falls back to the canonical word.

## Steps

### 1. Registry and accessor (services)

Add `entity-labels.json`, its types, the accessor and the registry checks, with unit
tests.

### 2. Point code at the registry (services)

- Remove `ENTITY_LABEL_HU`. `display-template.ts`, `kbTypeLabel` in `graph.ts` and
  `EmbeddedEntity.tsx` read the registry.
- Remove `kbBacklinkKindProof` and `kbBacklinkKindRemark`. `kbChainBelowTop` reads
  the registry. Delete their assertions in
  `apps/website/test/locale-labels.test.mjs` and their entry in the `LabelKey`
  union in `config.ts`.
- `definitionsIndex` and `theoremsIndex` stay in `locales.json`. They are page titles.
- Update the comments in `apps/website/lib/i18n/config.ts` that name the removed
  constant and keys.

### 2a. Remove recall blocks (services)

No content uses `recall` blocks any more, so their support goes from all three repos.
In services:

- delete `components/content/blocks/RecallBlock.tsx` and `recall-block.module.scss`;
- drop the `recall` case and import from `components/content/ContentBlocks.tsx`;
- drop the `RecallBlock` type and its union member from `lib/content/types.ts`, and
  its re-export from `lib/content/index.ts`;
- drop the `recall` branch from the loader's target normalization;
- remove `recall` from `docs/content-site-and-static-generation.md` and
  `docs/i18n-design.md`.

Old plans under `docs/plans/` and the archived inputs under `lost+found/` keep their
mentions. They describe the past.

### 3. Loader (services)

The loader reads `label`, resolves it through the registry, and rejects `labels`.
Add the display-template case check.

Step 2 leaves an authored `labels` in front of every registry lookup
(`entity.labels ?? entityLabels(…)`), so its output matches the current content. This
step replaces each of those with a lookup of the entity's own variant,
`entityLabels(locale, type, label)`, and removes the `labels` field:

- the `labels ??` fallbacks in `buildContext` in `lib/content/display-template.ts`,
  and the `labels?.canonical ??` ones in `kbTypeLabel` and `kbChainBelowTop` in
  `lib/content/graph.ts`;
- the `canonicalLabel` prop of `components/content/EmbeddedEntity.tsx` and the
  `entity.labels?.canonical` that `components/content/ContentBlocks.tsx` passes it;
  `EmbeddedEntity` gets the variant instead;
- the `labels` field on the four node types in `lib/content/types.ts` and
  `lib/content/graph.ts`, where the graph copies it, and where the loader reads it in
  `lib/content/loader.ts`. Each is replaced by `label`.

`EntityLabels` and `InflectedForm` stay, since `entityLabels` returns that shape.

Bump `RAW_GRAPH_VERSION` in `lib/content/graph.ts`, since `label` replaces `labels`
on the raw entries. Without the bump, a dev-mode graph cache written before the change
rehydrates entities without `label` and renders the default word for every lemma and
corollary.

The rejection must fail the deploy's `website` job, naming the file. The deployment
order depends on it: a build with the new services and the old content has to fail
before anything is uploaded, so the environment keeps serving its previous export. A
warning or a fallback would upload wrong output instead (see the runbook).

With old content it fails twice before the upload, and the first one stops the job.
The unit-test step runs first, and `test/doc-examples.test.mjs` loads the whole content
graph, so it fails on the first `labels` block. `next build` would fail on the same
error. PR CI has no content clone and skips `doc-examples`, so the services PR stays
green. Locally, `pnpm test` fails that one test until the content is migrated.

### 3a. Version (services)

Bump `apps/website/package.json` from `2.3.2` to `2.4.0`. This is a breaking change to
the content contract, and the footer shows this version. `tag-release` in
`.github/workflows/deploy.yml` creates the `v2.4.0` tag on the first successful
production deploy of this commit.

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

The 17 `plural-in` references whose target has no `plural-in` render the singular
today (`[Tétel]ben`). Moving them to `pl-ine` would make them plural (`[Tétel]ekben`),
which may not be what each sentence means. Review them one by one with the content
owner, and decide for each whether it becomes `pl-ine` or stays singular as `ine`.
The script leaves them unchanged until that decision is made.

Update the "Labels System" section of `docs/content-model.md`.

Remove the recall block from the content repo's docs and tooling, as its own commit:

- `docs/content-model.md`: the `recall` row in the block table and the mentions next
  to `embed`;
- `CLAUDE.md`: the embed/recall target check;
- `scripts/check-refs.mjs`: the embed/recall wording in its header, comment and error
  message.

`scripts/migrate-ref-targets.mjs` is a finished one-off migration and the
`docs/plans/` files describe the past, so they stay as they are.

### 4a. Content-side check (content repo)

The services build is the only place that catches a bad label or case key today, and
content PRs never build the site. So a typo surfaces only when the staging deploy
fails after the merge to `draft`. Extend `scripts/check-refs.mjs` to check the same
rules from the content repo:

- every entity's `label` is a variant of its type in its locale;
- every `base(...)` and `suffix(...)` call in a reference's `display` names a case key
  the target's locale declares. The script already resolves every reference target to
  its file, so it knows the target's locale.

The script stays dependency-free and line-based like the rest of it. It reads the
registry from the services repo, since the registry lives there:

- locally, from a services checkout given by `--registry <path>` or `SERVICES_DIR`;
- in CI, from `stable/staging` through the GitHub API, using the existing
  `SERVICES_REPO_TOKEN`. Content on `draft` is built with `stable/staging` (see the
  runbook), so that's the registry it has to match.

`check-refs.mjs` isn't run by any workflow today. Add a `pull_request` workflow that
runs it, modelled on `slug-check.yml`, as a separate commit. It also starts checking
every reference rule the script already enforces, so run it over the whole tree first
and fix any existing problems before it can block anything.

During the runbook, `stable/staging` only gets the registry at step 5, so this CI
check fails on content PRs until then. Content PRs into `content/yp-94-chapter-26`
should run it locally against the `centralize-entity-labels` services checkout.

### 5. Output equivalence check

The rendered output must be the same before and after, except for an explicit list of
intended changes. The check is deterministic: pinned inputs, a control run that
proves the comparison ignores build noise, and an exact match against the list of
intended changes.

**Pinned inputs.**

| Build | Services | Content |
|---|---|---|
| Baseline | merge-base of `centralize-entity-labels` and `development` | the `content/yp-94-chapter-26` commit the content branch forked from |
| Candidate | `centralize-entity-labels` tip | `centralize-entity-labels` tip |

Both builds use the same machine, Node version, TeX Live and `SITE_ENV`. Use the
staging page set, which is a superset of production's, so every page that can
render a label is covered.

**Layer 1: label strings.** A script outside both checkouts loads each build's
content graph through the functions both versions export, and writes one sorted JSON
file per build with:

- every reference's resolved display text, keyed by source file and reference key;
- every KB entity's `kbNodeLabel` and `kbNodeTitle`;
- every KB entity's `kbEntityRowLines`, which is what the deferred backlink rows and
  the outgoing-reference panel show;
- every embedded entity's heading.

The two files are diffed key by key. This layer names each difference by its source,
so a migration bug points to the file and reference that caused it.

**Layer 2: the export.** Diff the two `out/` trees as a catch-all for anything layer 1
doesn't read:

- The file lists must match exactly.
- Each HTML page, `.txt` payload and decoded flight file is compared after
  normalization. The payloads matter because the backlink rows are only in the
  payload, not in the markup.
- Normalization replaces the Next build ID, content-hashed asset and flight file
  names, and the footer version with placeholders. It also drops sitemap `lastmod`
  and structured-data `dateModified`, which move for every migrated file because
  they come from git commit dates. Nothing else is normalized.

**Control run.** Build the baseline twice and run layer 2 on the pair. It must report
zero differences. If it doesn't, the normalization misses some build noise, and the
real comparison can't be trusted until that's fixed.

**Intended changes.** The migration script (step 4) writes a manifest of every
intended difference, with old and new text:

- references whose target had no case for the template, which rendered the bare word
  and now render the inflected one;
- the 18 `plural-in` references, once reviewed. The registry splits `pl-ine` as the
  singular base plus the whole plural ending (`tétel` + `ekben`), like `pl`. Each of
  the 17 that render the singular today is listed with the outcome of its review in
  step 4: unchanged if it stays `ine`, `[Tétel]ben` to `[Tétel]ekben` if it becomes
  `pl-ine`. `in-the-peano-szorzas-disztributivitas-theorem` in
  `books/alice-es-bob/03-a-matematika-epitmenye/12-alice-es-bob-rendet-tesz/08-hol-tartunk-most.yaml`
  changes its link text from `Tételek` + `ben` to `Tétel` + `ekben`.

The check passes only when the set of differences found equals the manifest exactly:
every difference is listed in the manifest, and every manifest entry shows up as a
difference. Run it before opening the services PR and again after the last content
change before the release.

### 6. Editor (editor repo)

The Labels tab goes. In its place, the entity header shows a dropdown of the variants
for the entity's locale and type, next to the title (`EntityLabelPicker` in
`media/src/editor/EntityHeader.tsx`). It writes `label`, and removes it when the
default is chosen.

- The dropdown shows only when the type has more than one variant, which is
  theorems today. It also shows when the file's `label` isn't a known variant, so
  the bad value is visible.
- A file that still has a `labels` block gets a hint under the header on every type,
  and saving it is refused. Dropping the block would lose data, and keeping it would
  break the site build.

The editor keeps no copy of services data. At startup and on every content reload,
the extension host reads `apps/website/lib/i18n/entity-labels.json` and
`apps/website/lib/i18n/locales.json` from a services checkout. That replaces the
hand-kept `LOCALES` list in `src/content/locales.ts`. Two new settings:

- `youproof.servicesRoot`: the services checkout, absolute or relative to the
  workspace. It defaults to a `services` folder beside the content repo, the same
  layout `check-refs.mjs` assumes.
- `youproof.defaultLocale`: the locale the editor opens with. It defaults to the
  first locale in `locales.json`, and a locale that isn't configured is an error. A
  file without `locale:` still counts as the first locale, which is the website's
  default when its `DEFAULT_LOCALE` build setting is unset, not as this setting.

A missing or broken `locales.json` is an error, and no content loads. A missing or
broken `entity-labels.json` is an error too, but content still loads, without the
dropdown.

Separate PR.

The same PR removes the recall block, as its own commit. The editor can't create one
(`recall` isn't in `CREATABLE_BLOCK_TYPES` in `media/src/editor/blocks/createBlock.ts`),
but it still loads, shows, retargets and saves existing ones:

- `media/src/editor/blocks/RecallBlock.tsx`, and its import, title and component
  entries in `media/src/editor/BlockView.tsx`;
- the `recall` branch in `media/src/editor/hooks/useTargetSelection.ts`;
- the `RecallBlock` model type and its loader case in `src/content/model.ts` and
  `src/content/loader.ts`;
- `ContentRecallBlock` and its union member in `src/protocol/contentTypes.ts`, which
  `media/src/shared/types.ts` re-exports;
- the three `recall` checks in `src/handlers.ts`;
- the `recall` mentions in `docs/extension-messaging.md`, whose block list then
  counts 11 types instead of 12.

`src/content/fqn.ts` is still a hand-kept copy of services' `lib/content/fqn.ts`.
Whether to remove it is a separate decision, not part of this step.

## Delivery

- Services: branch `centralize-entity-labels` off `development`. One commit per step,
  with approval before each commit.
- Content: branch `centralize-entity-labels` off `content/yp-94-chapter-26`, merged into
  that branch when done, so it ships with chapter 26.
- No dual-format release. The two sides go out by the runbook below.

## Deployment runbook

The pipeline doesn't deploy a services change and a content change at the same time.
Each deploy builds one side's new tip with the other side's current tip
(`.github/workflows/deploy-to-cloudflare.yml`):

- a push to `stable/staging`, or content landing on `draft`, deploys staging with
  `stable/staging` + `draft`;
- a push to `stable/production` deploys production with `stable/production` +
  `stable/released`;
- content landing on `stable/released` deploys production with the same pair.

So one environment always builds a mismatched pair for a while. The two mismatches
behave differently:

| Pair | Result |
|---|---|
| New services, old content | Build fails on the `labels` rejection. Nothing is uploaded, and the environment keeps serving its previous export. |
| Old services, new content | Build passes but renders wrong: the old loader ignores `label` and the old `base`/`suffix` don't know the new case keys. No gate catches it. |

**Services always goes first.** A failed build is safe because of how
`.github/workflows/deploy.yml` chains its jobs:

- the `website` job fails before the R2 upload;
- `quality-gate` runs only after a successful `website` job, so it is skipped;
- `rollback-dispatch` fires only when `quality-gate` fails, not when it is skipped, so
  no rollback starts;
- `zone`, `website-infra`, `worker` and `newsletter-worker` still apply, but the
  worker manifest comes from the same old content, so they change nothing;
- `tag-release` is skipped and runs on the next successful production deploy instead.

### Steps

1. **Hold the services PR off `development` until chapter 26 is ready for `draft`.**
   Promotions are wholesale: once this change is on `development`, no other services
   work can reach staging without carrying it.
2. **Merge the content `centralize-entity-labels` branch into
   `content/yp-94-chapter-26`.** That branch doesn't deploy anything, so this can
   happen whenever the content work is done.
3. **Run the output equivalence check** (step 5) on the final services and content
   tips. Release only on a pass.
4. **Freeze `stable/staging` and `draft`.** Nothing else merges into either until
   step 8. Step 8's gate needs the exact pair step 6 tests. Tell anyone watching CI
   that the red runs in steps 5 and 7 are expected.
5. **Services: merge the PR into `development`, then promote `development` →
   `stable/staging`.** The staging deploy builds the new services with the old `draft`
   and fails in the `website` job, at its unit tests, as expected. Staging keeps
   serving the old pair, and
   every staging deploy fails until step 6, so do step 6 right away.
6. **Content: `content/yp-94-chapter-26` → `draft`.** The staging deploy builds
   (new, new). It must pass and write the staging artifact for this pair. Check on
   staging:
   - the footer shows `v2.4.0`;
   - a lemma and a corollary show their own word;
   - inflected references keep their suffix after the link.
7. **Services: `stable/staging` → `stable/production`, bypassing `pr-gate`.** The gate
   looks for a staging artifact for the new services with the content that
   `stable/released` was promoted from. That pair was never built, so the gate fails.
   This is the only bypass in the sequence. The production deploy fails in the
   `website` job like step 5, and production keeps serving the old pair.
8. **Content: `draft` → `stable/released`.** Open the PR, or re-run its `pr-gate`, after
   step 7. The gate reads the second parent of `stable/production` when it runs, and
   now resolves to the pair step 6 tested, so it passes without a bypass. The
   production deploy builds (new, new), runs the quality gate, and `tag-release`
   creates `v2.4.0`.
9. **Verify production** with the step 6 checks, and confirm the `v2.4.0` tag exists.
   Lift the freeze.

### If something fails

- **Step 6 fails on staging.** Production is unaffected. Fix forward on the services
  side (`development` → `stable/staging`) or the content side (to `draft`); the freeze
  stays in place until step 6 passes.
- **The production quality gate fails after step 8.** `rollback.yml` redeploys the
  last passing production pair by exact SHAs, which is the old services with the old
  content. That pair is consistent, so readers get the previous site, not a broken
  one. The `.hu` smoke test is known to flake and can dispatch a rollback that isn't
  warranted, so check which step failed before treating it as real. Either way the
  fix rolls forward; the branches are never moved back.
