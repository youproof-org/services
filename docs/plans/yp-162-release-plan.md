# YP-162 knowledge graph — coordinated release runbook

Addressed to the agent (or human) executing the release. Every claim below was verified
against the working tree; `file:line` citations are given so you can re-check rather than
trust. Two runs in this release are **expected to go red**, and each is named with its
exact failing step — an unexpected red is therefore a real signal, not noise.

## Context

The knowledge-graph URL feature ([`yp-162-knowledge-graph-urls-plan.md`](yp-162-knowledge-graph-urls-plan.md))
is implemented on `feat/yp-162-knowledge-graph-pages` in **both** the services and the
content repo. It carries a deliberate cross-repo breaking change: reference targets moved
from an object form to a fully qualified name string.

```yaml
# before (content@draft)          # after (content@feat)
target:                           target: definitions.ketvaltozos-relacio.terms.binary-relation
  type: term
  name: binary-relation
  parent: { ... }
```

7082 target sites across 679 content files, plus a new `slug` on every knowledge-base
entity, part, term and claim, and 13 identifiers lowercased.

The new services code **requires** the string form: `toRefTarget` throws a fatal
`ContentFormatError` ([`apps/website/lib/content/loader.ts:158`](../../apps/website/lib/content/loader.ts)),
rethrown as fatal at [`apps/website/lib/content/graph.ts:372`](../../apps/website/lib/content/graph.ts).
The old services code rejects the string form in `validateReferences`. So **neither repo can
be promoted alone.** That was a deliberate decision, not an oversight — services commit
`6eb2488` rejected a dual-format transitional reader: *"The three repos are released
together, so a temporary incompatibility between them is not a defect."*

The consequence is that this release cannot be green at every step. It is structured so
that each unavoidable failure happens at the cheapest possible point, mutates nothing
user-visible, and is followed immediately by the merge that resolves it.

## Pipeline facts this runbook depends on

| Fact | Source |
| --- | --- |
| Staging always builds `(services@stable/staging, content@draft)`; production `(stable/production, stable/released)`. SHAs are re-resolved per run, so a run always picks up the newest of both sides | [`deploy-to-cloudflare.yml:71-84`](../../.github/workflows/deploy-to-cloudflare.yml), [`deploy.yml:64-86`](../../.github/workflows/deploy.yml) |
| A push to `development` triggers **nothing** — no workflow in either repo watches it | — |
| A push to `stable/staging` / `stable/production` always deploys; the push trigger deliberately has **no paths filter** | [`deploy-to-cloudflare.yml:22-32`](../../.github/workflows/deploy-to-cloudflare.yml) |
| A push to content `draft` fires `repository_dispatch: content-draft-updated` (→ staging); `stable/released` fires `content-released` (→ production) | `content/.github/workflows/notify-services.yml:29-33`, `:52-59` |
| Job graph: `resolve → zone → website-infra → worker → website → quality-gate → rollback-dispatch`. **`zone` is production-only** | [`deploy.yml:13-20`](../../.github/workflows/deploy.yml), `:93-95` |
| Inside `website`: unit tests (580) → `next build` (583) → browser tests (596) → R2 upload (629) → CDN purge (640). **A unit-test failure means nothing is uploaded and no cache is purged** | [`deploy.yml:580-640`](../../.github/workflows/deploy.yml) |
| `quality-gate` needs `website` to have succeeded. A failed build therefore writes **no report at all** — not even a failing one — so `reports/latest.json` is untouched | [`deploy.yml:654-661`](../../.github/workflows/deploy.yml), `:738-746` |
| **`rollback-dispatch` requires `needs.quality-gate.result == 'failure'`.** A skipped gate has result `skipped`, so a failed *build* triggers **no rollback** | [`deploy.yml:789-793`](../../.github/workflows/deploy.yml) |
| `tag-release` needs production + gate success; it tags `vX.Y.Z` when `apps/website/package.json`'s version differs from `HEAD^1` | [`deploy.yml:823-827`](../../.github/workflows/deploy.yml) |
| Both production gates read `parents[1]` of a stable tip, so **merge commits are mandatory** | [`pr-gate.yml:53-58`](../../.github/workflows/pr-gate.yml), `content/.github/workflows/pr-gate.yml:53-54` |
| One deploy per environment at a time; queued, never cancelled | [`deploy.yml:52-57`](../../.github/workflows/deploy.yml) |
| Neither GitHub Environment has protection rules — there are no manual-approval pauses mid-deploy | `gh api repos/youproof-org/services/environments` → `rules: []` |
| The `.hu` worker manifest is generated from content by `gen-manifest.mjs`, a standalone `js-yaml` reader that does **not** use the website content loader — and the feature branch does not touch it | [`infra/cloudflare/worker/scripts/gen-manifest.mjs:1-4`](../../infra/cloudflare/worker/scripts/gen-manifest.mjs) |

