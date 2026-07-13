# YP-120 — Secrets/Vars inventory + Branch-protection runbook

> **Deliver, don't apply.** Nothing in this document is executed by CI. The owner
> applies the branch protection and creates the secrets/vars below by hand (or by
> running `apply-branch-protection.sh` after review). `apply-branch-protection.sh`
> is a reference `gh api` script — it is **not** run by any workflow.

---

## 1. Secrets & variables the owner must create

Reuse-first: the deploy already relies on existing values — do **not** recreate
them. Existing (services repo), reused as-is:

| Kind | Name | Scope | Purpose |
|---|---|---|---|
| secret | `CLOUDFLARE_API_TOKEN` | services (env: staging, production) | Terraform + CDN cache purge |
| secret | `R2_STATE_ACCESS_KEY_ID` / `R2_STATE_SECRET_ACCESS_KEY` | services | R2 S3 creds — **scoped to the `youproof-tfstate` bucket only** (Terraform state backend). NOT used for content/artifact bucket I/O (see `R2_CONTENT_*` below). |
| var | `CLOUDFLARE_ACCOUNT_ID` | services | Account id; R2 endpoint host |
| var | `R2_STATE_BUCKET` | services | TF state bucket name |
| var | `WORKER_DOMAIN` / `REDIRECT_TARGET_HOST` / `LEGACY_PROXY_HOST` / `RACKHOST_SERVER_IP` / `LEGACY_GUARD_VALUE` / `PRODUCTION_CUTOVER` | services (env-scoped) | Existing .hu worker deploy inputs |

### NEW — services repo

| Kind | Name | Scope | Minimal permission | Purpose |
|---|---|---|---|---|
| secret | `CONTENT_REPO_TOKEN` | **repo-level** (also usable env-scoped) | fine-grained PAT, `Contents: Read` on `youproof-org/content` | Clone the private content repo at the right ref in the deploy jobs; read the `stable/released` merge parent in `pr-gate.yml` (runs on `pull_request`, so it must be repo-level, not environment-only) |

