# `deploy / newsletter-worker` — investigation

Written 2026-08-31, during the YP-162 staging release
([`yp-162-release-plan.md`](yp-162-release-plan.md)). The job went red on every deploy run
of that release, and the runbook does not mention it at all, so it had to be established
whether the release had caused it and whether it blocked the promotion.

**Verdict: pre-existing, unrelated to YP-162, blocks nothing, mutates nothing — but it is a
real defect that turns every deploy run red. Fixed on 2026-08-31 — see *Fix applied* below.**
This document records the evidence the fix was derived from. Every `file:line` below was
re-checked against the working tree at the time of writing.

## What fails

`deploy / newsletter-worker` fails at its `Unit tests` step
([`deploy.yml:398`](../../.github/workflows/deploy.yml)). 158 of 159 pass; one fails, with
byte-identical output on every affected run:

```
test at test/legacy-invite.test.mjs:98:1
✖ skips an address that has subscribed normally since the import
  AssertionError [ERR_ASSERTION]: no invite to someone already on the list
  1 !== 0
  actual: 1, expected: 0
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @youproof.org/newsletter-worker@0.0.0 test
```

## Root cause: a fixture with a frozen clock against production code with a real one

The test seeds a *pending* subscription for `regi@example.com`, then seeds a legacy contact
for the same address, and asserts that the scheduled handler mails no invite because the
address is already on the list.

The two sides disagree about what time it is:

| | Clock |
| --- | --- |
| [`test/helpers/fake-d1.mjs:425`](../../infra/cloudflare/newsletter-worker/test/helpers/fake-d1.mjs) — `makeDeps()` (declared at `:422`) | hardcoded `now: () => "2026-07-24T00:00:00.000Z"` |
| [`src/handlers/scheduled.ts:84`](../../infra/cloudflare/newsletter-worker/src/handlers/scheduled.ts) — `handleScheduled` | `const now = Date.now()` — the real clock |

`handleScheduled` purges expired pending subscriptions before sending invites:

```ts
// scheduled.ts:51
const PENDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
// scheduled.ts:90
await purgeExpiredPending(env, new Date(now - PENDING_RETENTION_MS).toISOString());
```

The test creates its pending subscription with `makeDeps()`, so the row is stamped
`2026-07-24`. Once real-world time passes **2026-07-24 + 30 days = 2026-08-23**, that row is
older than the cutoff and gets purged *before* `sendLegacyInvites` runs. The guard that was
supposed to suppress the invite —

```sql
-- src/lib/db.ts:631
AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.email = legacy_contacts.email)
```

— then matches nothing, an invite is sent, and the assertion sees `1 !== 0`.

Note the legacy contact itself uses `FRESH()` (`legacy-invite.test.mjs:16`,
`iso(Date.now() - DAY)`), which *is* derived from the real clock. The bug is precisely that
the two halves of the same fixture disagree.

### Confirmed by bisecting the clock

Run locally on Node 24.18.0 with `Date` stubbed:

| Pinned clock | Result |
| --- | --- |
| 2026-08-18T07:27Z (last green deploy) | pass |
| 2026-08-22T23:59:59Z | pass |
| 2026-08-23T00:00:01Z | **fail** |
| real clock (2026-08-31) | **fail** |

The flip is exactly at `2026-08-23T00:00:00Z`, i.e. the retention boundary. This is a time
bomb, not a flake: it fails deterministically and will keep failing.

## Why it surfaced during this release

`deploy / newsletter-worker` was green on **every** prior run:

| Date (UTC) | Run | Trigger | Result |
| --- | --- | --- | --- |
| 2026-08-10 (×6) | 31433643829 … 31440464205 | pushes + dispatches | success |
| 2026-08-15 (×3) | 31899907693, 31900367295, 31900874288 | dispatches | success |
| 2026-08-18 07:17 | 32110763020 | `content-draft-updated` | success |
| 2026-08-18 07:27 | 32111519439 | `content-released` | success |
| *2026-08-18 → 2026-08-31* | *no deploy runs at all* | — | — |
| 2026-08-31 | 33379234604, 33380650888, 33381632559, 33386482067 | staging | **failure** |

Nothing changed in the worker. The defect began on 2026-08-23, and 2026-08-31 was simply
the first day anyone deployed after that.

## Ruled out: YP-162 did not cause it

- `git diff --quiet origin/stable/production...origin/stable/staging -- infra/` → clean. The
  worker's `src/`, `test/`, `package.json` and `terraform/newsletter/` are byte-identical
  across the two branches.
- Of the three files the feature diff touches that this job also consumes:
  - `pnpm-lock.yaml` — the `infra/cloudflare/newsletter-worker:` importer block is
    unchanged. `pnpm install --frozen-lockfile` passed regardless.
  - `pnpm-workspace.yaml` — adds only `@playwright/test` to the catalog, not a
    newsletter-worker dependency.
  - `.github/workflows/deploy.yml` — the diff contains no newsletter lines; the job
    definition is unchanged.
- `CONTENT_SHA` reaches only the `Generate buildinfo` step, which passed. The test suite
  never reads it.

## Why it blocks nothing

`newsletter-worker` is a **leaf**. Its own docblock says so — *"Independent of the
content-site chain (it does NOT gate website/quality-gate)"* — and the graph confirms it:

