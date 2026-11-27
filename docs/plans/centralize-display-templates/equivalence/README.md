# Output equivalence check

The scripts for step 6 of [plan.md](../plan.md). They reuse `build.sh` and `layer2.mjs` from
[the entity labels check](../../centralize-entity-labels/equivalence/README.md) and replace layer 1,
which keyed a reference by its name and can't follow a reference that has no name any more.

| File | What it does |
|---|---|
| `layer1.mjs` | Dumps every reference occurrence keyed by source file and position (`ref <file>#<n>`, the n-th token the site reads in the file), with its targets and resolved segments, each file's text with the references filled in, the backlink trees, and per knowledge-base node the label, title, row lines, reference panel order and structured data. |
| `layer1-diff.mjs` | Compares two dumps. `step4`: occurrences and texts identical except the entries in `step4-intended-changes.json`, backlink counts checked by rule in both builds. `step4a`: the differences are exactly the step 4a manifest's places, backlinks identical. |
| `step4-intended-changes.json` | The one step 4 text change the migration recorded: a lemma's inessive taken from the label. |
| `layer2-classify.mjs` | Sorts the files of a `layer2.mjs` report into kinds of difference and lists the rest. |
| `scss-stub.mjs` | Lets `layer1.mjs` load `ReferencePanel.tsx`, which imports a CSS module. |

## Inputs

| Run | Base | Candidate |
|---|---|---|
| Step 4 | services `a52d905` + content `b4a3747` | services `references-refactor` + content `279f341` |
| Step 4, before the cleanup | services `a52d905` + content `a844bb1` | the same |
| Step 4a | services `references-refactor` + content `7204246` | services `references-refactor` + content `references-refactor` |

Check each one out as a detached worktree outside both checkouts, and copy the main services
tree's `apps/website/.env.local` into each services worktree. `build.sh` installs dependencies
in a fresh worktree.

## Layer 1

`G` is `packages/display-templates/src` of a services checkout with the list format. Both builds
find their tokens with that one grammar, which still reads the old `[key]` token.

```sh
E=$PWD
(cd $W/svc-base/apps/website && CONTENT_DIR=$W/content-base/content node --import tsx \
  --import ./test/support/register.mjs --import $E/scss-stub.mjs $E/layer1.mjs $G $W/l1-base.json)
node layer1-diff.mjs $W/l1-base.json $W/l1-cand.json step4 step4-intended-changes.json
node layer1-diff.mjs $W/l1-base.json $W/l1-cand.json step4a <step 4a intended-changes.json>
```

For the base before the cleanup, set `CLEANUP` to a JSON file that maps `b4a3747` to the files it
changed, so their differences are attributed to that commit.

## Layer 2

Build each pair with `build.sh`, run a control (the base built twice) and then `layer2.mjs`, and
classify the report:

```sh
OUT_A=$W/out-base OUT_B=$W/out-cand node layer2-classify.mjs $W/l2.json step4a <manifest>
```

For step 4, the backlink counts change on every knowledge-base page by design and layer 1 checks
them. To see everything else, build both sides a second time with the count in
`buildBacklinkIndex` (`lib/content/graph.ts`) pinned to one per source and target
(`existing.count = 1`), and compare those builds. Only the backlinks, term and claim panels read
`graph.backlinks`, so the files that differ only between the pinned and unpinned builds hold
backlink differences and nothing else. Revert the edit after building.

When done, remove the worktrees with `git worktree remove`.
