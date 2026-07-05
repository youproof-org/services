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
| secret | `R2_STATE_ACCESS_KEY_ID` / `R2_STATE_SECRET_ACCESS_KEY` | services | R2 S3 creds: TF state backend, content upload, artifact upload |
| var | `CLOUDFLARE_ACCOUNT_ID` | services | Account id; R2 endpoint host |
| var | `R2_STATE_BUCKET` | services | TF state bucket name |
| var | `WORKER_DOMAIN` / `REDIRECT_TARGET_HOST` / `LEGACY_PROXY_HOST` / `RACKHOST_SERVER_IP` / `LEGACY_GUARD_VALUE` / `PRODUCTION_CUTOVER` | services (env-scoped) | Existing .hu worker deploy inputs |

### NEW — services repo

| Kind | Name | Scope | Minimal permission | Purpose |
|---|---|---|---|---|
| secret | `CONTENT_REPO_TOKEN` | **repo-level** (also usable env-scoped) | fine-grained PAT, `Contents: Read` on `youproof-org/content` | Clone the private content repo at the right ref in the deploy jobs; read the `stable/released` merge parent in `pr-gate.yml` (runs on `pull_request`, so it must be repo-level, not environment-only) |
| var | `ORG_ZONE_ID` | repo-level (or env) | — | The `youproof.org` zone id, used by the CDN cache-purge step. Read it after applying `terraform/zone/` with `terraform output org_zone_id`. (Alternative: the workflow could read it from the zone root's remote-state `org_zone_id` output instead of this var — chosen the var for a single, simple curl step.) |

> **Caveat — `pr-gate.yml` R2 creds.** `pr-gate.yml` runs on `pull_request`
> WITHOUT a GitHub Environment, so it can only read **repo-level** secrets. It
> currently reuses `R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY` for the
> read-only artifact lookup. If those are defined only as *environment* secrets,
> the gate can't see them — in that case add repo-level read-only creds (e.g.
> `R2_TEST_ARTIFACTS_ACCESS_KEY_ID`/`SECRET`, scoped to the staging
> test-artifacts bucket) and point `pr-gate.yml` at them. Same applies to
> `CONTENT_REPO_TOKEN` — keep it repo-level so the PR gate can read it.

Optional (recommended) hardening — if you prefer a dedicated, least-privilege
content-upload credential instead of reusing the account-scoped state creds:

| Kind | Name | Scope | Purpose |
|---|---|---|---|
| secret | `R2_CONTENT_ACCESS_KEY_ID` / `R2_CONTENT_SECRET_ACCESS_KEY` | services (env) | R2 S3 creds scoped to the `youproof-{env}-content` + `youproof-{env}-test-artifacts` buckets only. If created, point the `website`/`quality-gate` jobs' `AWS_ACCESS_KEY_ID`/`SECRET` at these instead of `R2_STATE_*`. |

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

---

## 3. Required status checks

Add the artifact-lookup gate as a **required** check:

- Services `stable/production`: require the `artifact-gate` job from `pr-gate.yml`
  (check name: **`artifact-gate`**).
- Content `stable/released`: require the `artifact-gate` job from that repo's
  `pr-gate.yml` (check name: **`artifact-gate`**).

Also require PRs (no direct pushes) on every protected branch:
`development`, `stable/staging`, `stable/production` (services); `draft`,
`stable/released` (content).

---

## 4. Branch-source restrictions — honest capabilities

Rules 1–3 also constrain WHICH branch may be merged into a target:

- `stable/staging` only from `development`
- `stable/production` only from `stable/staging`
- `stable/released` only from `draft`

**GitHub branch protection cannot natively restrict the SOURCE branch of a PR.**
Native protection controls the *target* branch (required reviews, required
checks, no direct push, linear-history toggle, etc.) but has no "only mergeable
from branch X" rule. Two-part enforcement:

1. **Pairing correctness is enforced by the required `artifact-gate` check.**
   The gate resolves the required pair from the *promoted* commit (the merge
   second parent) and the PR head, and only a validated pair passes — so a merge
   from the wrong source branch will not have a matching passing artifact and is
   blocked. This is the substantive protection and it is implemented.
2. **Source-branch label** (optional belt-and-braces): a lightweight CI check on
   the promotion PRs asserting `github.head_ref` equals the allowed source
   (`development` / `stable/staging` / `draft`). Not implemented as a separate
   workflow here to avoid check sprawl; if wanted, add a one-step job to each
   `pr-gate.yml` guarded by target branch. `apply-branch-protection.sh` documents
   this as a commented option.

Everything else (merge-commit-only, required checks, PR-only) IS natively
enforceable and is what the script configures.

---

## 5. Applying

Review `apply-branch-protection.sh`, then run it locally with a token that has
admin on both repos. It is intentionally **not** wired into any workflow.
