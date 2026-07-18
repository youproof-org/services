# Rollback strategy

Rollback is **fully automatic and forward-only**. After every production deploy
the [production post-deploy quality check](quality-gates-and-artifacts.md) runs
the full suite against the just-deployed `(stable/production, stable/released)`
pair. If that run indicates problems, the rollback workflow triggers immediately
— no manual approval step.

> This is the ongoing pipeline rollback. It is a **different mechanism** from the
> one-time `youproof.hu` → Cloudflare cutover fallback, which was part of the
> completed migration and no longer applies.

## What rollback does

On a failed production test, the workflow **redeploys the last known-good
build** — it does not roll history back. Specifically it re-applies the
last-known-good deploy outputs:

1. Restore the production **R2 content bucket** to the previous known-good static
   export.
2. Restore the **migration worker** to its previous manifest/deployment.
3. **Purge the production CDN cache** so the reverted content is visible
   immediately.
4. **Notify** (see below).

Infra beyond the worker (other Terraform-managed resources) is not reverted by
rollback — only content + worker, plus the cache purge.

## What counts as "known-good"

The most recent `(stable/production, stable/released)` pair that has a **passing
artifact** (`overall == "pass"`) in `youproof-production-test-artifacts`, **before**
the pair that just failed. The lookup walks production artifacts by
`generatedAt` (newest first, skipping the failed pair) and takes the first
passing one. The [artifact retention window](quality-gates-and-artifacts.md#bucket-layout-pr-gate-lookup-retention)
(newest 30 per environment) bounds how far back a rollback can reach.

## Forward-only git history

A rollback **does not** move the `stable/production` / `stable/released` branches
back — no revert commits, no branch rewrite. Git history stays **forward-only**,
which preserves the merge-commit-only / ancestor-tracking invariant that the
[branch-protection rules](branching-and-branch-protection.md#merge-commit-only-invariant)
depend on. Rollback only changes the **deployed** state (bucket content + worker
+ cache); the fix then rolls forward normally through
`development` → `stable/staging` → `stable/production` (and `draft` →
`stable/released`).

## Notification

When a rollback is triggered, a notification is sent (and separately if the
rollback itself fails), so an operator knows production was reverted and the
failing pair needs a forward fix.
