# Deploy pipeline & cross-repo triggers

The deploy pipeline lives entirely in `youproof-org/services` (extending the
existing `deploy-to-cloudflare` workflow). It builds and deploys a
`(services_sha, content_sha)` pair to an environment, then hands off to the
[quality gate](quality-gates-and-artifacts.md). The target environment is
derived from the branch (a services push) or from the cross-repo dispatch event
type (a content push).

## Cross-repo triggers

The `content` repo is a **private repo on the free GitHub plan**, so it has no
environment-scoped vars/secrets and holds no deploy logic. Its only job is to
**trigger** builds in `services` via `repository_dispatch`.

- A lightweight `content` workflow fires `repository_dispatch` at
  `youproof-org/services` on merges:
  - push to `draft` → `event_type: "content-draft-updated"`.
  - push to `stable/released` → `event_type: "content-released"`.
  - `client_payload: { ref, sha, repo }`.
- It authenticates with a fine-grained PAT stored as the content-repo secret
  **`SERVICES_DISPATCH_TOKEN`** (minimal scope: dispatch to the services repo;
  the owner creates it).
- The services deploy workflow listens with
  `on: repository_dispatch: types: [content-draft-updated, content-released]`
  and maps:
  - `content-draft-updated` → **staging** deploy.
  - `content-released` → **production** deploy.

Services-side pushes trigger the same deploys directly: a push to
`stable/staging` → staging, `stable/production` → production.

## Deploy job step order

The environment is derived (branch or dispatch type); the step order is the same
for both:

1. **Checkout services** (record `services_sha`). Clone the content repo at the
   correct ref using the PAT — staging → `draft` HEAD, production →
   `stable/released` HEAD. Record `content_sha`. Export `CONTENT_DIR`.
2. **Regenerate the worker manifest** from the content YAML
   (`gen-manifest.mjs` — see [migration worker](migration-worker.md#the-migration-manifest-generated-from-content)).
3. **Terraform apply** for the environment — the `website/` root (R2 buckets + R2
   custom domain) — and **redeploy the `.hu` migration worker** with the
   regenerated manifest. The shared `zone/` root (which owns **both** zones) is
   applied **separately** (single-state root; not part of the per-deploy apply).
4. **Build the Next.js static export** (`out/`) with `CONTENT_DIR` set. The
   runner needs TeX Live (`pdflatex` + `dvisvgm`) for figure compilation.
5. **Upload `out/`** to the environment's content bucket (R2 S3 API), keys
   mirroring paths ([R2 object keys](cdn-and-r2.md#r2-object-key--url-path-mapping)).
6. **Purge the environment's CDN cache** (Cloudflare cache-purge API) — the
   [deploy-time cache-busting mechanism](cdn-and-r2.md#deploy-time-cache-purge-cache-busting).
7. **Kick off the quality-gate test job** for the `(services_sha, content_sha)`
   pair.

## The `deploy-to-cloudflare` workflow (infra jobs)

The existing generic Cloudflare-infra pipeline handles the Terraform applies. A
`changes` (path-filter) job decides which run:

- **shared zone root** (`zone/`, apply job `zone`) — applies on a **push to
  `stable/production`** and covers **both zones** (it owns account-level shared
  infra); on PRs touching its files the `zone-plan` gate runs **plan-only**.
  Bound to the `production` GitHub Environment.
- **per-env roots** (`worker/`, `website/`; apply jobs `worker` and
  `website-infra`) — the target environment is derived from the branch
  (`stable/production` push → production; otherwise staging — a `stable/staging`
  push or a PR plan-only review). Steps: install → generate/validate manifest →
  typecheck → build → `terraform init` (per-env state key) → fmt check → plan →
  apply. Their PR plan gates are `worker-plan` and `website-plan`. Bound to the
  matching GitHub Environment. (The Next.js static-build job is separately named
  `website`.)
- **guard** — runs on every PR and **fails if a PR touches the shared zone root
  (`terraform/zone/**`) together with anything else**. Make it a required status
  check on the protected branches.

> **Push deploys are gated by branch, not by the path filter.** On a promotion
> merge the promoted branch becomes an ancestor of the stable branch, so the
> `changes` path filter sees an empty diff and would wrongly skip the deploy.
> Applies are idempotent, so pushes just run (a no-op if nothing changed); the
> path filter is used only for the PR plan / `guard`.

### Keep zone changes isolated through the promotion lane

Zone settings are **global to the single shared zone** (`staging.*` are records
within it), so `always_use_https`, HSTS, the www→apex + root-locale redirects
(and, on `.org`, the transform + cache rulesets) apply to staging and production
together and can't be isolated to staging. A zone change is therefore a **no-op
at the `stable/staging` merge** and only **applies at the `stable/production`
merge**.

There is **one promotion lane for everything, including zone changes**:
`development → stable/staging → stable/production` (no `zone/*`→production
shortcut). Because promotions are **wholesale** (a branch merges in full), a zone
change and unrelated non-zone work can meet later in the pipeline even if each
individual PR was clean. The invariant we protect is:

> the `stable/production ↔ <target>` file delta must **never** mix a
> `terraform/zone/**` change with any non-zone change.

The `zone-purity` required check (`zone-purity-guard.yml`, no paths filter so it
can't be bypassed) enforces this on **every** PR into `development`,
`stable/staging`, and `stable/production`. It compares the PR's merge result
against `stable/production` — the set of files the eventual production promotion
would carry if the PR lands — and fails if that projected delta mixes a
`terraform/zone/**` change with any non-zone change. Checking at the
feature→`development` PR is the earliest possible point: a PR is blocked the
moment it would (together with whatever is already pending on the target) make
the eventual production promotion mixed.

**Consequence — serialize zone changes.** Because the check runs from
feature-PR time onward, a zone change and non-zone work can never accumulate
together on `development` in the first place. To ship a zone change you **drain**
the pipeline (promote outstanding non-zone work to `stable/production` so staging
and production match), then send the zone change through the lane **alone**:
land it as its own PR to `development`, and promote
`development → stable/staging → stable/production` with nothing else in flight.
The `source-branch` required check (`branch-source-guard.yml`) additionally
guarantees promotions can only flow along this lane (staging only from
development, production only from staging).

CI is driven entirely by **GitHub Environment**-scoped vars/secrets (no
`-var-file`), so production and staging values never cross over — see
[state backend & credentials](state-backend-and-credentials.md#github-environment-configuration).
Branch → environment mapping means a staging push can never apply production, and
vice versa.
