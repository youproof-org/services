# Quality gates & test artifacts

After every deploy, a quality gate runs the full test suite against the deployed
`(services_sha, content_sha)` pair and writes a JSON **test artifact** to the
environment's test-artifacts R2 bucket. Those artifacts are what the
[production-promotion PR gate](branching-and-branch-protection.md#required-status-check-the-artifact-lookup-pr-gate)
looks up, and what a failed production run triggers a [rollback](rollback.md) on.

The suite lives in [`tools/smoke-tests`](../tools/smoke-tests) and runs via
`pnpm --filter @youproof.org/smoke-tests quality-gate`. It has two parts: a
blocking **smoke** suite (`node --test` redirect/behavior checks) and a
**crawler** that recursively walks the site.

## Pipeline gate catalogue

Every gate currently enforced, verified against the workflows (not just the plan).
All are blocking unless noted.

| Gate | Where it runs | Checks |
| --- | --- | --- |
| Worker typecheck | `deploy.yml` (worker job) + `deploy-to-cloudflare.yml` (PR plan) | `tsc --noEmit` on the migration worker |
| Manifest validation | worker `prebuild` → `validate-manifest.mjs` | manifest.json vs `manifest.schema.json` (AJV) + no self-redirects |
| Worker build | `deploy.yml` | esbuild bundles worker + inlined manifest |
| Website build | `deploy.yml` (website job) | `next build` — **also runs ESLint + `tsc`** on the site (no `ignoreDuringBuilds`/`ignoreBuildErrors`) |
| Figure compile | website `prebuild` → `sync-figures.mjs` | aborts the build on any `.tex`→SVG failure (no broken `<img>` ships) |
| `.hu` smoke tests | `deploy.yml` (quality-gate job, `node --test`) | worker 301/404/410 redirect semantics |
| Post-deploy crawler | `deploy.yml` (quality-gate) | live-site links/assets/manifest-targets/SEO; writes the artifact (see below) |
| Promotion PR gate | `pr-gate.yml` (required on PRs → `stable/production`/`released`) | staging artifact exists **and** `overall == "pass"` |
| branch-source-guard | `branch-source-guard.yml` | promotion PRs come from the allowed source branch |
| zone-purity-guard | `zone-purity-guard.yml` | a promotion delta doesn't mix `terraform/zone/` with non-zone changes |
| Terraform fmt/plan | `deploy-to-cloudflare.yml` (PR, plan-only) | zone/worker/website roots format + plan cleanly |

### Gaps & proposals

- **No website build/lint/typecheck on PRs to `development`.** The website is
  linted + typechecked, but only inside `next build` in the **deploy** path — so a
  type/lint error surfaces at deploy time, not at PR review. *Proposal:* a fast
  PR CI running `next build` + worker `typecheck` before merge.
- **Worker has no ESLint** (only `tsc`). Low risk given its size; add a lint step
  if it grows.
- **No pre-commit hooks** — all enforcement is CI-side. Acceptable for this team;
  noted so it's a deliberate choice, not an oversight.
- **gen-manifest empty-content** is now covered by a unit test (YP-122 item 10b).

## When the checks run

- **Staging quality checks** — run automatically after every successful staging
  deploy, against the `(stable/staging, draft)` pair, writing the artifact to
  `youproof-staging-test-artifacts`. This is the artifact the production-promotion
  gate consumes.
- **Production pre-merge PR gate** — a required CI check on PRs targeting
  `stable/production` / `stable/released` downloads the relevant staging
  artifact and blocks the PR if it indicates problems (see
  [branch protection](branching-and-branch-protection.md)).
- **Production post-deploy check** — after a successful production deploy the
  same suite runs against production, writing to
  `youproof-production-test-artifacts`. If it indicates problems it triggers the
  [rollback workflow](rollback.md).

## Crawler checks

Building on the existing legacy-site crawler, the suite covers a static math
knowledge base:

- Broken **internal** links and missing images/assets (fatal).
- Broken **external** links (fatal — every outbound link on a math portal must
  resolve; only `403`/`429` rate-limit/bot-block responses are ignored).
- **Dead migration targets** (fatal) — every `.org` path a migrated legacy
  redirect points at (the worker manifest's values, passed to the gate as a
  workflow artifact) must return `200` on the live site. Catches a manifest entry
  that 301s to a `.org` URL which doesn't resolve — e.g. `generate-manifest`
  drifting from the site's routes — which neither the `.hu` redirect smoke test
  (only checks the 301 *points* there) nor a link-following crawl (never visits a
  wrong/unlinked path) would catch. Recorded under `brokenInternal`, tagged
  `via "migration manifest target"`.
- `legacy.*` host leaking in any response header (the `.hu` origin must never be
  exposed).
- **Math-render errors** (malformed math output).
- **Redirect loops** (e.g. between the `.hu` redirect worker and `.org`).
- **Orphan pages** (unreachable from the link graph). `/sitemap.xml` is a
  `<sitemapindex>`, so the child sitemaps are fetched and their page URLs unioned
  before the comparison — an index's `<loc>`s are child sitemaps, not pages.
- **Slow pages** (response-time / availability outliers).
- **A truncated crawl** (fatal) — hitting `MAX_PAGES` leaves the unreached pages
  out of every other category and turns them into orphan reports, so it fails the
  gate instead of degrading it.

## Test artifact schema

Reports are JSON, `schemaVersion: 1`:

```json
{
  "schemaVersion": 1,
  "environment": "staging",
  "servicesSha": "<40-hex>",
  "contentSha": "<40-hex>",
  "generatedAt": "<ISO-8601>",
  "overall": "pass",
  "suites": {
    "smoke": {
      "status": "pass",
      "total": 0, "passed": 0, "failed": 0,
      "cases": [{ "name": "", "status": "pass", "detail": "" }]
    },
    "crawler": {
      "status": "pass",
      "pagesCrawled": 0,
      "brokenInternal": [], "brokenExternal": [], "legacyLeaks": [],
      "mathErrors": [], "orphanPages": [], "redirectLoops": [],
      "slowPages": [], "langErrors": [], "seoErrors": [], "robotsErrors": [],
      "crawlLimits": [], "seoWarnings": []
    }
  }
}
```

- `overall == "pass"` **iff** every suite's `status == "pass"`.
- A suite is `pass` **iff** its **fatal** categories are empty. Crawler fatal
  categories: `brokenInternal`, `brokenExternal`, `legacyLeaks`, `mathErrors`,
  `redirectLoops`, `langErrors`, `seoErrors`, `robotsErrors`, `crawlLimits`.
  `brokenExternal` is **fatal** — this is a mathematical portal,
  so every outbound link must resolve; a broken one means the content is stale
  (SEO / consistency risk) and should be fixed. Only `orphanPages`, `slowPages`,
  and external `403`/`429` rate-limited hosts (bot-block/rate-limit, dropped, not
  emitted) are treated as non-fatal warnings.

## Bucket layout, PR-gate lookup, retention

- **Object key** within the environment's test-artifacts bucket:
  `reports/{services_sha}__{content_sha}.json` (the environment is implied by
  the bucket). A copy of the newest is also written to `reports/latest.json` for
  convenience.
- **PR-gate lookup:** the gate resolves the exact `(services_sha, content_sha)`
  pair required by branch-protection rule 2 or 3, fetches
  `reports/{pair}.json`, and passes only if it exists **and** `overall == "pass"`.
  A missing report (e.g. because the staging test failed and produced none) fails
  the check.
- **Retention:** the deploy's quality-gate job **prunes automatically** after
  each upload, keeping the newest **30** pair-reports per environment (by R2
  object `LastModified`; `reports/latest.json` is never pruned). Pruning is
  best-effort — a prune failure is logged but never fails the deploy. This
  retention window also bounds how far back [rollback](rollback.md) can look for
  a last-known-good production pair.
