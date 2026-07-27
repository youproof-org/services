# State backend & credentials setup

This is the durable setup reference for the two credentials the pipeline
depends on: the **R2 state bucket** (Terraform's backend) and the **Cloudflare
API token** (the Terraform provider's auth). They are separate credentials for
separate purposes — do not reuse one for the other. Once configured they rarely
change; this doc is the one-time bootstrap plus the GitHub Environment wiring.

## State backend: create the R2 bucket (one-time bootstrap)

All Terraform state (every root, every environment) lives in a single Cloudflare
**R2 bucket** used as an S3-compatible backend, with distinct state **keys**
keeping the roots separate. The bucket **must already exist before the first
`terraform init`** — the `s3` backend never creates its own state bucket
(chicken-and-egg: the bucket can't be stored in the state it holds), so it is a
one-time manual step, deliberately **not** managed by Terraform.

1. **Enable R2 on the account** (once): Cloudflare dashboard → **R2 Object
   Storage** → follow the prompt to enable it (a payment method may be required
   even though R2 has a free tier).
2. **Create the bucket** — dashboard: **R2 → Create bucket** → name it (e.g.
   `youproof-tfstate`), location **Automatic** → **Create bucket**. Or CLI:
   `wrangler r2 bucket create youproof-tfstate`.
3. **(Recommended) Enable object versioning** on the bucket (bucket →
   **Settings → Object versioning → Enable**) so a corrupted/clobbered state
   file can be recovered.
4. **Create S3 API credentials** — dashboard: **R2 → API → Manage R2 API Tokens
   → Create API token**. Give it **Object Read & Write**, scoped to this bucket
   (or all buckets), then **Create**. Copy the **Access Key ID** and **Secret
   Access Key** (the secret is shown only once). The same screen shows the **S3
   endpoint** — use exactly what the dashboard shows for your bucket's
   **jurisdiction**: EU buckets are
   `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` (this project's bucket is
   EU); the default jurisdiction omits the `.eu.` segment. Using the wrong one
   returns `403 Forbidden`. The endpoint is the **host only** — don't append the
   bucket name.

   > This R2 token is S3-only and is **separate** from the
   > `CLOUDFLARE_API_TOKEN` used by the Terraform provider.

5. **Record the values** and wire them where the backend/CI expect them:

   | Value | `-backend-config` key (local) | CI (GitHub Environment) |
   | --- | --- | --- |
   | Bucket name (`youproof-tfstate`) | `bucket` | var `R2_STATE_BUCKET` |
   | Account ID (in the endpoint URL) | `endpoints.s3` | var `CLOUDFLARE_ACCOUNT_ID` |
   | Access Key ID | `access_key` | secret `R2_STATE_ACCESS_KEY_ID` |
   | Secret Access Key | `secret_key` | secret `R2_STATE_SECRET_ACCESS_KEY` |

Once the bucket and credentials exist, the first `terraform init` per root
creates that root's state object (`cloudflare/zone.tfstate`,
`cloudflare/worker/{env}.tfstate`,
`cloudflare/website/{env}.tfstate`) inside this one bucket. See
[Running Terraform](terraform-roots-and-layout.md#running-terraform).

> **`R2_STATE_*` is scoped to the `youproof-tfstate` bucket only.** It is used
> solely for the Terraform state backend. The deploy's content upload and
> test-artifact upload/prune use **separate, per-environment** R2 S3 keys
> (`R2_CONTENT_*`, environment-scoped) restricted to that environment's
> `youproof-<env>-content` + `youproof-<env>-test-artifacts` buckets — see the
> secrets inventory in `infra/github/branch-protection.md` (§1) and its
> bootstrap-ordering note.

## Cloudflare API token (provider auth)

`CLOUDFLARE_API_TOKEN` is the credential the Terraform provider authenticates
with (the provider reads it from the environment; in CI it is a secret per
GitHub Environment). It is **separate** from the R2 S3 credentials
(`R2_STATE_*`).

Create it as an **account-owned token**, not a personal user token: dashboard →
**Manage Account → Account API Tokens → Create Token**. Account-owned tokens act
as a service principal — independent of any user, so the token keeps working if
its creator leaves the org, and account super-admins can rotate/revoke it.
Grant these permissions (covering everything the roots manage across both
zones). The **Token** column shows which environment's token needs each row:
`Both` = staging and production tokens; `Prod only` = production token only
(these back the shared zone roots, which apply at the production merge).

| Permission | Category | Access | Token | For |
| --- | --- | --- | --- | --- |
| Zone | Zone | Edit | Prod only | create/manage the zones (`cloudflare_zone`) |
| Zone Settings | Zone | Edit | Prod only | HSTS / `security_header` (`cloudflare_zone_setting`) |
| SSL and Certificates | Zone | Edit | Prod only | Always Use HTTPS / `always_use_https` (an SSL/edge setting) |
| Dynamic Redirect | Zone | Edit | Prod only | www→apex 301 rulesets (`cloudflare_ruleset`, `http_request_dynamic_redirect`) |
| Transform Rules | Zone | Edit | Prod only | `.org` `.html`-stripping rewrite ruleset (`cloudflare_ruleset`, `http_request_transform`) |
| Cache Settings | Zone | Edit | Prod only | `.org` cache ruleset (`cloudflare_ruleset`, `http_request_cache_settings`) |
| Cache Purge | Zone | Purge | Both | the deploy's CDN cache-purge step (`POST /zones/{id}/purge_cache`). A **distinct** permission from Cache Settings — without it the purge step returns `401`. |
| Account Rulesets | Account | Edit | Prod only | required *together with* Dynamic Redirect / Transform Rules / Cache Settings to deploy `cloudflare_ruleset` resources |
| DNS | Zone | Edit | Both | DNS records (`cloudflare_dns_record`) |
| Workers Routes | Zone | Edit | Both | `.hu` route binding + the `.org` `/api/v1/newsletter/*` route (`cloudflare_workers_route`) |
| Workers Scripts | Account | Edit | Both | the `.hu` Worker script + the newsletter Worker script (`cloudflare_workers_script`) |
| Workers R2 Storage | Account | Edit | Both | `.org` R2 buckets + custom domain (`cloudflare_r2_bucket`, `cloudflare_r2_custom_domain`) |
| D1 | Account | Edit | Both | the newsletter Worker's D1 database (`cloudflare_d1_database`) + `wrangler d1 migrations apply`. Cloudflare has no per-database token scoping — the token can reach all D1 in the account; staging/production isolation comes from separate state keys + DB names (see docs/newsletter — [Brevo setup](brevo-setup.md)). |

- **Zone resources:** scope to **All zones from your account** — the zones are
  created by Terraform, so the token can't be limited to a pre-existing zone.
  **Account resources:** your account.
- **The three rule permissions are independent:** Dynamic Redirect, Transform
  Rules, and Cache Settings each gate only their own rule type — granting one
  does not grant the others, so grant all three. Cloudflare checks them at apply
  time, not plan time: a token missing one still passes `terraform plan` but
  fails `apply` with `403 "request is not authorized"`.
- **Finding the exact group names:** in the account-owned token editor the
  Permissions field is a **searchable** list grouped by Account/Zone; edit
  access is usually the `… Write` variant. Names drift and vary by account; for
  the authoritative list run:
  `curl -s "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/tokens/permission_groups" -H "X-Auth-Email: <email>" -H "X-Auth-Key: <global-key>" | jq -r '.result[] | "\(.name)\t\(.scopes|join(","))"' | sort`
  (`scopes` shows Account vs Zone).
- **Least privilege (optional):** the production token needs all rows; the
  staging token can include just the `Both` rows. Simplest alternative: grant
  every environment's token all rows.

Paste the resulting token into each GitHub Environment as the
`CLOUDFLARE_API_TOKEN` secret.

## GitHub Environment configuration

CI is driven entirely by **GitHub Environment**-scoped vars/secrets (no
`-var-file`), so production and staging values never cross over and nothing
per-environment is committed. Configure these on each GitHub Environment
(`production` and `staging`):

| GitHub config | Kind | Purpose |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | Provider auth — scoped as above. |
| `R2_STATE_ACCESS_KEY_ID` | secret | R2 access key for the state backend. |
| `R2_STATE_SECRET_ACCESS_KEY` | secret | R2 secret key for the state backend. |
| `CLOUDFLARE_ACCOUNT_ID` | var | Cloudflare account ID (also used in the R2 endpoint URL). |
| `R2_STATE_BUCKET` | var | R2 bucket for Terraform state; per-env roots also use it to read the shared root's outputs. |
| `WORKER_DOMAIN` | var | `.hu` Worker host, e.g. `youproof.hu` / `staging.youproof.hu`. |
| `REDIRECT_TARGET_HOST` | var | `.org` redirect target, e.g. `youproof.org` / `staging.youproof.org`. |
| `LEGACY_PROXY_HOST` | var | Legacy origin, e.g. `legacy.youproof.hu`. **Clear it (empty) post-migration** → removes the `legacy.*` record and the Worker returns `410 Gone` (see [migration worker](migration-worker.md#post-migration-410-gone-mode)). |
| `RACKHOST_SERVER_IP` | var | Legacy host IP for the `legacy.*` A records. |
| `LEGACY_GUARD_VALUE` | var | `X-Legacy-Guard` access token — a **var, not a secret** (see [migration worker](migration-worker.md#the-x-legacy-guard-value)). |
| `DEFAULT_LOCALE` | var | Default locale for the `youproof.org` apex root redirect (`/` → `/<locale>`). Defaults to `hu` if unset. Must match `DEFAULT_LOCALE` in `apps/website/lib/i18n/locales.json`. |
| `WORKER_LOCALE` | var | The `.org` locale this legacy domain's paths map to (`youproof.hu` → `hu`), consumed by `gen-manifest.mjs` to build `/<locale>/<container>/<slug>` redirect targets from the shared `locales.json` dictionary. Defaults to `hu` if unset. |
| `BREVO_API_KEY` | secret | Newsletter worker: Brevo REST API key (`secret_text` binding). |
| `BREVO_WEBHOOK_TOKEN` | secret | Newsletter worker: shared secret in the Brevo webhook URL, validated on inbound webhooks (`secret_text`). |
| `TURNSTILE_SECRET` | secret | Newsletter worker: Cloudflare Turnstile secret key for server-side siteverify (`secret_text`). |
| `BREVO_SENDER_EMAIL` | var | Newsletter worker: verified Brevo sender for the confirmation email. |
| `BREVO_LIST_ID` | var | Newsletter worker: Brevo list id confirmed subscribers sync into. |
| `ALERT_EMAIL` | var | Newsletter worker: admin recipient for contact-sync failure alerts (optional; empty disables). |

> The newsletter worker's `.org` **site host** and **allowed origins** reuse the
> existing `REDIRECT_TARGET_HOST` var (the same per-env `.org` host the migration
> worker 301s to) — no separate variable. Its Brevo resources should point at a
> **separate Brevo account** for staging vs production to fully isolate the
> contact list + suppression state (see [Brevo setup](brevo-setup.md)); the
> per-environment secrets above make that a config choice.

The shared zone root (`zone/`) only needs `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `R2_STATE_ACCESS_KEY_ID`/`R2_STATE_SECRET_ACCESS_KEY`,
and `R2_STATE_BUCKET` (read from the `production` environment). The rest are
used by the per-environment deploy jobs.

> The cross-repo trigger uses one additional secret, `SERVICES_DISPATCH_TOKEN`,
> which lives in the **content** repo (not here) — see the
> [deploy pipeline](deploy-pipeline.md#cross-repo-triggers).