### Correction to `docs/branching-and-branch-protection.md`

**Branch protection is not in force.** Verify before you start:

```sh
gh api repos/youproof-org/services/branches/stable/production/protection   # -> 404 Branch not protected
gh api repos/youproof-org/content/branches/draft/protection                # -> 403 Upgrade to GitHub Pro
```

Services branches are unprotected; the content repo is private on a Free org, where branch
protection is unavailable at all. So the required checks, the one required approving review
and the PR-only rule described in [`../branching-and-branch-protection.md`](../branching-and-branch-protection.md)
are **advisory**. PRs 110/111/112 and content #45 all merged with zero reviews.

This is what makes a coordinated release executable — the production `artifact-gate` goes
red once and the merge proceeds anyway. It is also why this runbook pauses for a human
before **every** merge: nothing else will stop a premature one. `branch-source-guard` and
`zone-purity-guard` still run on PRs; treat them as hard gates even though GitHub will not.

## Pre-flight

Re-verify each of these before starting; the SHAs are from 2026-08-31.

- [ ] **Editor prerequisite satisfied.** An editor that writes the old target shape would
      destroy the migration on the next save. `editor@stable/released` is `64beed4`, v1.1.0,
      containing *"Read and write reference targets as fully qualified names"* and *"Refuse
      to save a file whose targets this editor cannot write"*. Already released — nothing to
      do, but confirm it has not regressed.
- [ ] **Clean starting state.** services `development` == `stable/staging` (`d1a2149`, zero
      diff); `stable/production` is `12efa54` with `parents[1]` == `d1a2149`. content `draft`
      is `10cc73a` == `parents[1]` of `stable/released` (`445bee8`). No other pending work on
      either lane, no open PRs in either repo. **If anything else has landed since, stop and
      re-derive** — the gate arithmetic in Phase B assumes these pairings.
- [ ] **Both feature branches merge cleanly**: `origin/development` is an ancestor of the
      services feature branch, `origin/draft` of the content one.
- [ ] **`zone-purity` will pass.** The feature diff against `stable/production` touches no
      `infra/cloudflare/terraform/zone/**` path — in fact no `infra/**` or worker path at
      all, which is what makes the intermediate worker deploys no-ops.
- [ ] **Version bump present**: `apps/website/package.json` 2.1.0 → 2.2.0, so a successful
      production release tags `v2.2.0`. A missing tag at the end is a signal.
- [ ] Working trees clean and pushed in both repos. `nvm use 24.18.0` before any local pnpm
      command.

## Execution rules

- **Pause for explicit human go-ahead before every merge.** Show the check results and the
  file list first.
- **`gh pr merge --merge` only** — never `--squash` or `--rebase`. Both production gates read
  `parents[1]` of a stable tip; a squash or rebase destroys it and permanently breaks the
  gate arithmetic. The repo settings still permit squash and rebase, so be explicit.
- **Verify each predicted failure is the predicted one** before continuing. The failure
  messages are quoted below; a different message means something is genuinely wrong.
- Never move a branch backwards. Rollback is forward-only (see [`../rollback.md`](../rollback.md)).

### Notation

`S_new` = the services `stable/staging` tip after A2. `D_new` = the content `draft` tip
after A3. The whole release hangs on one artifact:
`youproof-staging-test-artifacts/reports/{S_new}__{D_new}.json` with `overall == "pass"`.
**Record both SHAs verbatim when A3 completes.**

---

# Phase A — staging

Order: **services first**, content second.

## A1. services: `feat/yp-162-knowledge-graph-pages` → `development`

```sh
gh pr create --repo youproof-org/services --base development \
  --head feat/yp-162-knowledge-graph-pages
```

Expect green: `zone-purity`, plus the `deploy-to-cloudflare` PR slice (worker typecheck +
AJV manifest validation, `website unit tests`). `branch-source-guard` does not run on
`development` — its absence is expected, not a missing check.

`apps/website/test/doc-examples.test.mjs` is the one test coupled to real content, and it is
green here for a specific reason: the PR job has no content clone, no `.env` is committed
(`apps/website/.env` is gitignored), so `contentDir()` returns `null` and the test `t.skip`s
([`doc-examples.test.mjs:29-53`](../../apps/website/test/doc-examples.test.mjs)).

**This merge triggers no deploy.** → **PAUSE.** Then `gh pr merge --merge`.

## A2. services: `development` → `stable/staging`

```sh
gh pr create --repo youproof-org/services --base stable/staging --head development
```

