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
- **Orphan pages** (unreachable from the link graph).
- **Slow pages** (response-time / availability outliers).

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
      "slowPages": []
    }
  }
}
```

- `overall == "pass"` **iff** every suite's `status == "pass"`.
- A suite is `pass` **iff** its **fatal** categories are empty. Crawler fatal
  categories: `brokenInternal`, `brokenExternal`, `legacyLeaks`, `mathErrors`,
  `redirectLoops`. `brokenExternal` is **fatal** — this is a mathematical portal,
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