| Job | `needs:` | Line |
| --- | --- | --- |
| `zone` | `resolve` | `:94` |
| `website-infra` | `[resolve, zone]` | `:141` |
| `worker` | `[resolve, website-infra]` | `:209` |
| **`newsletter-worker`** | **`[resolve, zone]`** | **`:339`** |
| `website` | `[resolve, website-infra, worker]` | `:463` |
| `quality-gate` | `[resolve, website]` | `:655` |
| `rollback-dispatch` | `[resolve, quality-gate]` | `:790` |
| `tag-release` | `[resolve, quality-gate]` | `:824` |

`grep -n 'needs.*newsletter' .github/workflows/deploy.yml` returns nothing — no job depends
on it. It cannot affect the website deploy, the quality-gate report, `rollback-dispatch`'s
`if:` condition, or `tag-release`.

Note the runbook's stated graph
(`resolve → zone → website-infra → worker → website → quality-gate → rollback-dispatch`) is
accurate as far as it goes; it simply omits this parallel leaf. That omission is what made
the red job look alarming.

## Why nothing is broken in production

The job dies at step 8 of 17. Every mutating step is skipped: `Terraform apply — D1 database
only (targeted)`, `Read D1 database id`, `Apply D1 migrations (wrangler, remote)`,
`Terraform plan (full)`, `Terraform apply (full)`. No apply ran, no migration ran, no state
was written.

The previously deployed worker is live and serving on both environments. Probing a route
only the worker answers returns the worker's own router response rather than the R2 static
origin:

```
PATCH https://staging.youproof.org/api/v1/newsletter/subscriptions/does-not-exist/confirm
  -> 405 {"code":"method_not_allowed"}      # src/router.ts:56
```

Same on `youproof.org`. A genuine static miss would return `404 text/html`.

## Consequences of leaving it

1. **Every deploy run reports `failure`,** even when the website deployed cleanly and the
   quality gate passed. During this release the operator had to judge success by the
   `website` and `quality-gate` jobs instead of run colour. The real hazard is
   desensitisation — especially given that branch protection is not actually enforced
   (see [`yp-162-release-plan.md`](yp-162-release-plan.md), *Correction to
   `docs/branching-and-branch-protection.md`*).
2. **The worker stops being redeployed.** Each failed run leaves the previously deployed
   bundle in place, so the worker will not pick up a new `CONTENT_SHA` — or any other
   change — until the test is fixed.
3. **The same failure will hit production.** Harmlessly, by the same argument as above, but
   it will make the production run red too.

## Fix applied

Taken on 2026-08-31. The suite's frozen instant is now *derived* from the real clock instead
of written as a literal, which keeps the determinism the helper was frozen for while removing
the drift:

```js
// test/helpers/fake-d1.mjs
export const FIXTURE_NOW = new Date().toISOString();
```

`makeDeps().now()` returns `FIXTURE_NOW`, so every instance of the helper — across every test
file — agrees on one timestamp, and that timestamp is always inside the handler's retention
windows.

The blast radius the section above warned about turned out to be exactly one assertion:
`db.test.mjs` pinned the literal `"2026-07-24T00:00:00.000Z"` when checking that re-submitting
a pending signup restarts the confirmation window; it now compares against `FIXTURE_NOW`.

### A second bomb found by the same sweep

Re-running the suite under stubbed future clocks surfaced the identical defect with a longer
fuse in `reconcile.test.mjs`. *"reconciles a failed UNSUBSCRIBE propagation"* stamped
`unsubscribed_at` as the literal `2026-07-24T03:00:00.000Z`, which crosses the five-year
`UNSUBSCRIBED_RETENTION_MS` on **2031-07-24** — after which `purgeExpiredSubscriptions` erases
the row mid-test and the next read dereferences `null`. Both of that file's hardcoded stamps
are now offsets from `FIXTURE_NOW` (`afterSignup(1)`, `afterSignup(3)`).

The remaining hardcoded `2026-07-xx` dates elsewhere in the suite are harmless: `grep -n
handleScheduled test/*.mjs` shows only `legacy-invite`, `reconcile` and `retention` drive the
cron, and nothing else exposes a fixture to a retention cutoff.

### Regression guard

`retention.test.mjs` gained *"a row stamped by the fixture clock is inside every retention
window"* — a pending subscription seeded straight from `makeDeps()` with **no** ageing offset
applied, asserted to survive a `handleScheduled` tick. Every other seeder in that file ages its
rows deliberately; this one exists so that the two clocks drifting apart fails loudly here
rather than as an unexplained purge in an unrelated test.

### Verification

160/160 pass (was 158/159 — the guard is the new test), `pnpm typecheck` and `pnpm build`
clean. Re-run with `Date` stubbed, the fix holds at every clock the pre-fix suite failed at:

| Pinned clock | Before | After |
| --- | --- | --- |
| 2026-08-22T23:59:59Z | pass | pass |
| 2026-08-23T00:00:01Z | **fail** | pass |
| 2027-06-01 | **fail** | pass |
| 2031-08-01 (past the 5-year window) | **fail** | pass |
| 2099-12-31 | **fail** | pass |
| 2130-01-01 | **fail** | pass |

## Reproducing

```sh
nvm use 24.18.0
cd infra/cloudflare/newsletter-worker
pnpm test                      # fails today
```
