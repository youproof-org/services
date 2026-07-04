# Architecture & environments

The platform spans **two Cloudflare zones**, each with a distinct job:

- **`youproof.hu`** — the legacy domain. A Terraform-managed Cloudflare
  [migration Worker](migration-worker.md) intercepts every request and either
  **301-redirects** migrated paths to `youproof.org`, **reverse-proxies**
  unmigrated content from the legacy WordPress origin, or **blocks**
  admin/login endpoints. This is the incremental content-migration surface.
- **`youproof.org`** — the new content site. A Next.js **static export** served
  straight from a Cloudflare [R2 bucket via a CDN](cdn-and-r2.md). There is **no
  Worker on this zone**; DNS points directly at the CDN.

Both zones run in two environments — **production** and **staging** — and the
two workloads are deployed and operated independently.

## The two zones at a glance

|  | `youproof.hu` zone | `youproof.org` zone |
| --- | --- | --- |
| Workload | Migration Worker (redirect/proxy/block) | Static content site |
| Origin | Legacy WordPress (`legacy.*`) via proxy | R2 content bucket |
| Edge compute | Worker on the route | None (R2 custom domain + rulesets) |
| Terraform roots | [`zone/`](terraform-roots-and-layout.md#zone-hu) + [`worker/`](terraform-roots-and-layout.md#worker-hu) | [`org-zone/`](terraform-roots-and-layout.md#org-zone) + [`cdn/`](terraform-roots-and-layout.md#cdn) |
| Lifecycle | Redeployed on every content change (manifest regen) | Redeployed on every content/services change (static rebuild) |

## Environments

|            | `.hu` Worker bound to | `.hu` redirect target  | `.hu` legacy proxy origin      | `.org` site host           |
| ---------- | --------------------- | ---------------------- | ------------------------------ | -------------------------- |
| Production | `youproof.hu`         | `youproof.org`         | `legacy.youproof.hu`           | `youproof.org`             |
| Staging    | `staging.youproof.hu` | `staging.youproof.org` | `legacy.staging.youproof.hu`   | `staging.youproof.org`     |

For the `.hu` Worker, the first three values per environment map to the Worker
plain-text bindings `REDIRECT_TARGET_HOST`, `LEGACY_PROXY_HOST`, and
`LEGACY_GUARD_VALUE`, supplied by Terraform from per-environment GitHub
Environment vars. One Worker codebase is deployed twice with different bindings;
nothing about the domains is hardcoded in source. See
[DNS & TLS](dns-and-tls.md) and the [migration worker](migration-worker.md) doc.

Search-engine indexing is enabled on production only — the `.org` staging build
emits `noindex` (see [content site & static generation](content-site-and-static-generation.md#noindex-on-staging)).

## The `(services, content)` version-pair model

Two repositories drive the platform:

- **`youproof-org/services`** — website code (`apps/website`), the migration
  Worker, all infra-as-code, and every deploy/test workflow.
- **`youproof-org/content`** — the mathematical content model as YAML (books →
  parts → chapters). It is a private repo on the free GitHub plan, so it has no
  environment-scoped secrets and holds no deploy logic; its only job is to
  **trigger** builds in `services` (see [deploy pipeline](deploy-pipeline.md#cross-repo-triggers)).

A deployable version of the site is therefore a **pair**:
`(services_sha, content_sha)`. Everything downstream — the quality-gate
[test artifacts](quality-gates-and-artifacts.md), the production-promotion
[branch-protection rules](branching-and-branch-protection.md), and
[rollback](rollback.md) — is keyed by that pair so services and content can
never race ahead of each other into production without a validated pairing.

The branch mapping:

- services: `development` → `stable/staging` → `stable/production`
- content: `draft` → `stable/released`
- staging always combines the **latest** `stable/staging` with the **latest**
  `draft`; production is the promoted `(stable/production, stable/released)` pair.

See [branching & branch protection](branching-and-branch-protection.md) for the
full model and the promotion rules.
