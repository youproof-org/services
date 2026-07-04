# Terraform roots & directory layout

All Cloudflare infra is Terraform-managed under `infra/cloudflare/terraform/`,
split into **four independent roots** across the two zones. Each root has its
own state (or per-environment states); no two states ever manage the same
object. The split follows a consistent pattern: a **shared, single-state root**
owns each zone and its zone-level singletons, and a **per-environment root**
owns the disjoint per-env resources (DNS records, Worker/CDN bindings).

State lives in a single R2 bucket with distinct state **keys** — see
[state backend & credentials](state-backend-and-credentials.md).

## The four roots

<a id="zone-hu"></a>
### `zone/` — `youproof.hu` zone (shared, single state)

State key `cloudflare/zone.tfstate`. Owns the `cloudflare_zone` for
`youproof.hu`, its zone-wide settings (Always Use HTTPS + HSTS), and the
www→apex dynamic-redirect ruleset. A dynamic-redirect ruleset is a per-zone
singleton, so it can only be owned by this single-state root. Applied once;
rarely changes. Outputs the assigned Cloudflare nameservers and the `zone_id`.

<a id="worker-hu"></a>
### `worker/` — `youproof.hu` per-environment (state per env)

State keys `cloudflare/worker/{staging,production}.tfstate`. Each apply manages
that environment's `cloudflare_workers_script`, its route, and **its DNS
records** (`dns_hu.tf`, including its own `www.<domain>` record). It does **not**
own the zone — it reads the zone ID straight from the `zone/` root's state via a
`terraform_remote_state` data source (`worker/data.tf`), so there is no
hand-copied ID to keep in sync, and the worker plan fails if `zone/` hasn't been
applied yet.

<a id="org-zone"></a>
### `org-zone/` — `youproof.org` zone (shared, single state)

State key `cloudflare/org-zone.tfstate`. Owns the `cloudflare_zone` for
`youproof.org` and all of its zone-level singletons: zone settings (Always Use
HTTPS + HSTS), the www→apex redirect ruleset, the [`.html`-stripping Transform
Rule](cdn-and-r2.md#html-stripping), and the [cache
ruleset](cdn-and-r2.md#cache-rules). No Worker exists on this zone. Outputs
`zone_id` and `name_servers`.

<a id="cdn"></a>
### `cdn/` — `youproof.org` per-environment (state per env)

State keys `cloudflare/cdn/{staging,production}.tfstate`. Reads the org-zone via
remote state (`cdn/data.tf`), and owns the environment's **R2 buckets** (content
+ test-artifacts), the **R2 custom-domain** binding that fronts the content
bucket, and the environment's DNS. No Worker resources. See
[CDN & R2](cdn-and-r2.md).

## Shared-vs-per-env state split

Zone ownership and per-environment resources have different lifecycles, so each
zone is split the same way:

| Concern | `.hu` | `.org` | Why |
| --- | --- | --- | --- |
| Zone + zone-level singletons | `zone/` | `org-zone/` | Zone, settings, redirect/transform/cache rulesets are per-zone singletons — one shared state. |
| Per-env records & bindings | `worker/` | `cdn/` | DNS records and Worker/CDN bindings are a disjoint set per environment — separate state per env. |

Consequences of the split:

- **Apply order is enforced by remote state.** `worker/` reads `zone/`'s state;
  `cdn/` reads `org-zone/`'s state. If the shared root hasn't been applied, the
  per-env plan fails — so `zone/` before `worker/`, and `org-zone/` before
  `cdn/`.
- **No two states manage the same object.** Each shared root owns only
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
    zone/                       # youproof.hu zone — applied ONCE, shared state
      provider.tf               # cloudflare provider (~> 5.21)
      backend.tf                # R2 state key: cloudflare/zone.tfstate
      variables.tf
      zone.tf                   # cloudflare_zone for youproof.hu
      redirects.tf              # generic www->apex dynamic-redirect rule
      settings.tf               # Always Use HTTPS + HSTS (apex-only)
      outputs.tf                # zone_id + name_servers
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
    org-zone/                   # youproof.org zone — applied ONCE, shared state
      provider.tf
      backend.tf                # R2 state key: cloudflare/org-zone.tfstate
      variables.tf
      zone.tf                   # cloudflare_zone for youproof.org
      settings.tf               # Always Use HTTPS + HSTS (apex-only)
      redirects.tf              # generic www->apex dynamic-redirect rule
      transform.tf              # .html-stripping URL-rewrite Transform Rule
      cache.tf                  # cache ruleset (assets long TTL; HTML revalidated)
      notfound.tf               # custom-404 decision/limitation note (no resources)
      outputs.tf                # zone_id + name_servers
    cdn/                        # youproof.org — applied PER ENVIRONMENT
      provider.tf
      backend.tf                # R2 state key: cloudflare/cdn/{env}.tfstate
      variables.tf
      data.tf                   # terraform_remote_state -> zone_id from org-zone/
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

The shared root must be applied before its per-env root. For the `.hu` worker,
**build the Worker bundle first** — `worker.tf` reads `../../worker/dist/worker.js`.

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

The `youproof.org` roots follow the same pattern (`org-zone/` once, then `cdn/`
per env) with keys `cloudflare/org-zone.tfstate` and
`cloudflare/cdn/{env}.tfstate`. For production, swap `staging` → `production` in
the state key and var-file and re-run `terraform init -reconfigure` (the backend
`key` differs per environment).

**Always confirm the `environment` output and the resource names/IDs in the plan
match the intended environment before applying**, so a staging run can never
touch production state, and vice versa. The `environments/*.tfvars.example`
files are for **local development only** (copy to a gitignored `*.tfvars`); CI
uses GitHub Environment-scoped vars/secrets instead of `-var-file`.