`branch-source-guard` requires the head to be exactly `development`. → **PAUSE**, then
`gh pr merge --merge`.

### Expected-red staging run

The push deploys `(S_new, 10cc73a)` — new services, old content:

- `website-infra` terraform apply — idempotent ✅
- `worker` deploys; `gen-manifest.mjs` (unchanged, standalone YAML reader) regenerates the
  manifest from **old** content, so the output is identical to what is already live ✅
- `website` **fails at `Unit tests (website)`**. `doc-examples.test.mjs` greps
  `/^\s*target:\s*(\S+)\s*$/gm` over the content repo's `docs/content-model.md`; on `draft`
  that file exists but its targets are still object-form, so it matches 0 and trips:

  ```
  expected the doc to carry examples, found 0
  ```

  (On the feature branch the same file has 12 inline targets, comfortably over the `>= 10`
  floor.) The build never starts, so nothing is uploaded and no cache is purged.
- `quality-gate` **skipped** → no report written, `reports/latest.json` untouched.
- No rollback, no tag — both are production-only.

Staging's website keeps serving the current build until A3. **Confirm the failure is exactly
the message above** before continuing; anything else means investigate, not proceed.

## A3. content: `feat/yp-162-knowledge-graph-pages` → `draft`

```sh
gh pr create --repo youproof-org/content --base draft \
  --head feat/yp-162-knowledge-graph-pages
```

The only check is `cookie-policy-version-guard`, which is advisory and always exits 0.
→ **PAUSE** — this is the 775-file content migration, so show the `--name-status` summary
(expect 764 `M`, 11 `A`, 0 `D`, 0 `R`; every `A` outside `content/`). Then
`gh pr merge --merge`.

`notify-services.yml` fires `content-draft-updated`. Note a `repository_dispatch` runs
`deploy-to-cloudflare.yml` from the services **default branch** (`development`), which after
A1 is already the new definition — so the browser-test step is present. `resolve` picks up
both new tips and the full staging deploy runs:

build → `playwright install chromium` → **126 browser tests** (fixtures derived from the
content graph by [`apps/website/e2e/support/derive-fixtures.mjs`](../../apps/website/e2e/support/derive-fixtures.mjs))
→ R2 upload + CDN purge → `quality-gate` (crawler + smoke against `staging.youproof.org`) →
report uploaded to `reports/{S_new}__{D_new}.json` **and** `reports/latest.json`, with
`overall` == `"pass"`.

## A4. Verify staging, then hand back

- `gh run watch` the dispatch run. On failure, fetch the `playwright-report-staging`
  artifact (uploaded `if: failure()`) — headless traces are the only way to see why.
- Read back the pair report, assert `overall == "pass"`, and **record `S_new` and `D_new`
  verbatim**. Phase B's gate arithmetic depends on them.
- Spot-check `https://staging.youproof.org`: the homepage knowledge-base block (3 cards),
  the `Tudásbázis` nav item, `/hu/tudasbazis/`, a definition page with its Kontextus panel
  and backlink tree, an embedded entity inside a chapter linking to its knowledge-base page,
  `/sitemap.xml` as a `<sitemapindex>` over per-type children, and `noindex` **present** on
  staging.
- Report the gate summary and **STOP.** Phase B waits for human sign-off on staging testing.

---

# Phase B — production

**Only after staging sign-off.** Same shape as Phase A, and services must again go first —
but for a different reason, and with one extra red check.

## Why the order is forced

Each production gate demands a staging artifact for a **cross-pair**: the side being
promoted, paired with the other side's currently-promoted ancestor.

| Direction | The gate resolves | Verdict |
| --- | --- | --- |
| services → `stable/production` (P1) | `content_sha` = `parents[1]` of content `stable/released` = `10cc73a`, so it looks for `reports/{S_new}__{10cc73a}.json` — new services, **old** content | **RED.** That pair hard-fails by construction, so no passing report for it can ever exist. |
| content → `stable/released` (P2, **after** P1) | `services_sha` = `parents[1]` of the new `stable/production` tip = **`S_new`**; `content_sha` = PR head = **`D_new`** → `reports/{S_new}__{D_new}.json` | **GREEN.** Precisely the pair validated in A3. |

Promoting services first therefore turns the second gate green for free: the merge commit
created in P1 is what makes P2's `services_sha` resolve to the staging-validated SHA
(`content/.github/workflows/pr-gate.yml:50-58`).

Reversing the order also yields exactly one red gate, so the count is not the argument. The
argument is what the intermediate production *run* would do: with content first, it would
redeploy the live `youproof.hu` worker with a manifest regenerated from **new** content by
**old** generator code — an unvalidated combination against a live zone. Services-first keeps
every intermediate production mutation byte-identical to what is already live.

