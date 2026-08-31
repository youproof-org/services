# `deploy / newsletter-worker` — investigation

Written 2026-08-31, during the YP-162 staging release
([`yp-162-release-plan.md`](yp-162-release-plan.md)). The job went red on every deploy run
of that release, and the runbook does not mention it at all, so it had to be established
whether the release had caused it and whether it blocked the promotion.

**Verdict: pre-existing, unrelated to YP-162, blocks nothing, mutates nothing — but it is a
real defect that turns every deploy run red, and it is still unfixed.** This document
records the evidence so the fix does not have to re-derive it. Every `file:line` below was
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

## Suggested fix — not yet applied or verified

Derive the fixture's subscription timestamp from the real clock, the way `FRESH()` already
does at `legacy-invite.test.mjs:16`, instead of the hardcoded date in `makeDeps()`.

Two cautions for whoever picks this up:

- `makeDeps()` is shared by other tests in this suite. Changing its `now` outright has an
  unexamined blast radius; check every caller before changing the helper rather than the
  one test.
- Some tests may legitimately want a frozen clock (deterministic ids and tokens come from
  the same helper). The property that actually matters is that a fixture's timestamps and
  the code's retention cutoff use the *same* clock — freezing both would work equally well
  as making both real, and is arguably the better fix, since it also pins the retention
  behaviour under test.

A regression guard worth adding either way: a test that fails if any fixture timestamp is
more than one retention window away from the clock the handler uses.

## Reproducing

```sh
nvm use 24.18.0
cd infra/cloudflare/newsletter-worker
pnpm test                      # fails today
```
