# Terraform roots & directory layout

All Cloudflare infra is Terraform-managed under `infra/cloudflare/terraform/`,
split into **three independent roots**. Each root has its own state (or
per-environment states); no two states ever manage the same object. The split
follows a consistent pattern: a single **shared, single-state root** (`zone/`)
owns **both zones** and their zone-level singletons, and a **per-environment
root** owns the disjoint per-env resources for each zone (DNS records,
Worker/R2 bindings).

State lives in a single R2 bucket with distinct state **keys** — see
[state backend & credentials](state-backend-and-credentials.md).

## The three roots

<a id="zone"></a>
### `zone/` — both zones (shared, single state)

State key `cloudflare/zone.tfstate`. A single shared root that owns **both**
`cloudflare_zone` resources — `youproof.hu` and `youproof.org` — and every
zone-level singleton on each:

- **`youproof.hu`:** zone settings (Always Use HTTPS + HSTS) and the www→apex
  dynamic-redirect ruleset.
- **`youproof.org`:** zone settings, its www→apex redirect ruleset, the
  [`.html`-stripping Transform Rule](cdn-and-r2.md#html-stripping) (`transform.tf`),
  and the [cache ruleset](cdn-and-r2.md#cache-rules) (`cache.tf`).

Both zones' definitions and their shared-shape singletons live together per file
by kind — `zone.tf` (both `cloudflare_zone` resources), `settings.tf` (both
zones' settings), `redirects.tf` (both zones' www→apex rulesets) — rather than
split by domain.

Zone settings and redirect/transform/cache rulesets are all per-zone singletons,
so they can only be owned by this single-state root. Applied once; rarely
changes. No Worker exists on the `.org` zone. Outputs the assigned Cloudflare
nameservers for each zone plus **two zone-id outputs**: `zone_id` (`youproof.hu`,
read by `worker/`) and `org_zone_id` (`youproof.org`, read by `website/`).

<a id="worker-hu"></a>
### `worker/` — `youproof.hu` per-environment (state per env)

State keys `cloudflare/worker/{staging,production}.tfstate`. Each apply manages
that environment's `cloudflare_workers_script`, its route, and **its DNS
records** (`dns_hu.tf`, including its own `www.<domain>` record). It does **not**
own the zone — it reads the `youproof.hu` zone ID straight from the `zone/`
root's `zone_id` output via a `terraform_remote_state` data source
(`worker/data.tf`), so there is no hand-copied ID to keep in sync, and the
worker plan fails if `zone/` hasn't been applied yet.

<a id="website"></a>
### `website/` — `youproof.org` per-environment (state per env)

State keys `cloudflare/website/{staging,production}.tfstate`. Reads the
`youproof.org` zone ID from the `zone/` root's `org_zone_id` output via remote
state (`website/data.tf`), and owns the environment's **R2 buckets** (content
+ test-artifacts), the **R2 custom-domain** binding that fronts the content
bucket, and the environment's `.org` DNS. No Worker resources. See
[CDN & R2](cdn-and-r2.md).

This root also owns the apex **search-engine verification records** (Google and
Bing), `count`-gated to the production apply. They belong here rather than in
`zone/` for two reasons: `zone/` deliberately owns no DNS records at all (see
`zone/zone.tf`), and `zone-purity-guard.yml` fails any PR that mixes `zone/**` with
non-zone paths, so putting them there would force every change touching them into a
solo zone-only promotion. Because the records identify the zone rather than an
environment's host, exactly one state may manage them — hence the production gate,
the mirror image of the staging-only DMARC record alongside them.

## Shared-vs-per-env state split

Zone ownership and per-environment resources have different lifecycles, so the
roots are split along that line:

| Concern | Root | Why |
| --- | --- | --- |
| Zone + zone-level singletons (both zones) | `zone/` | Zones, settings, redirect/transform/cache rulesets are per-zone singletons — one shared state owns both zones. |
| Per-env records & bindings (`.hu`) | `worker/` | DNS records and Worker bindings are a disjoint set per environment — separate state per env. |
| Per-env records & bindings (`.org`) | `website/` | R2 buckets and the custom-domain binding are a disjoint set per environment — separate state per env. |

Consequences of the split:

- **Apply order is enforced by remote state.** `worker/` reads the `zone/` root's
  `zone_id` output; `website/` reads its `org_zone_id` output. If the shared
  `zone/` root hasn't been applied, the per-env plan fails — so `zone/` before
  both `worker/` and `website/`.
- **No two states manage the same object.** The shared root owns only
  zone-level singletons; each per-env state owns a non-overlapping record/binding
  set (a production apply and a staging apply touch disjoint names).
- **Zone changes land at the production apply.** Because zone settings are
  global to the single shared zone, a zone-root change is a no-op at the staging
  merge and only takes effect at the `stable/production` merge; its pre-apply
  review is the PR plan diff. Keep zone PRs pure (zone-root files only) so that
  production apply stays clean — see the CI notes in the
  [deploy pipeline](deploy-pipeline.md).

## Directory layout

```
infra/cloudflare/
  terraform/
    .terraform-version          # pins Terraform 1.11.4 (tfenv)
    zone/                       # BOTH zones — applied ONCE, shared state
      provider.tf               # cloudflare provider (~> 5.21)
      backend.tf                # R2 state key: cloudflare/zone.tfstate
      variables.tf
      zone.tf                   # cloudflare_zone for BOTH youproof.hu and youproof.org
      settings.tf               # both zones' Always Use HTTPS + HSTS (apex-only)
      redirects.tf              # both zones' generic www->apex dynamic-redirect rule
      transform.tf              # .org .html-stripping URL-rewrite Transform Rule
      cache.tf                  # .org cache ruleset (assets long TTL; HTML revalidated)
      locals.tf                 # shared asset-extension list for transform/cache (regex-free, Free-plan)
      outputs.tf                # zone_id (.hu) + org_zone_id (.org) + name_servers
    worker/                     # youproof.hu — applied PER ENVIRONMENT
      provider.tf
      backend.tf                # R2 state key: cloudflare/worker/{env}.tfstate
      variables.tf
      worker.tf                 # cloudflare_workers_script + bindings
      routes.tf                 # cloudflare_workers_route (<domain>/*)
      data.tf                   # terraform_remote_state -> zone_id from zone/
      dns_hu.tf                 # per-env cloudflare_dns_record set (incl. www.<domain>)
      outputs.tf
      environments/
        production.tfvars.example
        staging.tfvars.example
    website/                    # youproof.org — applied PER ENVIRONMENT
      provider.tf
      backend.tf                # R2 state key: cloudflare/website/{env}.tfstate
      variables.tf
      data.tf                   # terraform_remote_state -> org_zone_id from zone/
      r2.tf                     # R2 buckets (content + test-artifacts) + custom domain
      dns.tf                    # note: site host DNS is managed by the R2 custom domain
      outputs.tf
      environments/
        production.tfvars.example
        staging.tfvars.example
  worker/                       # the migration Worker source (see migration-worker.md)
    package.json                # @youproof.org/migration-worker (pnpm workspace member)
    build.mjs                   # esbuild -> dist/worker.js
    scripts/
      gen-manifest.mjs          # generate src/manifest.json from content YAML
      validate-manifest.mjs     # JSON Schema validation
    src/
      index.ts                  # fetch() entrypoint
      manifest.ts               # typed lookup(), runtime shape validation
      manifest.json             # GENERATED at deploy time (see migration-worker.md)
      manifest.schema.json
      path.ts                   # path normalization
      proxy.ts                  # legacy reverse-proxy
      redirect.ts               # 301 redirect builder
      admin-guard.ts            # admin/login blocking
      types.ts
    dist/                       # build output (gitignored)
```

## Running Terraform

Normally Terraform runs through CI (see the [deploy pipeline](deploy-pipeline.md)).
These are the equivalent local commands. All state lives in the same R2 bucket
with distinct keys; the bucket/key/creds are supplied at `init` via
`-backend-config` (never committed). State locking is **native S3 locking**
(`use_lockfile = true`) — a `.tflock` object written via a conditional
PutObject, no DynamoDB — which requires **Terraform ≥ 1.11** (roots declare
`required_version >= 1.11.0`; CI pins 1.11.4; `terraform/.terraform-version`
pins 1.11.4 for tfenv).

The shared `zone/` root must be applied before either per-env root (`worker/`,
`website/`). For the `.hu` worker, **build the Worker bundle first** —
`worker.tf` reads `../../worker/dist/worker.js`.

```bash
# --- youproof.hu zone root (owns the cloudflare_zone; run once) ---
cd infra/cloudflare/terraform/zone
export CLOUDFLARE_API_TOKEN=<scoped-api-token>
export TF_VAR_cloudflare_account_id=<account-id>
terraform init \
  -backend-config="bucket=youproof-tfstate" \
  -backend-config="key=cloudflare/zone.tfstate" \
  -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com\"}" \
  -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
  -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
terraform apply
terraform output name_servers    # the two NS to set at the registrar

# --- youproof.hu worker root, one environment (staging shown) ---
pnpm --filter @youproof.org/migration-worker run build   # build the bundle first
cd ../worker
export TF_VAR_cloudflare_account_id=<account-id>
export TF_VAR_tfstate_bucket=youproof-tfstate
terraform init \
  -backend-config="bucket=youproof-tfstate" \
  -backend-config="key=cloudflare/worker/staging.tfstate" \
  -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com\"}" \
  -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
  -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
terraform plan  -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars
```

The `youproof.org` per-environment root follows the same pattern as `worker/`:
the shared `zone/` root is applied first (it owns both zones), then `website/`
per env with key `cloudflare/website/{env}.tfstate` (its `data.tf` reads
`org_zone_id` from `zone/`). For production, swap `staging` → `production` in the
state key and var-file and re-run `terraform init -reconfigure` (the backend
`key` differs per environment).

**Always confirm the `environment` output and the resource names/IDs in the plan
match the intended environment before applying**, so a staging run can never
touch production state, and vice versa. The `environments/*.tfvars.example`
files are for **local development only** (copy to a gitignored `*.tfvars`); CI
uses GitHub Environment-scoped vars/secrets instead of `-var-file`.
