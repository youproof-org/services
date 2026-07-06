# Branching strategy & branch protection

Two repositories drive the platform, and a deployable version of the site is the
**pair** `(services_sha, content_sha)` (see
[architecture & environments](architecture-and-environments.md#the-services-content-version-pair-model)).
The branching model and protection rules exist to guarantee that pair is always
validated before it reaches production.

## Branches

- **`youproof-org/services`**: `development` → `stable/staging` →
  `stable/production`.
  - `development` — ongoing feature work, merged into `stable/staging`.
  - `stable/staging` — the staging environment.
  - `stable/production` — the production environment.
- **`youproof-org/content`**: `draft` → `stable/released`.
  - `draft` — ongoing content work.
  - `stable/released` — content currently live in production.

## Deploy triggers (recap)

- A merge to `stable/staging` (services) **or** to `draft` (content) triggers a
  **staging** deploy, always combining the **latest** `stable/staging` with the
  **latest** `draft` — staging reflects the newest of both regardless of which
  side changed.
- After a staging deploy, the quality gate runs against that exact
  `(stable/staging, draft)` pair and writes a
  [test artifact](quality-gates-and-artifacts.md) keyed by the pair.
- A merge to `stable/production` (services) or `stable/released` (content)
  triggers a **production** deploy.

See the [deploy pipeline](deploy-pipeline.md) for the mechanics.

## Promotion (branch-protection) rules

1. **PR-only, and `stable/staging` only from `development`.** Merges to
   `stable/staging` (services) and `draft` (content) are PR-only — no direct
   pushes. `stable/staging` may only be merged **from `development`**.
2. **`stable/production` only from `stable/staging`**, via PR, and only if a
   passing test artifact exists proving the current `stable/staging` (services)
   is operational with **the content version that is the direct ancestor of the
   current `stable/released`** — i.e. the exact `draft` commit `stable/released`
   was last promoted from.
3. **`stable/released` only from `draft`**, via PR, and only if a passing test
   artifact exists proving **the direct ancestor of the current
   `stable/production`** (the exact `stable/staging` commit `stable/production`
   was last promoted from) is operational with the current `draft` content.

In short: promoting **either** side to production requires a passing artifact for
"the new version of the side being promoted" paired with "whatever the other
side's production is already known to be compatible with." This stops services
and content promotions from racing ahead of each other without a validated
pairing.

## Merge-commit-only invariant

The "direct ancestor" that rules 2 and 3 rely on is read **directly from git
history** — no separate metadata file or tag. That only works if every
promotion uses a real **merge commit** (`git merge --no-ff`), so the merge
commit's second parent is exactly the `draft` / `stable/staging` commit that was
promoted.

Therefore **merge-commit-only applies across the board**: fast-forward, squash,
and rebase merges are disallowed on **every** protected branch in **both**
repos (`development`, `stable/staging`, `stable/production` in services;
`draft`, `stable/released` in content). In GitHub this means disabling "Allow
squash merging" and "Allow rebase merging" (repo-wide, or at minimum on every
protected branch) and leaving only "Allow merge commits" enabled.

## Required status check: the artifact-lookup PR gate

The test-artifact check is a **required CI status check** on PRs targeting
`stable/production` (services) and `stable/released` (content). It looks up
whether a passing artifact exists for the specific `(services_sha, content_sha)`
pair implied by rule 2 or 3 and fails the PR if none is found.

**Failure path is implicit:** if a staging compatibility test fails for a
`(stable/staging, draft)` pair, no artifact is produced for that pair, so the
required check on the next production/released PR simply finds nothing and fails.
No separate alerting/blocking mechanism is needed. See
[quality gates & test artifacts](quality-gates-and-artifacts.md).

## Applying branch protection

The concrete GitHub branch-protection settings (required checks, allowed merge
methods, allowed source branches per target) are an operational runbook applied
by the repo owner. **See
[`../infra/github/branch-protection.md`](../infra/github/branch-protection.md)**
for the exact settings to configure in both repos — this doc describes the
model; that runbook is the checklist.
