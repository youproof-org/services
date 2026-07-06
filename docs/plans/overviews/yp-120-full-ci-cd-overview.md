# YP-120 — Full CI/CD Pipeline: Implementation Overview

> Delivery overview for the youproof.org CI/CD pipeline backlog item. Companion
> to the design planfile [`../yp-120-full-ci-cd-plan.md`](../yp-120-full-ci-cd-plan.md).
> Durable architecture/operational reference lives under [`../../`](../../) (see
> [`docs/README.md`](../../README.md)).

## What was built

The work was subdivided into seven file-disjoint work-streams, coordinated by a
shared interface contract so they'd integrate, run as parallel sub-agents, then
reviewed adversarially across the whole diff with the review findings fixed.

**Website → static export** (`apps/website`): flipped to `output: 'export'`,
added the `published`/`legacy-path` chapter fields, `not-found.tsx` +
not-migrated/unavailable stub pages, and a `SITE_ENV=staging` noindex gate
(default-safe: only the literal `staging` ever suppresses indexing). Verified
with full staging *and* production static builds.

**Worker manifest → generated from content**: new `gen-manifest.mjs` walks the
content hierarchy and emits the redirect manifest from every published chapter's
`legacy-path`, replacing the hand-edited file. Validated end-to-end against the
real content.

**Terraform → single shared `zone/` root + per-env `website/`**: the shared
`zone/` root owns BOTH zones (`youproof.hu` and `youproof.org` + the latter's
settings, www-redirect, `.html`-stripping transform rule, and cache rules); the
per-env `website/` root owns the R2 buckets + R2 custom domain. So the layout is
one shared `zone/` root plus two per-env roots (`worker/` for `.hu`, `website/`
for `.org`) — no separate `org-zone`/`cdn` roots. `terraform validate`-clean
against the real Cloudflare v5.21 provider.

**Quality gate**: `tools/smoke-tests` now emits the JSON test artifact and adds
math-render-error, redirect-loop, orphan-page, and slow-page checks.

**GitHub workflows**: a reusable `deploy.yml` (resolve pair → infra → worker →
website build+upload+purge → quality gate → auto-rollback), the existing
workflow rewritten into a push/dispatch router + PR plan-gates, `rollback.yml`,
and `pr-gate.yml` implementing branch-protection rules 2 & 3 via merge-commit
second-parent lookups. Plus a branch-protection runbook + `gh api` script.

**Content repo** (branch `feat/yp-120-cicd-content-support`, committed locally,
**not pushed**): the `repository_dispatch` trigger workflow, the content-release
PR gate, field docs, and two example chapters.

**Docs**: `infra/cloudflare/README.md` removed and reorganized into 12 focused
topic files under `docs/`, cutover-specific content dropped, extended with all
the new pipeline topics.

## Key decisions

Owner decisions: **deliver-don't-apply**, **content-repo mechanism-only**,
**fully-automatic forward-only rollback**. Beyond those, the notable
implementation decisions:

- **Canonical path = `/books/{book}/chapters/{chapter}`** (parts/sections aren't
  in the URL), used identically by the manifest generator and the site's
  routes — one rule, two consumers.
- **`.html` stripping** via a zone-level Transform Rule (no worker on the `.org`
  zone); cache-busting via deploy-time purge, not content hashing.
- **Smoke tests stay `.hu`-only**; the `.org` post-deploy gate runs crawler-only
  (`SKIP_SMOKE=1`), because the redirect assertions are meaningless against the
  static `.org` site.
- **PR gates fail closed** when the required artifact pair is absent (the
  intended block).

## Verification & the one real bug

Mechanical checks pass (tf fmt, `node --check`, actionlint, YAML parse). The
integration review caught **one HIGH bug**: the quality-gate report was written
in the package dir (pnpm `--filter` cwd) but uploaded from repo root, so the
artifact never landed — which would have permanently blocked every promotion and
fired rollback on healthy deploys. **Fixed** (absolute `REPORT_OUT`). Also
removed a `paths:` filter that could skip a promotion deploy. The review flagged
one config trap (PR-gate R2 secrets must be repo-level) that the runbook already
documents.

## What's left for the owner (privileged/manual steps)

All documented in [`../../../infra/github/branch-protection.md`](../../../infra/github/branch-protection.md):

- Create the secrets/vars (`CONTENT_REPO_TOKEN`, `SERVICES_REPO_TOKEN`,
  `SERVICES_DISPATCH_TOKEN`, R2 creds).
- Apply the `zone/` root (both zones) + per-env `website/` Terraform and
  delegate the `youproof.org` nameservers.
- Run the branch-protection script.
- Push the content branch.
- Backfill the real `legacy-path` values (the two committed ones are
  clearly-marked examples).

Nothing on the services side is committed yet — it's all staged in the working
tree for review.

**Worth extra scrutiny during review:** the PR-gate ancestor-tracking logic
(rules 2/3) is faithful to the plan but never ran live, so it's the piece to
check most carefully.