## P1. services: `stable/staging` → `stable/production`

```sh
gh pr create --repo youproof-org/services --base stable/production --head stable/staging
```

Checks: `branch-source-guard` ✅, `zone-purity` ✅, `artifact-gate` **RED — expected.**

Before merging, confirm the annotation is exactly the missing-artifact one:

```
No staging artifact: No test artifact at youproof-staging-test-artifacts/reports/{S_new}__10cc73a.json.
```

A credentials failure or a `No promoted staging commit` error looks superficially similar and
means something is genuinely broken. Do not proceed on those.

→ **PAUSE.** This is the one merge in the release that knowingly overrides a red gate; it
needs explicit, informed sign-off. Then `gh pr merge --merge`.

### Expected-red production run

The push deploys `(stable/production, stable/released)` — new services, old content:

- `zone` runs (production only) — a no-op apply, since the feature touches no
  `terraform/zone/` path ✅
- `website-infra` apply — idempotent ✅
- `worker` deploys the `youproof.hu` migration worker; the manifest is regenerated from old
  content by an unchanged generator, so it is identical to what is live ✅
- `website` **fails at `Unit tests (website)`** — the same `doc-examples` assertion as A2.
  No build, **no R2 upload, no CDN purge, so the live `youproof.org` site is untouched and
  keeps serving v2.1.0.**
- `quality-gate` **skipped** → no production report; `reports/latest.json` in
  `youproof-production-test-artifacts` is untouched, so the rollback lookup's last-known-good
  pair stays valid.
- **`rollback-dispatch` does NOT fire.** Its `if` requires
  `needs.quality-gate.result == 'failure'`, and a skipped job's result is `skipped`
  ([`deploy.yml:789-793`](../../.github/workflows/deploy.yml)). **Verify this in the run
  graph before proceeding — it is the single most important assertion in Phase B.** If a
  rollback *did* somehow dispatch, stop and reassess before touching content.
- `tag-release` skipped (needs gate success).

Between P1 and P2, production serves the old website against the old content — a consistent,
working pair. There is no user-visible degradation.

## P2. content: `draft` → `stable/released`

```sh
gh pr create --repo youproof-org/content --base stable/released --head draft
```

Checks: `branch-source-guard` ✅, and `artifact-gate` **GREEN** — confirm its log reads:

```
OK: reports/{S_new}__{D_new}.json exists and overall='pass' — content release allowed.
```

If it is red here, the pairing assumption broke (most likely something else landed on
`draft` or `stable/staging` mid-release). Stop and re-derive rather than overriding.

→ **PAUSE**, then `gh pr merge --merge`.

`notify-services.yml` fires `content-released` → a production deploy of both new sides: zone
no-op, `website-infra`, `worker`, `website` build + 126 browser tests + R2 upload + CDN
purge, `quality-gate` against `youproof.org`, report to `youproof-production-test-artifacts`,
and `tag-release` creates **`v2.2.0`**.

The safety net is intact for the run that actually matters: if *this* gate fails, the
automatic forward-only rollback fires and redeploys the last known-good pair
`(d1a2149, 10cc73a)` — which is a compatible pair, so the rollback itself will succeed.

## P3. Verify production

- `gh run watch`; confirm the gate reports `overall == "pass"` and that `v2.2.0` was tagged.
  A warranted-but-missing tag fails the job loudly by design — treat it as needing manual
  intervention, not as cosmetic.
- Spot-check `https://youproof.org`: the same list as A4, **minus** `noindex`, which must be
  **absent** on production.

---

## Rollback

Forward-only, per [`../rollback.md`](../rollback.md). Branches are never moved backwards.

- **Staging** has no automatic rollback. Fix forward through the lane (feature →
  `development` → `stable/staging`, and/or a content PR → `draft`).
- **Production**'s automatic rollback fires on a *failed quality gate* only — which in this
  release means only the P2 run. The failed P1 *build* deliberately does not trigger it,
  because nothing was published that could be rolled back.

## Follow-up to raise after the release

Not part of the release; worth filing.

The production `artifact-gate` cannot express a coordinated breaking change. For any such
change the first side's cross-pair is unvalidatable by construction, so the gate must be
overridden — and it only *can* be overridden today because branch protection is not
actually enforced. [`../branching-and-branch-protection.md`](../branching-and-branch-protection.md)
states the rule's intent but documents no escape hatch. Two decisions to make:

1. Extend `pr-gate.yml` with a coordinated-promotion path that accepts the validated new/new
   pair, or document the override procedure explicitly.
2. Decide whether branch protection should actually be enforced. It currently is not, and it
   cannot be on the private content repo without a paid org plan — so the doc describes a
   safety model that does not exist.
