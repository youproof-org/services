# Implementation Plan: youproof.hu → youproof.org Migration Worker

**Repo:** `youproof-org/services`
**Reference doc:** [Deployment Architecture](https://sytesbook.atlassian.net/wiki/spaces/YP/pages/32833537/Deployment+Architecture) (Confluence, YP space)
**Related Jira:** YP-118 (epic), YP-120, YP-121, YP-122, YP-123

## 1. Goal

Implement, as Terraform-managed infrastructure, a Cloudflare Worker that intercepts all traffic on the legacy `.hu` domain (production: `youproof.hu`, staging: `staging.youproof.hu`) and:

1. Looks up the request path in a bundled migration manifest.
2. If the path has been migrated → issues a `301` redirect to the corresponding environment's `.org` URL.
3. If not migrated, and the path is **not** an admin/login endpoint → transparently proxies the request to the environment's legacy host, injecting a secret `X-Legacy-Guard` header.
4. If the path **is** an admin/login endpoint → blocks it at the Worker (do not proxy); these endpoints must only be reachable directly via the legacy host's own domain.

The visitor's browser must always show the `.hu` worker domain for proxied (unmigrated, non-admin) content — this is a transparent reverse proxy, not a redirect.

This Worker is **environment-aware**: production and staging are two distinct deployments with distinct domains, not a single Worker handling both. No automated test suite is in scope (manual verification only, per earlier decision).

## 2. Environments

| | Worker bound to | Redirect target | Legacy proxy target |
| --- | --- | --- | --- |
| **Production** | `youproof.hu` | `youproof.org` | `legacy.youproof.hu` |
| **Staging** | `staging.youproof.hu` | `staging.youproof.org` | `legacy.staging.youproof.hu` |

These three values per environment (worker domain, redirect target, legacy host) must **not** be hardcoded in `src/index.ts`. They are environment variables (Worker bindings via `vars` in the Terraform `cloudflare_workers_script` resource), and Terraform supplies different values per environment. Use a single Worker codebase deployed twice (once per environment) rather than environment-specific source forks.

## 3. Directory Structure

```
infra/
  cloudflare/
    README.md                        # how to plan/apply, how to update the manifest, env setup
    terraform/
      zone/                          # applied ONCE, single shared state — owns the zone and all DNS
        provider.tf                  # cloudflare provider + version pin
        backend.tf                   # state key: cloudflare/zone.tfstate
        variables.tf                 # account_id, rackhost_server_ip
        zone.tf                      # cloudflare_zone for youproof.hu
        dns_hu.tf                    # ALL .hu DNS records (both environments) in one place
        outputs.tf                   # nameservers output (for Rackhost NS change)

      worker/                        # applied PER ENVIRONMENT, separate state per env
        provider.tf                  # cloudflare provider + version pin
        backend.tf                   # state key: cloudflare/worker/{env}.tfstate
        variables.tf                 # account_id, environment, worker_domain, redirect_target_host,
                                     #   legacy_proxy_host, legacy_guard_value
        worker.tf                    # cloudflare_workers_script + plain-text var bindings
        routes.tf                    # route binding for this environment's domain
        outputs.tf
        environments/
          production.tfvars.example
          staging.tfvars.example

    worker/                          # Worker source code (built by esbuild, deployed by Terraform)
      package.json
      tsconfig.json
      build.mjs                      # esbuild bundling script
      src/
        index.ts                     # fetch() entrypoint
        manifest.ts                  # typed loader for manifest.json
        manifest.json                # the static migration manifest (slug map)
        manifest.schema.json         # JSON Schema for manifest validation
        proxy.ts                     # legacy proxy logic
        redirect.ts                  # redirect logic
        admin-guard.ts               # admin/login path blocking logic
        types.ts
      dist/                          # build output (gitignored), e.g. worker.js
```

The split between `terraform/zone/` and `terraform/worker/` is load-bearing:

- **`zone/`** has a single state file (`cloudflare/zone.tfstate`) and is the sole owner of the `cloudflare_zone` resource and all DNS records. It is applied once and only needs to be re-applied when DNS records or the zone itself changes. Both environments' DNS records (`youproof.hu`, `staging.youproof.hu`, `legacy.youproof.hu`, `legacy.staging.youproof.hu`) live here together, preventing the split-ownership conflict that would arise if each environment's state tried to manage records in the same zone independently.
- **`worker/`** has two state files (`cloudflare/worker/production.tfstate`, `cloudflare/worker/staging.tfstate`). It references the zone via a `data "cloudflare_zone"` lookup (by domain name `youproof.hu`) rather than owning it — so it reads what `zone/` created without any ownership conflict. The two worker states are fully disjoint: each manages only its own `cloudflare_workers_script` and route binding, and the record names they route (`youproof.hu/*` vs `staging.youproof.hu/*`) do not overlap.

Note: if production and staging ever need *different* manifests (e.g. staging has test content not yet on production), revisit whether `manifest.json` should also be environment-specific (`manifest.production.json` / `manifest.staging.json`, selected at build time). Default assumption for now: **one shared manifest**, since staging is meant to mirror production migration progress. Flag this to the user if it turns out staging needs to diverge.

## 4. Migration Manifest (static JSON, bundled)

Per earlier decision, the manifest is static JSON bundled directly into the Worker (no KV) — every manifest update requires a Worker redeploy. Document this clearly in `infra/cloudflare/README.md` as a recurring operational step during the "incremental content migration" phase (step 4 of the 5-step plan in the architecture doc).

`infra/cloudflare/worker/src/manifest.json`:

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

Design notes for Claude Code to follow:

- Keys and values are **paths only** (leading slash, no domain, no trailing slash) — normalize incoming request paths the same way before lookup (strip trailing slash except for `/`, decode percent-encoding consistently, treat path matching as case-sensitive unless evidence suggests WordPress slugs need case-insensitive matching).
- `manifest.ts` should export a typed `lookup(path: string): string | null` function and validate the JSON shape at build/import time (fail the build if malformed) rather than trusting it blindly at runtime.
- Add a `manifest.schema.json` (JSON Schema) and a small validation script (`pnpm run validate-manifest`) runnable in CI before deploy, so a malformed manifest edit fails fast instead of breaking the live Worker.

## 5. Admin/Login Endpoint Blocking

The legacy WordPress instance's admin and login flows (e.g. `/wp-admin`, `/wp-login.php`, and related paths) must **never** be reachable through the public `.hu` Worker domain — they should only be accessed directly against the legacy host's own domain (`legacy.youproof.hu` / `legacy.staging.youproof.hu`), where the security guard header is presumably checked by the legacy host itself for direct access too.

`admin-guard.ts` should export a function like `isBlockedAdminPath(path: string): boolean` matching a small, explicit list of patterns — don't try to be clever with broad regexes that might over- or under-match. At minimum:

- `/wp-admin` and anything under it (`/wp-admin/*`)
- `/wp-login.php`
- Any other WordPress core admin/auth endpoints the legacy site actually exposes (Claude Code should check the live legacy WordPress install's actual routes rather than assuming a generic list, since plugins can add additional admin-adjacent endpoints)

When a request matches a blocked pattern, the Worker should return a `404` (matching the same "not found" treatment the legacy host itself uses for unguarded direct access, per the architecture doc) rather than any response that confirms the path exists. Do not proxy these requests under any circumstances, even with the guard header — the point is that the public domain should behave as if these paths don't exist at all.

## 6. Worker Logic (`src/index.ts`)

Pseudocode for the `fetch` handler:

```
on fetch(request, env):
  // env.REDIRECT_TARGET_HOST, env.LEGACY_PROXY_HOST, env.LEGACY_GUARD_SECRET
  // are environment-specific bindings supplied by Terraform per deployment.

  url = parse(request.url)
  normalizedPath = normalize(url.pathname)

  if isBlockedAdminPath(normalizedPath):
    return new Response("Not Found", { status: 404 })

  newPath = manifest.lookup(normalizedPath)

  if newPath is not null:
    return Response.redirect(`https://${env.REDIRECT_TARGET_HOST}${newPath}${url.search}`, 301)

  // Not migrated, not blocked — transparent proxy to the environment's legacy host
  legacyUrl = new URL(request.url)
  legacyUrl.hostname = env.LEGACY_PROXY_HOST

  proxiedRequest = new Request(legacyUrl, request)
  proxiedRequest.headers.set("X-Legacy-Guard", env.LEGACY_GUARD_SECRET)

  response = await fetch(proxiedRequest)
  return response
```

Things Claude Code should explicitly handle and document in code comments:

- **Method/body passthrough** — proxy all HTTP methods and bodies (`new Request(url, request)` preserves these), not just `GET`.
- **Query strings** — preserved on both the redirect and the proxy paths.
- **Host header** — when proxying, the outgoing request's `Host` header must be `env.LEGACY_PROXY_HOST` so the shared-host vhost routes correctly; verify in the manual test plan (Section 9).
- **No response rewriting needed** — per the user's confirmation, `WP_HOME`/`WP_SITEURL` are correctly set to the public `.hu` domain per environment, so legacy WordPress should not emit `Location` headers pointing at the internal `legacy.*` hostname. Skip building header-rewriting logic; just note this assumption in a code comment in case it's ever revisited.
- **Error handling** — if the fetch to the legacy host fails (timeout, 5xx, DNS), return a safe fallback (e.g. a generic 502 page) rather than letting an unhandled exception surface a Cloudflare error page with internal details.
- **No caching of proxied responses at the Worker layer** — caching is handled by Cloudflare's CDN config per the architecture doc, not the Worker itself.

## 7. Terraform (`infra/cloudflare/terraform/`)

### State backend

Both Terraform roots use the same R2 bucket as their backend (S3-compatible, using the `s3` backend type pointed at the R2 endpoint), but with distinct state keys so they never share or clobber state:

- `zone/` → state key `cloudflare/zone.tfstate`
- `worker/` → state keys `cloudflare/worker/production.tfstate` and `cloudflare/worker/staging.tfstate`

Claude Code should verify the exact R2-compatible backend configuration syntax against Cloudflare's current docs rather than assuming, since S3-compatible backend config (endpoints, path-style addressing flags, etc.) has had minor changes across Terraform versions.

### `zone/` root — applied once, shared state

This root is the sole owner of the `cloudflare_zone` resource and all DNS records. It has no concept of "environment" — it manages the single `youproof.hu` zone and every DNS record needed by both environments in one place.

Using the `cloudflare/cloudflare` Terraform provider (latest published version — confirm exact resource/attribute names against current provider docs rather than assuming from training data):

**Zone setup and nameserver delegation**

The `youproof.hu` Cloudflare zone is provisioned by Terraform — no manual dashboard step is needed to create it. After `terraform apply` on the `zone/` root, the assigned Cloudflare nameservers are surfaced as an output so you know exactly what to enter at Rackhost without looking them up in the dashboard.

The one step that remains manual is the nameserver change at Rackhost, since that is outside Cloudflare's and Terraform's control:

1. Run `terraform apply` in `terraform/zone/` — provisions the `cloudflare_zone` resource and outputs the assigned nameservers (e.g. `alice.ns.cloudflare.com` / `bob.ns.cloudflare.com`).
2. In the Rackhost admin panel: **Domains → youproof.hu → Részletek → Névszerverek módosítása**, create a new DNS profile pointing to the two nameservers from the Terraform output and apply it to the domain. See [Rackhost documentation on nameserver changes](https://www.rackhost.hu/tudasbazis/domain/hogyan-tudok-nevszervert-modositani-meglevo-domain-eseten/) for the step-by-step UI flow.
3. Once DNS propagates (typically minutes to a few hours), Cloudflare becomes the authoritative resolver for `youproof.hu` and all its subdomains.

**Important:** the `youproof.hu` zone in Cloudflare takes over DNS for all subdomains — Rackhost's zone file for these names becomes irrelevant once the NS delegation switches. All DNS records are recreated in Cloudflare via Terraform (see below). **Do not remove the Rackhost zone records until after the NS switch is confirmed working and legacy WordPress is verified reachable via the new DNS.**

**Resources in `zone/`:**

- **`zone.tf`** — `cloudflare_zone` resource for `youproof.hu`. All other resources in this root reference the zone via `cloudflare_zone.youproof_hu.id`.

- **`dns_hu.tf`** — all `cloudflare_record` resources, covering both environments. Rackhost's server IP (`91.227.138.40`) sourced from `var.rackhost_server_ip`. Records to provision:

  | Name | Type | Value | Proxied? | Notes |
  |---|---|---|---|---|
  | `youproof.hu` | A | `192.0.2.1` | **Yes (orange cloud)** | Placeholder IP; Cloudflare intercepts before it's reached; Worker handles all traffic |
  | `www.youproof.hu` | A | `192.0.2.1` | **Yes** | Confirm with user whether `www` should also route through the Worker |
  | `staging.youproof.hu` | A | `192.0.2.1` | **Yes** | Same pattern for staging Worker |
  | `legacy.youproof.hu` | A | `91.227.138.40` | **No (gray cloud)** | Direct DNS to Rackhost; Worker's outbound fetch reaches this over HTTPS |
  | `legacy.staging.youproof.hu` | A | `91.227.138.40` | **No (gray cloud)** | Same |

  Records **not** to recreate (dropped intentionally): `www.legacy.*` variants, MX records, SPF and DMARC TXT records — `youproof.hu` is not used as an email domain.

  Note on TLS for `legacy.*`: these hosts resolve directly to Rackhost (gray-cloud, no Cloudflare TLS termination). The Worker's outbound `fetch()` uses HTTPS, so Rackhost must serve a valid TLS certificate for these subdomains. Confirm Rackhost auto-provisions Let's Encrypt certificates; if not, arrange this before deploying the Worker.

- **`outputs.tf`** — expose `cloudflare_zone.youproof_hu.name_servers` so assigned nameservers are readable via `terraform output`.

- **`variables.tf`** for `zone/`:

  ```hcl
  variable "cloudflare_account_id" {}
  variable "rackhost_server_ip"    {}   # 91.227.138.40, sourced from GitHub Environment variable
  ```

### `worker/` root — applied per environment, separate state per env

This root manages only the Worker script and its route binding. It references the zone via a `data "cloudflare_zone"` lookup by domain name (`youproof.hu`) rather than owning it — so it reads the zone ID without any risk of conflicting with or destroying resources owned by `zone/`.

**Resources in `worker/`:**

- **`worker.tf`** — `cloudflare_workers_script` uploading the bundled `dist/worker.js`, with plain-text `vars` bindings for `REDIRECT_TARGET_HOST`, `LEGACY_PROXY_HOST`, and `LEGACY_GUARD_VALUE`, sourced from per-environment tfvars.

- **`LEGACY_GUARD_VALUE` binding** — plain text Worker `vars` binding (not a Workers secret). Not treated as a true secret: its purpose is to keep `legacy.*` out of search engine indexing and to gate direct access to the legacy WordPress login form. Stable and long-lived so the user can read it from GitHub to inject the header when accessing the WordPress admin dashboard directly.
  - Store as a **GitHub Environment variable** (not a Secret), per environment.
  - Declare Terraform variable **without** `sensitive = true` so `terraform plan` output is not redacted.
  - Worker code and CI steps must not log this value, since it won't get GitHub's automatic masking.

- **`routes.tf`** — binds the Worker to `<worker-domain>/*` on the zone, using the zone ID from the `data "cloudflare_zone"` lookup.

- **`variables.tf`** for `worker/`:

  ```hcl
  variable "cloudflare_account_id"  {}
  variable "environment"            {}   # "production" or "staging"
  variable "worker_domain"          {}   # "youproof.hu" or "staging.youproof.hu"
  variable "redirect_target_host"   {}   # "youproof.org" or "staging.youproof.org"
  variable "legacy_proxy_host"      {}   # "legacy.youproof.hu" or "legacy.staging.youproof.hu"
  variable "legacy_guard_value"     {}   # plain-text guard header value, no sensitive = true
  ```

`environments/production.tfvars.example` and `environments/staging.tfvars.example` document all required variables with the correct domain values per Section 2.

## 8. CI: `deploy-to-cloudflare` Workflow

A generic `deploy-to-cloudflare` workflow (`.github/workflows/deploy-to-cloudflare.yml`) that covers both Terraform roots and will grow as more Cloudflare infrastructure is added. Three distinct jobs, reflecting the three independent applies:

**`zone` job** — applies `terraform/zone/`, triggered on changes to `infra/cloudflare/terraform/zone/**`. Has no environment concept — runs once, manages the shared zone and all DNS records. Because this job owns the `cloudflare_zone` resource and all DNS records for both environments, it should run on pushes to `stable/production` only (or a dedicated `infra` branch if you introduce one), not on every staging push. Inject `TF_VAR_cloudflare_account_id`, `TF_VAR_rackhost_server_ip` (GitHub Environment variables), R2 backend credentials, and `CLOUDFLARE_API_TOKEN` (GitHub Secrets).

**`worker-staging` job** — applies `terraform/worker/` with `environments/staging.tfvars`, triggered on pushes to `stable/staging` with path filter `infra/cloudflare/terraform/worker/**` or `infra/cloudflare/worker/**` (Worker source or Terraform config changed). Steps: checkout → install Node/pnpm → validate manifest → run esbuild → `terraform init` → `terraform plan -var-file=environments/staging.tfvars` → `terraform apply -auto-approve`. Inject staging-scoped GitHub Environment variables (`TF_VAR_legacy_guard_value`, `TF_VAR_worker_domain`, etc.) and staging-scoped Secrets (`TF_VAR_cloudflare_account_id`, R2 credentials, `CLOUDFLARE_API_TOKEN`).

**`worker-production` job** — same as above but for `stable/production` with production-scoped variables and `environments/production.tfvars`.

All three jobs: plan-only on PRs (no `apply`), apply on push. Staging variables are never available to the production job and vice versa — same no-crossover convention used by the site deploy pipeline. Job names (`zone`, `worker-staging`, `worker-production`) are specific enough to be meaningful but don't encode assumptions that would need renaming when a future `website` job is added.

## 9. Manual Verification Checklist (no automated tests)

Document this in `infra/cloudflare/README.md`, to be run against **both** environments after deploy. Steps 1–3 should be run immediately after the nameserver switch, before full Worker deployment, to confirm the DNS foundation is correct.

**DNS and TLS baseline (run first, before testing the Worker):**

1. **NS delegation** — run `dig NS youproof.hu` and confirm the response lists Cloudflare's assigned nameservers, not `ns1-4.dns24.hu`. Allow up to a few hours for propagation after the Rackhost nameserver change.
2. **DNS records resolve correctly** — confirm `dig A youproof.hu` returns `192.0.2.1` (or is intercepted by Cloudflare's anycast, depending on tool); confirm `dig A legacy.youproof.hu` returns `91.227.138.40` directly (gray-cloud, no Cloudflare interception). Same for the `staging.*` equivalents.
3. **Legacy host TLS** — hit `https://legacy.youproof.hu` and `https://legacy.staging.youproof.hu` directly (with the `X-Legacy-Guard` header) and confirm a valid TLS certificate and a WordPress response. This is the path the Worker's outbound fetch will use — it must work before the Worker is deployed.

**Worker behaviour (run after Worker deploy):**

4. **Migrated path redirect** — request a known migrated slug on the `.hu` worker domain; confirm a `301` to the correct `.org` URL for that environment, with query string preserved.
5. **Unmigrated path proxy** — request a known unmigrated, non-admin slug; confirm the response renders legacy WordPress content and the browser address bar still shows the `.hu` worker domain (no redirect).
6. **Admin/login blocking** — request `/wp-admin` and `/wp-login.php` (and any other identified admin paths) on the public `.hu` worker domain; confirm a `404` and that the request is never proxied. Then confirm the same paths **do** work when hit directly against `legacy.youproof.hu` / `legacy.staging.youproof.hu` with the correct `X-Legacy-Guard` header value (readable from the GitHub Environment variable).
7. **Guard header enforcement** — directly request the legacy host without the header; confirm a `404`.
8. **Non-GET methods** — confirm a `POST` (e.g. a comment form or search, if present) passes through the Worker correctly for non-blocked paths.
9. **Trailing slash / case variants** — test a couple of edge-case paths to confirm normalization behaves as intended; document the chosen behaviour.
10. **Manifest update flow** — add a test entry to `manifest.json`, redeploy via the CI pipeline for one environment, and confirm it takes effect there without affecting the other environment's state.
11. **Failure mode** — simulate an unreachable legacy host to confirm the Worker degrades gracefully (safe fallback response, not an unhandled exception).
12. **Environment isolation** — confirm a staging deploy never touches production Terraform state or Cloudflare resources, and vice versa (check the `terraform plan` output names/IDs match the intended environment before any `apply`).

## 10. Suggested Task Breakdown for Claude Code

1. Scaffold `infra/cloudflare/worker/` (package.json, tsconfig, esbuild script) and `manifest.json` + `manifest.schema.json` + validator script.
2. Implement `src/index.ts`, `manifest.ts`, `proxy.ts`, `redirect.ts`, `admin-guard.ts`, `types.ts` per Sections 5–6, using environment bindings rather than hardcoded domains.
3. Identify the actual set of admin/login paths to block by checking the legacy WordPress install's exposed routes — confirm with the user if uncertain which plugins/endpoints are in use.
4. Scaffold `infra/cloudflare/terraform/zone/` per Section 7:
   - `zone.tf`, `dns_hu.tf`, `variables.tf`, `outputs.tf`, `provider.tf`, `backend.tf`
   - Confirm exact current `cloudflare` provider resource/attribute names and R2-backend syntax against provider docs before writing.
5. Scaffold `infra/cloudflare/terraform/worker/` per Section 7:
   - `worker.tf`, `routes.tf`, `variables.tf`, `outputs.tf`, `provider.tf`, `backend.tf`
   - `environments/production.tfvars.example` and `environments/staging.tfvars.example`
6. Write `infra/cloudflare/README.md` covering: architecture summary, explanation of the `zone/` vs `worker/` split and why it matters, environment table (Section 2), the nameserver change procedure (link to [Rackhost docs](https://www.rackhost.hu/tudasbazis/domain/hogyan-tudok-nevszervert-modositani-meglevo-domain-eseten/)), how to update the manifest and redeploy, how to plan/apply each root, the full manual verification checklist (Section 9) including DNS/TLS baseline steps.
7. Add `.github/workflows/deploy-to-cloudflare.yml` (Section 8) with `zone`, `worker-staging`, and `worker-production` jobs.
8. Before any `terraform apply` against real infrastructure, confirm with the user:
   - That `legacy.youproof.hu` and `legacy.staging.youproof.hu` are reachable over HTTPS (TLS cert valid on Rackhost).
   - The actual list of admin/login paths exposed by the legacy WordPress install.
   - That the scoped Cloudflare API token, R2 backend credentials, and all GitHub Environment variables are in place.
   - The apply order: `zone/` first (to provision the zone and DNS, then change nameservers at Rackhost and wait for propagation), then `worker/` per environment once DNS is confirmed working.
