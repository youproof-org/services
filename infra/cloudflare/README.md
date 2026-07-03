# Cloudflare migration Worker (`youproof.hu` → `youproof.org`)

Terraform-managed Cloudflare Worker that intercepts all traffic on the legacy
`.hu` domain and either **redirects** migrated paths to `.org`, **proxies**
unmigrated content from the legacy WordPress origin, or **blocks** admin/login
endpoints.

This supports the incremental content-migration phase of the
[Deployment Architecture](https://sytesbook.atlassian.net/wiki/spaces/YP/pages/32833537/Deployment+Architecture).

## Architecture summary

For every request on the legacy `.hu` domain, the Worker
([`worker/src/index.ts`](worker/src/index.ts)):

1. **Normalizes** the request path (decode once, strip trailing slash except
   root, single leading slash; matching is case-sensitive).
2. **Blocks admin/login paths** → `404`, never proxied (see below).
3. **Looks up** the path in the bundled migration manifest. If migrated →
   `301` redirect to `https://<redirect_target_host><new-path>` (query string
   preserved).
4. Otherwise **transparently reverse-proxies** to the environment's legacy
   origin, injecting the `X-Legacy-Guard` access-token header. The browser keeps
   showing the `.hu` domain — this is a proxy, not a redirect.

One codebase is deployed **twice** (production + staging) with different
environment bindings; nothing about the domains is hardcoded in source.

### Environments

|            | Worker bound to       | Redirect target        | Legacy proxy origin            |
| ---------- | --------------------- | ---------------------- | ------------------------------ |
| Production | `youproof.hu`         | `youproof.org`         | `legacy.youproof.hu`           |
| Staging    | `staging.youproof.hu` | `staging.youproof.org` | `legacy.staging.youproof.hu`   |

These three values per environment map to the Worker plain-text bindings
`REDIRECT_TARGET_HOST`, `LEGACY_PROXY_HOST`, and `LEGACY_GUARD_VALUE`, supplied
by Terraform from per-environment GitHub Environment vars (none are Workers
secrets — see "The `X-Legacy-Guard` value" below).

## State backend: create the R2 bucket (one-time bootstrap)

All Terraform state lives in a single Cloudflare **R2 bucket** (used as an
S3-compatible backend). This bucket **must already exist before the first
`terraform init`** — the `s3` backend never creates its own state bucket
(chicken-and-egg: the bucket can't be stored in the state it holds), so it's a
one-time manual step and is **deliberately not managed by Terraform**. Do this
once for the whole project (both roots and all environments share the one bucket;
distinct state *keys* keep them separate).

1. **Enable R2 on the account** (once): Cloudflare dashboard → **R2 Object
   Storage** → follow the prompt to enable it (adding a payment method may be
   required even though R2 has a free tier).
2. **Create the bucket** — dashboard: **R2 → Create bucket** → name it (e.g.
   `youproof-tfstate`), location **Automatic**, → **Create bucket**.
   Or CLI: `wrangler r2 bucket create youproof-tfstate`.
3. **(Recommended) Enable object versioning** on the bucket (bucket →
   **Settings → Object versioning → Enable**) so a corrupted/clobbered state file
   can be recovered.
4. **Create S3 API credentials** — dashboard: **R2 → API → Manage R2 API Tokens →
   Create API token**. Give it **Object Read & Write** permission, scoped to this
   bucket (or all buckets), then **Create**. Copy the shown **Access Key ID** and
   **Secret Access Key** (the secret is shown only once). The same screen shows the
   **S3 endpoint** — use exactly what the dashboard shows for your bucket's
   **jurisdiction**: EU buckets are `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`
   (this project's bucket is EU); the default jurisdiction omits the `.eu.` segment.
   Using the wrong one returns `403 Forbidden`. The endpoint is the **host only** —
   don't append the bucket name.

   > This R2 token is S3-only and is **separate** from the `CLOUDFLARE_API_TOKEN`
   > used by the Terraform provider — don't reuse one for the other.

5. **Record the values** and wire them where the backend/CI expect them:

   | Value | `-backend-config` key (local) | CI (GitHub Environment) |
   | --- | --- | --- |
   | Bucket name (`youproof-tfstate`) | `bucket` | var `R2_STATE_BUCKET` |
   | Account ID (in the endpoint URL) | `endpoints.s3` | var `CLOUDFLARE_ACCOUNT_ID` |
   | Access Key ID | `access_key` | secret `R2_STATE_ACCESS_KEY_ID` |
   | Secret Access Key | `secret_key` | secret `R2_STATE_SECRET_ACCESS_KEY` |

Once the bucket and credentials exist, proceed to [Running Terraform](#running-terraform)
/ the [Cutover runbook](#cutover-runbook) — the first `terraform init` will create
the per-root state objects (`cloudflare/zone.tfstate`,
`cloudflare/worker/{env}.tfstate`) inside this bucket.

## Cloudflare API token (provider auth)

`CLOUDFLARE_API_TOKEN` is the credential the Terraform provider authenticates with
(the provider reads it from the environment; in CI it's a secret per GitHub
Environment). It is **separate** from the R2 S3 credentials (`R2_STATE_*`) — a
different token for a different purpose.

Create it as an **account-owned token**, not a personal user token: dashboard →
**Manage Account → Account API Tokens → Create Token**. Account-owned tokens act as
a service principal — independent of any user, so the token keeps working if its
creator leaves the org, and account super-admins can rotate/revoke it. (A user
token from *My Profile → API Tokens* inherits that person's access and dies with
it — fine for ad-hoc scripting, wrong for durable CI.) Grant these permissions
(covering everything the two roots manage):

The **Token** column shows which environment's token needs each permission:
`Both` = staging and production tokens; `Prod only` = production token only (these
back the `zone` root, which never runs in staging).

| Permission | Category | Access | Token | For |
| --- | --- | --- | --- | --- |
| Zone | Zone | Edit | Prod only | create/manage the `youproof.hu` zone (`cloudflare_zone`) |
| Zone Settings | Zone | Edit | Prod only | HSTS / `security_header` (`cloudflare_zone_setting`) |
| SSL and Certificates | Zone | Edit | Prod only | Always Use HTTPS / `always_use_https` — it's an SSL/edge setting, needs this **not** Zone Settings |
| Dynamic Redirect | Zone | Edit | Prod only | www→apex ruleset (`cloudflare_ruleset`) |
| Account Rulesets | Account | Edit | Prod only | required *with* Dynamic Redirect to deploy the ruleset |
| DNS | Zone | Edit | Both | DNS records (`cloudflare_dns_record`) |
| Workers Routes | Zone | Edit | Both | route binding (`cloudflare_workers_route`) |
| Workers Scripts | Account | Edit | Both | the Worker script (`cloudflare_workers_script`) |

- **Zone resources:** scope to **All zones from your account** — the zone is
  created by Terraform, so the token can't be limited to a specific pre-existing
  zone. **Account resources:** your account.
- **Finding the exact group names:** in the account-owned token editor the
  Permissions field is a **searchable** list grouped by Account/Zone, and edit
  access is usually the `… Write` variant (search by the keyword in the table's
  Permission column, e.g. `DNS`, `Zone`, `Zone Settings`, `Dynamic Redirect`,
  `Account Rulesets`, `Workers Scripts`, `Workers Routes`). Names drift and vary by
  account; for the authoritative list run:
  `curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/tokens/permission_groups" -H "X-Auth-Email: <email>" -H "X-Auth-Key: <global-key>" | jq -r '.result[] | "\(.name)\t\(.scopes|join(","))"' | sort`
  (`scopes` shows Account vs Zone).
- **Least privilege (optional):** the production token needs all rows (its `zone`
  job and `worker` job share it); the staging token can include just the `Both`
  rows. Simplest alternative: grant every environment's token all rows.

Paste the resulting token into each GitHub Environment as the `CLOUDFLARE_API_TOKEN`
secret.

## Two Terraform roots

The Terraform is split into two independent roots under `terraform/`, with
separate state, because zone ownership and per-environment resources have
different lifecycles:

- **`zone/`** — a single shared state (`cloudflare/zone.tfstate`). Owns the
  `cloudflare_zone` for `youproof.hu` **and the zone-wide www→apex redirect
  ruleset** ([`zone/redirects.tf`](terraform/zone/redirects.tf)) — a dynamic-redirect
  ruleset is a per-zone singleton, so it can only be owned by this single-state
  root, not per environment. Applied once; rarely changes. Outputs the assigned
  Cloudflare nameservers (for the Rackhost NS change) and the `zone_id`.
- **`worker/`** — applied **per environment**, two separate states
  (`cloudflare/worker/{staging,production}.tfstate`). Each apply manages that
  environment's `cloudflare_workers_script`, its route, **and its DNS records**
  ([`worker/dns_hu.tf`](terraform/worker/dns_hu.tf)) — including its own
  `www.<domain>` record (the zone-root ruleset supplies the redirect *rule*). It
  does **not** own the zone — it reads the zone ID straight from the `zone/`
  root's state via a `terraform_remote_state` data source
  ([`worker/data.tf`](terraform/worker/data.tf)), so there's no hand-copied ID to
  keep in sync (it just needs the state bucket name + the same R2 credentials).
  This also enforces the apply order: the worker plan fails if `zone/` hasn't been
  applied yet.

**Why DNS records live in `worker/`, not `zone/`:** they're a per-environment,
**disjoint** set, and keeping them with the per-environment apply enables the
staged cut-over — a staging apply creates only `staging.*` / `legacy.staging.*` /
`www.staging.*` records (and the staging Worker), so production `youproof.hu`
keeps running on legacy WordPress until you apply production, which is what
creates the `youproof.hu` records and cuts production over to the Worker.

No two states ever manage the same object: `zone/` owns the zone + the redirect
ruleset (both zone-level singletons), and each `worker/` state owns a
non-overlapping set of records.

## Zone setup & nameserver delegation (prerequisite)

For the Worker to intercept traffic on `youproof.hu`, **Cloudflare must be the
authoritative DNS** for the domain. Two facts about how that works here:

- **The zone is provisioned by Terraform** (the `zone/` root) — no manual
  dashboard step. Applying it assigns two Cloudflare nameservers, exposed as the
  `name_servers` output. The worker root then reads the zone's ID automatically
  from the zone root's state (no manual copy needed).
- **Delegation is a manual registrar step.** Cloudflare only becomes
  authoritative once `youproof.hu`'s nameservers are pointed at it at the
  registrar (Rackhost): **Domains → youproof.hu → Részletek → Névszerverek
  módosítása**, create a DNS profile with the two assigned nameservers. See the
  [Rackhost nameserver-change guide](https://www.rackhost.hu/tudasbazis/domain/hogyan-tudok-nevszervert-modositani-meglevo-domain-eseten/).
  Propagation takes minutes to a few hours, after which Cloudflare is
  authoritative for `youproof.hu` **and all subdomains**.

> ⚠️ **The nameserver switch is not a standalone step — its timing matters.**
> Once NS points at Cloudflare, every `youproof.hu` name resolves only via
> Cloudflare; anything without a Cloudflare record returns NXDOMAIN. So all
> records must exist in Cloudflare *before* the switch, and production must stay
> on legacy WordPress until it's validated. That exact sequence is the
> [Cutover runbook](#cutover-runbook) — **follow it rather than switching NS ad
> hoc.**

### DNS records (in the `worker/` root)

Every record that lived at Rackhost is recreated in Cloudflare as
`cloudflare_dns_record` resources in [`worker/dns_hu.tf`](terraform/worker/dns_hu.tf),
derived per environment from that environment's variables:

| Name | Type | Content | Proxied | Created by |
| --- | --- | --- | --- | --- |
| `youproof.hu` (post-cutover) | A | `192.0.2.1` (placeholder) | **Yes** (orange) | worker (production, cutover=true) |
| `youproof.hu` (pre-cutover) | A | `91.227.138.40` (Rackhost) | **No** (gray) | worker (production, cutover=false) |
| `www.youproof.hu` | A | `192.0.2.1` (placeholder) | **Yes** (orange) | worker (production) |
| `legacy.youproof.hu` | A | `91.227.138.40` (Rackhost) | **No** (gray) | worker (production) |
| `staging.youproof.hu` | A | `192.0.2.1` (placeholder) | **Yes** (orange) | worker (staging) |
| `www.staging.youproof.hu` | A | `192.0.2.1` (placeholder) | **Yes** (orange) | worker (staging) |
| `legacy.staging.youproof.hu` | A | `91.227.138.40` (Rackhost) | **No** (gray) | worker (staging) |

The zone-wide **www→apex redirect** lives in the `zone/` root
([`zone/redirects.tf`](terraform/zone/redirects.tf)) as a single, domain-agnostic
rule; the `www.*` A records above just make it reachable.

- **Proxied (orange) records** use an unroutable RFC 5737 placeholder IP
  (`192.0.2.1`): Cloudflare intercepts all matching traffic at the edge (Worker
  route, or the www redirect rule) before any origin is contacted, so the origin
  IP is never reached.
- **`legacy.*` records are gray-cloud** (not proxied) so they resolve directly to
  Rackhost — this is the path the Worker's outbound `fetch()` uses.
- **The apex `youproof.hu` flips with `production_cutover`:** gray-cloud → Rackhost
  before cut-over (legacy WordPress keeps serving), proxied → Worker after — this
  is the switch driven by the [Cutover runbook](#cutover-runbook).
- **Disjoint per environment:** production creates the `youproof.hu` / `www.*` /
  `legacy.*` records, staging creates the `staging.*` / `www.staging.*` /
  `legacy.staging.*` records — non-overlapping, so the two worker states never
  fight over the same record.
- **`www.<domain>` → apex 301 (both environments):** one generic dynamic-redirect
  rule in the `zone/` root matches any host starting with `www.` and redirects to
  the same host without that prefix, over https, preserving path & query
  (`concat("https://", substring(http.host, 4), http.request.uri.path)` — no
  regex, so it works on all plans, and **no hardcoded domains**). It's created in
  the zone root because a dynamic-redirect ruleset is a per-zone singleton; it
  stays dormant for `www.*` hosts that have no record. The `www.<domain>` A record
  itself lives in the worker root and is created unconditionally per environment
  (it always redirects to its apex — harmless before cut-over, correct after).
- **Intentionally dropped:** `www.legacy.*` records — nothing links to them.
- **No-mail declaration (both environments):** `youproof.hu` is not an email domain,
  so instead of leaving SPF/DMARC/MX unset (which invites spoofing) the worker root
  publishes explicit records per environment ([`dns_hu.tf`](terraform/worker/dns_hu.tf)):
  SPF `v=spf1 -all` (no authorized senders), DMARC `p=reject; sp=reject` with strict
  alignment, and a **null MX** (`.`, RFC 7505) so the domain accepts no mail.
- **HTTP → HTTPS** is forced zone-wide by the **Always Use HTTPS** setting
  ([`zone/settings.tf`](terraform/zone/settings.tf)): any `http://` request to a
  proxied host gets a 301 to `https://` at the edge, before the Worker or the www
  rule runs. So `http://youproof.hu` → `https://youproof.hu`,
  `http://www.youproof.hu` → `https://youproof.hu` (upgraded then folded to apex),
  and the same for the staging hosts.
- **HSTS** is enabled on the **apex only** (same file): `Strict-Transport-Security`
  with `max-age` 1 year, **`includeSubDomains` off**, preload off. Apex-only is
  deliberate — with `includeSubDomains` on, the `www.staging.youproof.hu` cert gap
  (see the ⚠️ below) would become a hard, un-bypassable block for every subdomain.
  Turn on `includeSubDomains`/preload only once all subdomains have a valid cert.

> **TLS for `legacy.*`:** since `legacy.*` is gray-cloud, the Worker reaches it
> over the public internet by HTTPS, so Rackhost must serve a valid TLS
> certificate for `legacy.youproof.hu` / `legacy.staging.youproof.hu`. Confirm
> this (Let's Encrypt auto-provisioning or equivalent) **before** deploying.
>
> ⚠️ **Edge TLS for `www.staging.youproof.hu`:** Cloudflare's free Universal SSL
> certificate covers `youproof.hu` and `*.youproof.hu` (one label) — so
> `youproof.hu`, `www.youproof.hu`, and `staging.youproof.hu` are fine, but
> `www.staging.youproof.hu` is **two** labels deep and is **not** covered. Its
> HTTPS handshake will fail (so the www→staging redirect can't run) unless you
> enable **Advanced Certificate Manager / Total TLS** (paid) with a
> `*.staging.youproof.hu` cert. Options: enable ACM, drop the `www.staging`
> record, or accept that only `www.youproof.hu` has the redirect. (`www.youproof.hu`
> is covered and works out of the box.)
>
> **Cut-over safety:** do not remove the old Rackhost zone records until the NS
> switch is confirmed working and legacy WordPress is verified reachable via the
> new DNS.

## Directory layout

```
infra/cloudflare/
  README.md                    # this file
  terraform/
    zone/                      # applied ONCE, shared state — zone + zone-wide redirects
      provider.tf              # cloudflare provider (~> 5.21)
      backend.tf               # R2 state key: cloudflare/zone.tfstate
      variables.tf             # cloudflare_account_id
      zone.tf                  # cloudflare_zone for youproof.hu
      redirects.tf             # generic www->apex dynamic-redirect rule (all hosts)
      settings.tf              # zone settings (Always Use HTTPS + HSTS, apex-only)
      outputs.tf               # zone_id + name_servers (for the Rackhost NS change)
    worker/                    # applied PER ENVIRONMENT, separate state per env
      provider.tf              # cloudflare provider (~> 5.21)
      backend.tf               # R2 state key: cloudflare/worker/{env}.tfstate
      variables.tf
      worker.tf                # cloudflare_workers_script + bindings
      routes.tf                # cloudflare_workers_route (<domain>/*)
      data.tf                  # terraform_remote_state -> zone_id from the zone root
      dns_hu.tf                # per-env cloudflare_dns_record set (incl. www.<domain>)
      outputs.tf
      environments/
        production.tfvars.example
        staging.tfvars.example
  worker/
    package.json               # @youproof.org/migration-worker (pnpm workspace member)
    tsconfig.json
    build.mjs                  # esbuild → dist/worker.js
    scripts/validate-manifest.mjs
    src/
      index.ts                 # fetch() entrypoint
      manifest.ts              # typed lookup(), runtime shape validation
      manifest.json            # the migration slug map (bundled, no KV)
      manifest.schema.json     # JSON Schema for the manifest
      path.ts                  # path normalization
      proxy.ts                 # legacy reverse-proxy
      redirect.ts              # 301 redirect builder
      admin-guard.ts           # admin/login blocking
      types.ts
    dist/                      # build output (gitignored)
```

## The migration manifest

The manifest ([`worker/src/manifest.json`](worker/src/manifest.json)) is a
**static JSON file bundled directly into the Worker** (no KV). Keys are legacy
paths, values are the new `.org` paths — both paths only (leading slash, no
domain, no trailing slash except `/`):

```json
{
  "version": 1,
  "updatedAt": "2026-06-30",
  "entries": {
    "/old-slug-one": "/new-slug-one",
    "/some/nested/old-path": "/some-new-path"
  }
}
```

### Updating the manifest (recurring operational step)

Because the manifest is bundled, **every manifest change requires a rebuild and
redeploy** of the Worker. During the incremental migration phase this is the
routine step each time content moves to `.org`:

1. Edit `worker/src/manifest.json` — add the `"/old": "/new"` entry and bump
   `updatedAt`.
2. Validate locally: `pnpm --filter @youproof.org/migration-worker run validate-manifest`.
3. Commit and merge to the environment branch (`stable/staging` then
   `stable/production`). CI validates, rebuilds, and redeploys the Worker.

> **Shared manifest assumption:** production and staging currently share one
> manifest, since staging mirrors production migration progress. If staging ever
> needs to diverge (e.g. test content not yet on production), split into
> `manifest.production.json` / `manifest.staging.json` selected at build time —
> flag this when it comes up.

## Admin/login blocking

The legacy WordPress admin/auth surface must **never** be reachable through the
public `.hu` Worker domain — only directly against the legacy origin
(`legacy.youproof.hu` / `legacy.staging.youproof.hu`), where the legacy host
enforces the guard header. Blocked requests return `404` (matching the legacy
host's own treatment of unguarded direct access) and are **never** proxied.

The blocked set is an explicit, conservative list in
[`worker/src/admin-guard.ts`](worker/src/admin-guard.ts): `/wp-admin` (and
everything under it), `/wp-login.php`, `/wp-signup.php`, `/wp-activate.php`,
`/wp-cron.php`, `/wp-trackback.php`, `/xmlrpc.php`.

> ⚠️ **Verify before production apply:** this is the standard WordPress core
> surface. Plugins can expose additional admin-adjacent endpoints. Confirm the
> live legacy install's actual exposed routes and add any extras to
> `admin-guard.ts`. (Open question (b) below.)

## Build & local checks

The Worker is a pnpm workspace member (`@youproof.org/migration-worker`). From
the repo root:

```bash
pnpm install
pnpm --filter @youproof.org/migration-worker run validate-manifest  # schema check
pnpm --filter @youproof.org/migration-worker run typecheck          # tsc --noEmit
pnpm --filter @youproof.org/migration-worker run build              # → worker/dist/worker.js
```

`build` runs `validate-manifest` first (via `prebuild`), so a malformed manifest
fails the build.

## Running Terraform

Normally Terraform runs through CI (see below); these are the equivalent local
commands, and the building blocks the [Cutover runbook](#cutover-runbook)
sequences. All three states live in the same R2 bucket (S3-compatible backend)
with **distinct state keys** so they never clobber each other; the
bucket/key/creds are supplied at `init` time via `-backend-config` (not
committed). The `zone/` root must be applied before `worker/` (the worker root
reads the zone ID from the zone state).

State locking is **native S3 locking** (`use_lockfile = true` in each `backend.tf`)
— a `.tflock` object written via an R2-supported conditional PutObject, no DynamoDB.
This requires **Terraform ≥ 1.11** (the roots declare `required_version >= 1.11.0`;
CI pins 1.11.4). Locally, a `terraform/.terraform-version` file pins **1.11.4**, so
tfenv auto-selects it inside the roots (run `tfenv install` once if you don't have
it yet).

> Build the Worker **before** applying `worker/` — `worker.tf` reads
> `../../worker/dist/worker.js`.

```bash
# --- zone root (owns the cloudflare_zone; run once) ---
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
terraform output name_servers   # the two NS to set at Rackhost (see runbook for timing)

# --- worker root, one environment (staging shown) ---
# The zone ID is read automatically from the zone root's state (data.tf) — no
# need to pass it. The worker root just needs the state bucket name to find it.
pnpm --filter @youproof.org/migration-worker run build   # build the bundle first
cd ../worker
export TF_VAR_cloudflare_account_id=<account-id>
export TF_VAR_tfstate_bucket=youproof-tfstate
export TF_VAR_legacy_guard_value=<guard-value>   # or put non-secret vars in a local tfvars
terraform init \
  -backend-config="bucket=youproof-tfstate" \
  -backend-config="key=cloudflare/worker/staging.tfstate" \
  -backend-config="endpoints={s3=\"https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com\"}" \
  -backend-config="access_key=$R2_STATE_ACCESS_KEY_ID" \
  -backend-config="secret_key=$R2_STATE_SECRET_ACCESS_KEY"
terraform plan -var-file=environments/staging.tfvars
terraform apply -var-file=environments/staging.tfvars
```

For production, swap `staging` → `production` for the state key and var-file, and
re-run `terraform init -reconfigure` (the backend `key` differs per environment).
The `production_cutover` variable is what the Cutover/Rollback runbooks toggle.

**Always confirm the `environment` output and resource names/IDs in the plan
match the intended environment before applying.**

## CI: `deploy-to-cloudflare` workflow

[`.github/workflows/deploy-to-cloudflare.yml`](../../.github/workflows/deploy-to-cloudflare.yml)
is a generic Cloudflare-infra pipeline, structured to grow. A `changes` job
(path filter) decides which of these run:

- **`zone`** — applies `terraform/zone/` on a **push to `stable/production`** (it
  owns account-level shared infra); on PRs that touch `zone/**` it runs plan-only.
  Bound to the `production` GitHub Environment.
- **`worker`** — deploys the Worker; the target environment is derived from the
  branch (`stable/production` push → production; otherwise staging — i.e. a
  `stable/staging` push, or a PR as a plan-only review gate). Steps: install →
  validate-manifest → typecheck → build → `terraform init` (per-env state key) →
  fmt check → plan → apply. Bound to the matching GitHub Environment.

> **Push deploys are gated by branch, not by the path filter.** On a promotion
> merge the promoted branch becomes an ancestor of the stable branch, so the
> `changes` path filter sees an empty diff and would wrongly skip the deploy.
> Applies are idempotent, so pushes just run (a no-op if nothing changed); the
> path filter is used only for the PR plan/`guard`.
- **`guard`** — runs on every PR and **fails if a PR touches `terraform/zone/**`
  together with anything else** (see the zone-promotion note below).

Apply happens only on push; PRs are plan-only. Branch → environment mapping means
a staging push can never apply production, and vice versa.

### Post-deploy smoke tests

After `terraform apply`, the `worker` job runs the dependency-free
[`@youproof.org/smoke-tests`](../../tools/smoke-tests/) suite against the
just-deployed environment:

- **Smoke tests (blocking)** — `node --test` redirect checks (admin-block, proxy/410,
  HTTP→HTTPS, www→apex, guard enforcement, migrated 301s). A failure fails the deploy.
- **Full-site link crawl (non-blocking, `continue-on-error`)** — recursively walks
  same-origin links **and checks each page's assets** (images, CSS, scripts, media),
  reporting broken links/assets and the `legacy.*` host leaking in **any response
  header**; it also probes the trailing-slash-stripped variant of every URL to exercise
  the canonical-redirect `Location` rewrite site-wide.

Both **reuse the existing environment variables** (`WORKER_DOMAIN`,
`REDIRECT_TARGET_HOST`, `LEGACY_PROXY_HOST`, and the job-level `ENVIRONMENT`) — **no new
GitHub variables**. They run on **`stable/staging` always**, but on
**`stable/production` only after cut-over** (`PRODUCTION_CUTOVER == 'true'`): pre-cut-over
`youproof.hu` still serves legacy WordPress on Rackhost, so it must not be smoke-tested.
The www→apex case self-skips outside production (the `www.staging.youproof.hu`
Universal-SSL cert gap), and the proxy-vs-`410` expectation self-selects on
`LEGACY_PROXY_HOST` presence.

### Zone changes are production-applied — keep zone PRs pure

Zone settings are **global to the single shared `youproof.hu` zone** (`staging.*`
are records within it), so `always_use_https`, HSTS, and the www→apex rule apply to
staging and production together and can't be isolated to staging. In the branch
flow a zone change is therefore a **no-op at the `stable/staging` merge** and only
**applies at the `stable/production` merge**; its pre-apply gate is the PR `plan`
diff. (Before cut-over the production apex is gray-cloud, so zone settings
effectively only reach the proxied `staging.*` / `www.*` hosts — settle zone config
around cut-over and treat later zone edits as production changes.)

To keep that production apply clean and reviewable, **a zone PR must contain only
`terraform/zone/**` changes — nothing else** (worker, docs, unrelated files go in
separate PRs). The `guard` job enforces this; make it a **required status check**
on the protected branches (`stable/staging`, `stable/production`, and `development`
if PRs target it) via GitHub branch-protection settings so a mixed PR can't merge.

CI is driven entirely by **GitHub Environment**-scoped vars/secrets (no
`-var-file`), so production and staging values never cross over and nothing
per-environment is committed. Configure these on each GitHub Environment
(`production` and `staging`):

| GitHub config | Kind | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | Provider auth — scoped as in [Cloudflare API token](#cloudflare-api-token-provider-auth). |
| `R2_STATE_ACCESS_KEY_ID` | secret | R2 access key for the state backend. |
| `R2_STATE_SECRET_ACCESS_KEY` | secret | R2 secret key for the state backend. |
| `CLOUDFLARE_ACCOUNT_ID` | var | Cloudflare account ID (also used in the R2 endpoint URL). |
| `WORKER_DOMAIN` | var | e.g. `youproof.hu` / `staging.youproof.hu`. |
| `REDIRECT_TARGET_HOST` | var | e.g. `youproof.org` / `staging.youproof.org`. |
| `LEGACY_PROXY_HOST` | var | e.g. `legacy.youproof.hu` / `legacy.staging.youproof.hu`. **Clear it (empty) post-migration** → removes the `legacy.*` record and the Worker returns `410 Gone` for unmigrated paths (see below). |
| `RACKHOST_SERVER_IP` | var | Rackhost host IP for the `legacy.*` A records (e.g. `91.227.138.40`). |
| `LEGACY_GUARD_VALUE` | var | `X-Legacy-Guard` access token (a **var**, not a secret — see below). |
| `PRODUCTION_CUTOVER` | var | **Production env only.** `true` to cut `youproof.hu` over to the Worker; defaults to `false` (stays on legacy). |
| `R2_STATE_BUCKET` | var | R2 bucket for Terraform state; the worker job also uses it to read the zone root's `zone_id`. |

The `zone` job only needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
`R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY`, and `R2_STATE_BUCKET` (it reads these
from the `production` environment). The rest are used by the `worker` job.

The `environments/*.tfvars.example` files are for **local development only** (copy
to a gitignored `*.tfvars`); CI does not read them.

### The `X-Legacy-Guard` value

`LEGACY_GUARD_VALUE` is deliberately **not** treated as a true secret. Its job is
to gate direct access to the legacy host's WordPress login (admin paths are
blocked at the Worker entirely, so this header is the only thing between a
discovered `legacy.*` URL and `wp-login.php`) and to keep `legacy.*` out of
search indexes. It is a stable, long-lived access token, so:

- It is a **GitHub Environment variable** (`vars`), not a Secret, and a Worker
  **plain-text binding**, not a Workers secret. The Terraform variable
  `legacy_guard_value` is declared **without** `sensitive = true`, so it stays
  readable in `terraform plan` output and can be retrieved to log into legacy
  WordPress admin without regenerating it.
- It is still kept **out of git** (only `*.tfvars.example` is committed).
- Because GitHub only log-masks values registered as *Secrets*, this value is
  **not** masked — no CI step or Worker code path may ever print it.

### Post-migration `410 Gone` mode

While `LEGACY_PROXY_HOST` is set, unmigrated (non-admin, non-migrated) paths are
reverse-proxied to legacy WordPress. Once the legacy site is **decommissioned**, clear
the environment's `LEGACY_PROXY_HOST` variable and redeploy: the absence of a legacy
host is the post-migration signal, so the Worker returns **`410 Gone`** for those paths
and Terraform drops the now-pointless `legacy.*` A record (its `count` is gated on the
var). Migrated paths keep 301-ing from the manifest. This is per-environment, so staging
can be switched to 410 for verification independently of production. No zone ruleset is
used for canonical redirects — pre-migration they are handled by the proxy `Location`
rewrite, and post-migration there is no origin left to redirect.

## Manual verification checklist (run against BOTH environments after deploy)

Automated coverage of the redirect-facing checks lives in
[`@youproof.org/smoke-tests`](../../tools/smoke-tests/) (run post-deploy in CI, see
[Post-deploy smoke tests](#post-deploy-smoke-tests)). This checklist remains the
authoritative superset for manual verification, especially around cut-over.

**DNS & TLS baseline — run FIRST, right after the nameserver switch, before
relying on the Worker:**

1. **NS delegation** — `dig NS youproof.hu` lists Cloudflare's assigned
   nameservers, not Rackhost's (`ns1-4.dns24.hu`). Allow a few hours for
   propagation after the Rackhost change.
2. **DNS records resolve** — `dig A legacy.youproof.hu` returns `91.227.138.40`
   directly (gray-cloud, no Cloudflare interception); the worker hosts resolve
   through Cloudflare. Same for the `staging.*` equivalents.
3. **Legacy host TLS** — hit `https://legacy.youproof.hu` and
   `https://legacy.staging.youproof.hu` directly (with the `X-Legacy-Guard`
   header) → valid TLS cert + a WordPress response. This is exactly the path the
   Worker's outbound fetch uses; it must work before the Worker is deployed.

**Worker behaviour — run after deploy:**

4. **Migrated redirect** — request a known migrated slug on the `.hu` domain →
   `301` to the correct `.org` URL, query string preserved.
5. **Unmigrated proxy** — request a known unmigrated, non-admin slug → legacy
   WordPress content renders and the address bar still shows `.hu` (no redirect).
   (Post-migration, once `LEGACY_PROXY_HOST` is cleared, the same request returns
   `410 Gone` instead.)
5b. **Canonical redirect host** — request an unmigrated page **without** its trailing
   slash → the `301` `Location` points at the public `.hu` host (e.g.
   `https://staging.youproof.hu/<page>/`), **never** the internal `legacy.*` host.
6. **Admin blocking** — request `/wp-admin` and `/wp-login.php` (+ any other
   identified admin paths) on the `.hu` domain → `404`, never proxied. Confirm
   the same paths *do* work directly against `legacy.*` with the correct
   `X-Legacy-Guard` header value (readable from the GitHub Environment variable).
7. **Guard enforcement** — request the legacy origin directly (bypassing the
   Worker) without the header → `404`.
8. **Non-GET** — a `POST` (comment/search form, if present) on a non-blocked
   path passes through to the legacy host.
9. **Trailing slash / case** — test a couple of edge-case paths to confirm
   normalization (trailing slash stripped, case-sensitive matching).
10. **www redirect (both environments)** — request `https://www.<domain>/<path>?x=1`
    → `301` to `https://<domain>/<path>?x=1` (apex/staging host), then handled by
    the Worker. Test `www.staging.youproof.hu` on staging, and `www.youproof.hu`
    on production after cut-over.
11. **HTTP → HTTPS** — request `http://youproof.hu/<path>` and
    `http://www.youproof.hu/<path>` → `301` to the `https://` equivalent (apex
    ends on `https://youproof.hu`). Repeat for the staging hosts.
12. **Manifest update flow** — add a test entry, redeploy one environment via CI,
    confirm it takes effect there without touching the other environment's state.
13. **Failure mode** — make the legacy host unreachable → Worker returns a safe
    `502`, not an unhandled exception / Cloudflare error page.
14. **Environment isolation** — confirm a staging deploy never touches production
    state or resources (check the plan's names/IDs and the `environment` output
    before any apply), and vice versa.

## Pre-flight checklist

Confirm these once before starting the [Cutover runbook](#cutover-runbook)
against real infrastructure (the runbook itself defines the ordering):

- **Legacy TLS reachable:** `legacy.youproof.hu` and `legacy.staging.youproof.hu`
  serve a valid cert over HTTPS from the public internet (baseline check 3).
- **Rackhost IP:** confirm `RACKHOST_SERVER_IP` (`91.227.138.40`) is still the
  correct legacy host IP.
- **Admin paths:** confirm the live legacy WordPress install's actual exposed
  admin/auth routes (including plugin-added endpoints) and add any beyond the
  core set already in `admin-guard.ts`.
- **CI config in place:** the scoped Cloudflare API token and R2 backend
  credentials are GitHub Environment **Secrets**, and all identifiers/domains
  (including `LEGACY_GUARD_VALUE` and `RACKHOST_SERVER_IP`) are GitHub
  Environment **variables** — all with no production/staging crossover.

## Cutover runbook

Moves `youproof.hu` from legacy WordPress (Rackhost) onto the Worker with **no
DNS downtime**, validating on staging before production is touched. The key idea:
create every Cloudflare record *before* the nameserver switch (so they're dormant
but ready), and keep production on legacy — via `production_cutover = false` —
until staging is signed off.

Complete the [Pre-flight checklist](#pre-flight-checklist) first. Commands are the
CI path (push to the mapped branch); local equivalents are in
[Running Terraform](#running-terraform).

**Phase 0 — Provision the zone (once).**
1. Apply the `zone/` root (push a `zone/**` change to `stable/production`, or run
   locally). This creates the zone **and the generic www→apex redirect rule**
   (one rule, all environments; dormant until a `www.*` record exists). Record the
   assigned nameservers: `terraform output name_servers`.
2. **Do not change nameservers at Rackhost yet.**

**Phase 1 — Provision all records while NS is still at Rackhost (dormant).**
3. Deploy `worker/` **staging** (push to `stable/staging`). Creates
   `staging.youproof.hu` → Worker, `www.staging.youproof.hu` (redirect target),
   and `legacy.staging.youproof.hu` → Rackhost.
4. Deploy `worker/` **production** with `production_cutover = false` (production
   env `PRODUCTION_CUTOVER` var unset/`false`; push to `stable/production`).
   Creates `youproof.hu` → gray-cloud Rackhost, `www.youproof.hu` (redirect
   target → apex, i.e. legacy for now), and `legacy.youproof.hu` → Rackhost, and
   uploads the production Worker (no route yet).
5. Cloudflare now holds every record but is **not** authoritative — nothing
   changes for live users.

**Phase 2 — Switch nameservers.**
6. At Rackhost, set the domain's nameservers to the two from Phase 0 (see the
   [Rackhost guide](https://www.rackhost.hu/tudasbazis/domain/hogyan-tudok-nevszervert-modositani-meglevo-domain-eseten/)).
7. Wait for propagation, then run **baseline checks 1–3** from the
   [verification checklist](#manual-verification-checklist-run-against-both-environments-after-deploy):
   NS now Cloudflare; `youproof.hu` still serves legacy WordPress (apex is gray →
   Rackhost); `staging.youproof.hu` served by the Worker; `legacy.*` reachable
   over TLS. Production is on Cloudflare DNS but still legacy — no user-facing
   change.

**Phase 3 — Validate staging.**
8. Run the full **Worker-behaviour checklist (items 4–13)** against
   `staging.youproof.hu` (including the `www.staging`→staging and HTTP→HTTPS
   checks). Fix and re-deploy staging as needed. Production is unaffected
   throughout.

**Phase 4 — Cut production over.**
9. Set the production `PRODUCTION_CUTOVER` GitHub variable to `true` and re-run
   the production worker deploy (push to `stable/production` or re-run the
   workflow). Local: `TF_VAR_production_cutover=true terraform apply -var-file=environments/production.tfvars`.
10. This flips `youproof.hu` → Worker (proxied) and binds the route.
    `www.youproof.hu` already exists (from Phase 1) and keeps redirecting to the
    apex — which now resolves to the Worker instead of legacy.
11. Run **Worker-behaviour checks 4–11** against `youproof.hu`, including the
    `www.youproof.hu` → apex redirect (item 10) and HTTP → HTTPS (item 11).

**Phase 5 — Post-cutover.**
12. Monitor error rates / 502s.
13. **Keep legacy WordPress running** — the Worker proxies unmigrated paths to
    `legacy.youproof.hu`. Do **not** decommission Rackhost. The old Rackhost DNS
    zone records are now moot (delegation moved to Cloudflare) and can be left or
    cleaned up at leisure, but the legacy host itself must keep serving.

## Rollback runbook

Unmigrated content is proxied to legacy WordPress, which stays running the whole
time — so every rollback is a variant of "point `youproof.hu` back at legacy."
Choose the smallest revert that fixes the problem.

**Scenario A — Issue during staging validation (before Phase 4).**
No production impact: `youproof.hu` is still gray → Rackhost. Nothing to roll
back. Fix the Worker/manifest, re-deploy staging, re-validate.

**Scenario B — Issue after production cutover; Cloudflare DNS healthy (PRIMARY rollback).**
1. Set the production `PRODUCTION_CUTOVER` variable back to `false` and re-run the
   production worker deploy. Local: `TF_VAR_production_cutover=false terraform apply -var-file=environments/production.tfvars`.
2. Effect: `youproof.hu` reverts to gray → Rackhost (legacy WordPress) and the
   route is destroyed. (`www.youproof.hu` stays and keeps redirecting to the apex,
   which is now legacy again — fine.) Because the apex is Cloudflare-proxied, the
   change takes effect within seconds.
3. Confirm `youproof.hu` serves legacy WordPress again, then debug the Worker on
   staging before re-attempting Phase 4.

**Scenario C — Worker bug, DNS fine, staying on the Worker.**
Fix the code/manifest (or revert the offending commit), rebuild, and re-deploy
the production worker with `production_cutover` still `true`. If a fix isn't
immediate, fall back with Scenario B while you work.

**Scenario D — Cloudflare/zone-level failure (NUCLEAR rollback).**
Only if Cloudflare DNS itself is broken. At Rackhost, revert the domain's
nameservers to Rackhost's own (e.g. `ns1-4.dns24.hu`), restoring the
pre-migration DNS for **all** of `youproof.hu`. Slower (registrar NS change +
propagation, up to hours); the Cloudflare records still exist and resume serving
when NS points back. Prefer Scenario B for Worker issues — it's far faster.

> These are ordinary Terraform applies (B/C) or a manual registrar action (D);
> none delete the `legacy.*` records or stop legacy WordPress — that is the
> fallback target and must stay up.
