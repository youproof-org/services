# youproof.org infrastructure & pipeline docs

Durable reference for the `youproof.org` platform: the two Cloudflare zones
(`youproof.hu` migration worker + `youproof.org` content site), the Terraform
that manages them, the CI/CD pipeline that builds and deploys the site, and the
quality gates and rollback that keep production healthy.

These docs describe the system **as built**. One-time cutover procedures (the
`youproof.hu` → Cloudflare nameserver migration) have been completed and their
runbooks removed; what remains is the ongoing operational reference.

Historical planfiles for the work that produced this system live under
[`plans/`](plans/) and are not part of this reference.

## Contents

| Doc | Topic |
| --- | --- |
| [Architecture & environments](architecture-and-environments.md) | Both zones, the two workloads, and the `(services, content)` version-pair model. |
| [Terraform roots & directory layout](terraform-roots-and-layout.md) | The four roots (`zone`/`worker` for `.hu`, `org-zone`/`cdn` for `.org`) and the shared-vs-per-env state split. |
| [State backend & credentials](state-backend-and-credentials.md) | R2 state-bucket bootstrap, the Cloudflare API token, and the GitHub Environment config. |
| [DNS & TLS reference](dns-and-tls.md) | DNS records, redirects, HTTPS/HSTS, and TLS coverage for both zones. |
| [Migration worker](migration-worker.md) | The `youproof.hu` Worker: generated manifest, admin blocking, build, `410` mode. |
| [Content site & static generation](content-site-and-static-generation.md) | The `youproof.org` static export: `published`/`legacy-path`, stubs, canonical paths, staging noindex. |
| [CDN & R2](cdn-and-r2.md) | Serving the `.org` site from R2: custom domain, `.html` stripping, cache rules, deploy-time purge, custom-404 limitation. |
| [Branching & branch protection](branching-and-branch-protection.md) | The branch model across both repos, the promotion rules, and merge-commit-only. |
| [Deploy pipeline & cross-repo triggers](deploy-pipeline.md) | The ordered deploy steps and the `content` → `services` `repository_dispatch` mechanism. |
| [Quality gates & test artifacts](quality-gates-and-artifacts.md) | Staging/production checks, the JSON artifact schema, the PR gate, and retention. |
| [Rollback strategy](rollback.md) | Fully automatic, forward-only rollback on a failed production test. |