(No `ORG_ZONE_ID` variable is needed: the CDN cache-purge step reads the
`youproof.org` zone id from the `website` job's `org_zone_id` output, which comes
from the shared zone root's remote-state `org_zone_id` output.)

**Dedicated per-environment content/artifact R2 credentials (REQUIRED).** The
`website` (content upload) and `quality-gate` (test-artifact upload/prune) jobs,
and `rollback.yml`'s `resolve-good` (reads the production test-artifacts bucket),
authenticate to the R2 **content/test-artifacts** buckets with these — the
`R2_STATE_*` creds are scoped to `youproof-tfstate` only and cannot touch them:

| Kind | Name | Scope | Purpose |
|---|---|---|---|
| secret | `R2_CONTENT_ACCESS_KEY_ID` / `R2_CONTENT_SECRET_ACCESS_KEY` | services, **environment-scoped** — set on BOTH the `staging` and `production` Environments, each holding a *different* key | R2 S3 token, **read+write**, scoped to that environment's two buckets (`youproof-<env>-content` + `youproof-<env>-test-artifacts`). The deploy/rollback jobs bind `environment:`, so the one secret name resolves to the correct per-env key. |

> **Bootstrap ordering (chicken-and-egg).** An R2 S3 token scoped to specific
> buckets can only be created **after** those buckets exist, and the buckets are
> created by Terraform (`website/` root) at deploy time. So for the FIRST deploy
> of each environment, either: (a) apply the `website/` root **out-of-band** for
> that env to create the buckets, create the scoped `R2_CONTENT_*` key, add it as
> that Environment's secret, THEN run the deploy; or (b) let the first deploy
> create the buckets (its content-upload step fails for lack of the key), create
> the key, and re-run the deploy. See the "First production rollout" runbook.

> **Caveat — content-repo `pr-gate.yml` R2 creds.** The content repo's
> `pr-gate.yml` reads the **staging** test-artifacts bucket and uses its own
> dedicated read-only key `R2_TEST_ARTIFACTS_*` (below) — it does **not** and
> cannot reuse `R2_STATE_*` (bucket-scoped to `youproof-tfstate`). Keep it and
> `CONTENT_REPO_TOKEN` **repo-level** in the content repo (the gate runs on
> `pull_request`, so environment-scoped secrets would not be visible).

### NEW — content repo (`youproof-org/content`)

Private repo on the FREE plan → **no Environments**, only plain repo-level
secrets/vars. `pr-gate.yml` needs:

| Kind | Name | Minimal permission | Purpose |
|---|---|---|---|
| secret | `SERVICES_REPO_TOKEN` | fine-grained PAT, `Contents: Read` on `youproof-org/services` | Read the `stable/production` merge commit's second parent |
| secret | `R2_TEST_ARTIFACTS_ACCESS_KEY_ID` / `R2_TEST_ARTIFACTS_SECRET_ACCESS_KEY` | R2 S3 token, **read-only**, `youproof-staging-test-artifacts` only | One `GET` of the pair report |
| var | `CLOUDFLARE_ACCOUNT_ID` | — | R2 endpoint host for the artifact lookup |
| secret | `SERVICES_DISPATCH_TOKEN` | fine-grained PAT, `Contents: Read and write` on `youproof-org/services` | (already documented by the cross-repo trigger stream — `notify-services.yml`) fires `repository_dispatch` at services |

> Fine-grained PATs must have the `youproof-org` **organization** as the
> "Resource owner" and be limited to the single named repo.

---

## 2. Repo settings — merge-commit-only (BOTH repos)

The ancestor-tracking invariant (branch-protection rules 2 & 3) relies on every
promotion being a real **merge commit**, so the merge commit's second parent is
the exact commit that was promoted. Squash and rebase merges destroy that second
parent, so they must be **disabled repo-wide** on both repos — leaving only merge
commits.

- Services: `youproof-org/services` → Settings → General → Pull Requests:
  - Allow merge commits: **ON**
  - Allow squash merging: **OFF**
  - Allow rebase merging: **OFF**
- Content: same, on `youproof-org/content`.

`apply-branch-protection.sh` sets these via `PATCH /repos/{owner}/{repo}`
(`allow_squash_merge=false`, `allow_rebase_merge=false`, `allow_merge_commit=true`).

> **Editor repo (`youproof-org/editor`).** The editor is **not** part of the
> `(services, content)` artifact/ancestor-tracking model, so merge-commit-only is
> **not required** for its correctness (leave its merge settings as preferred).
> It participates only via its own `branch-source-guard` — its promotion lane is
> `development → stable/released`, protected exactly like the others (§3, §4).

---

## 3. Required status checks

Add these as **required** checks:

- Services `development`: require **`zone-purity`** (from `zone-purity-guard.yml`).
- Services `stable/staging`: require **`zone-purity`** **and** **`source-branch`**
  (from `branch-source-guard.yml`).
- Services `stable/production`: require **`artifact-gate`** (from `pr-gate.yml`),
  **`source-branch`**, and **`zone-purity`**.
- Content `stable/released`: require **`artifact-gate`** (from that repo's
  `pr-gate.yml`) **and** **`source-branch`** (from that repo's
  `branch-source-guard.yml`).
- Editor `stable/released`: require **`source-branch`** (from that repo's
  `branch-source-guard.yml`).

`zone-purity-guard.yml` and the three repos' `branch-source-guard.yml` all have
**no paths filter**, so their checks run on every PR to the listed branches and
are reliable required checks. `zone-purity` is required even on `development` so
a mix is blocked at the earliest point — the feature→`development` PR (see §4 and
[deploy-pipeline.md](../docs/deploy-pipeline.md#keep-zone-changes-isolated-through-the-promotion-lane)).

Also require PRs (no direct pushes) on every protected branch:
`development`, `stable/staging`, `stable/production` (services); `draft`,
`stable/released` (content); `development`, `stable/released` (editor).

---

## 4. Branch-source restrictions — honest capabilities

Rules 1–3 also constrain WHICH branch may be merged into a target, across all
three repos:

- services: `stable/staging` only from `development`; `stable/production` only
  from `stable/staging`
- content: `stable/released` only from `draft`
- editor: `stable/released` only from `development`

**GitHub branch protection cannot natively restrict the SOURCE branch of a PR.**
Native protection controls the *target* branch (required reviews, required
checks, no direct push, linear-history toggle, etc.) but has no "only mergeable
from branch X" rule. Enforcement:

1. **Hard source-branch assertion — the required `source-branch` check.** Each
   repo has a `.github/workflows/branch-source-guard.yml` with a `source-branch`
   job that runs on every PR into its promotion target(s) (no paths filter) and
   fails unless `github.head_ref` is the allowed source:
   - services: `development` → `stable/staging`, `stable/staging` →
     `stable/production`
   - content: `draft` → `stable/released`
   - editor: `development` → `stable/released`
   Marked required by `apply-branch-protection.sh`. This is the primary, direct
   enforcement of the source restriction.
2. **Pairing correctness — the required `artifact-gate` check** (services
   `stable/production` and content `stable/released`). The gate resolves the
   required pair from the *promoted* commit (the merge second parent) and the PR
   head; only a validated pair passes, so a wrong-source promotion also lacks a
   matching passing artifact. Defence-in-depth alongside (1).

Everything else (merge-commit-only, required checks, PR-only) IS natively
enforceable and is what the script configures.

---

## 5. Applying

Review `apply-branch-protection.sh`, then run it locally with a token that has
admin on all three repos (`services`, `content`, `editor`). It is intentionally
**not** wired into any workflow.

**What it does:** `PATCH /repos/{repo}` to set merge-commit-only (services +
content only), then an authoritative `PUT …/branches/{branch}/protection` on the
seven protected branches (§3 table) — each with `enforce_admins=true`,
`required_pull_request_reviews=1`, `required_status_checks.strict=true` + the
listed contexts, no direct pushes, no force-push/deletion. The `PUT` **replaces**
the whole protection object for a branch (idempotent; wipes any settings not
listed), so review the object before running.

> **⚠️ Ordering — apply protection only AFTER the guard workflows are merged into
> the protected branches.** A required check blocks merges until its context
> *reports success*, and a context only reports if its workflow actually runs on
> the branch under test. The `zone-purity` / `source-branch` guard workflows must
> already be present on the relevant branches (`development`/`draft`/`stable/*`)
> when the script runs. If you require them **first**, every PR hangs forever
> "waiting for status to be reported" and nothing is mergeable. Correct order per
> repo: (1) land the guard workflow(s) on the integration branch via a normal PR
> (services: they arrive with the feature branch → `development`; content: merge
> `feat/branch-source-guard` → `draft`; editor: merge `feat/branch-source-guard`
> → `development`), let them propagate toward the promotion targets, **then**
> (2) run `apply-branch-protection.sh` to mark the checks required.

## 6. First production rollout

The content/test-artifact R2 buckets are created by the deploy (Terraform
`website/` root), and the per-env `R2_CONTENT_*` key can only be scoped to buckets
that already exist — a bootstrap ordering to handle **once per environment**.
Also, the post-deploy quality gate crawls the **live public host**, which only
resolves after nameserver delegation + R2 custom-domain cert issuance.

**Pre-flight (once):**
1. `CLOUDFLARE_API_TOKEN` has all needed permissions, including **Workers R2
   Storage → Edit** (to create the R2 buckets + custom domain), the ruleset
   permissions (Dynamic Redirect, Transform Rules, Cache Settings), and
   **Cache Purge** (the deploy's cache-purge step 401s without it — it's separate
   from Cache Settings).
2. `CONTENT_REPO_TOKEN` exists on the services `staging` + `production`
   Environments.
3. Delegate the `youproof.org` nameservers at the registrar (`terraform output
   org_name_servers` in `zone/`); verify with `dig NS youproof.org`. Do this
   early so it propagates.

**Per environment (staging first, then production):**
4. **Create the buckets.** Apply the `website/` root out-of-band for the env
   (`terraform apply` with the R2 state-backend creds + `CLOUDFLARE_API_TOKEN`),
   OR run the deploy once and let it create them (its content-upload step will
   fail — no `R2_CONTENT_*` key yet). This also creates the R2 custom domain;
   give its edge cert a few minutes to activate.
5. **Create the scoped R2 key** for the env's two buckets
   (`youproof-<env>-content` + `youproof-<env>-test-artifacts`), read+write, and
   add it as `R2_CONTENT_ACCESS_KEY_ID` / `R2_CONTENT_SECRET_ACCESS_KEY` on that
   Environment.
6. **Run (or re-run) the deploy.** With the buckets + key in place and the host
   live, the upload, purge, and quality gate all succeed.
   - Staging: a green quality gate writes the artifact the production PR-gate
     later looks up. (Also create the content-repo `R2_TEST_ARTIFACTS_*`
     read-only staging key now, for that gate.)
   - Production: if the very first run's gate fails only on host propagation, the
     `rollback-dispatch` fires but **safely no-ops** — `resolve-good` finds no
     prior passing production report and exits without reverting anything. Re-run
     the deploy once the host is live to produce the first known-good artifact.
