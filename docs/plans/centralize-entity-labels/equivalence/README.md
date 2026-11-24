# Output equivalence check

The scripts for step 5 of [plan.md](../plan.md). They compare a baseline build with
a candidate build and pass only when the differences match
[intended-changes.json](../intended-changes.json) exactly.

## Inputs

| Build | Services | Content |
|---|---|---|
| Baseline | merge-base of `centralize-entity-labels` and `development` | `2a857ab`, the `content/yp-94-chapter-26` commit the content branch forked from |
| Candidate | `centralize-entity-labels` tip | `centralize-entity-labels` tip |

Check each one out as a detached worktree outside both checkouts, so local work
can't leak into a build:

```sh
W=<scratch dir>
cd services && git fetch && B=$(git merge-base origin/centralize-entity-labels origin/development)
git worktree add --detach $W/svc-base $B
git worktree add --detach $W/svc-cand origin/centralize-entity-labels
cd ../content && git fetch
git worktree add --detach $W/content-base 2a857ab
git worktree add --detach $W/content-cand origin/centralize-entity-labels
```

## Run

`build.sh` installs dependencies when the worktree has none, then runs the website
build with the staging page set and the same environment for every build. The GA4
measurement ID is a placeholder, because the staging analytics guard requires one.

```sh
./build.sh $W/svc-base $W/content-base $W/out-base-1
./build.sh $W/svc-base $W/content-base $W/out-base-2
./build.sh $W/svc-cand $W/content-cand $W/out-cand
```

**Control run.** It must report 0 differences. If it doesn't, the normalization is
missing some build noise, and the real comparison can't be trusted until that's fixed.

```sh
node layer2.mjs $W/out-base-1 <baseline version> $W/out-base-2 <baseline version>
```

**Layer 1: label strings.** Run `layer1.mjs` from each build's `apps/website`, then
compare the two files against the manifest:

```sh
E=$PWD
(cd $W/svc-base/apps/website && CONTENT_DIR=$W/content-base/content \
  node --import tsx --import ./test/support/register.mjs $E/layer1.mjs $W/layer1-base.json)
(cd $W/svc-cand/apps/website && CONTENT_DIR=$W/content-cand/content \
  node --import tsx --import ./test/support/register.mjs $E/layer1.mjs $W/layer1-cand.json)
node layer1-diff.mjs $W/layer1-base.json $W/layer1-cand.json ../intended-changes.json $W/content-cand
```

**Layer 2: the export.** Each version is the website's `package.json` version, which
the footer prints.

```sh
node layer2.mjs $W/out-base-1 <baseline version> $W/out-cand <candidate version>
```

Layer 2 must report no path that exists in only one build. Every file that differs
must be a page, payload or flight file holding a manifest reference, and must differ
only at that reference. A reference on a page outside the staging export, such as a
chapter that isn't published, shows up only in layer 1.

When done, remove the worktrees with `git worktree remove`.
