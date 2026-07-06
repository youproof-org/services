# @youproof.org/smoke-tests

Post-deploy smoke tests and a recursive link crawler for the `youproof.hu → .org`
migration Worker, plus the **quality gate** that folds both into a single JSON test
artifact for the YP-120 CI/CD pipeline. Dependency-free — Node built-ins only
(`node:test`, `node:assert`, `node:test`'s `run()` API, global `fetch`). Runs against
a live, already-deployed environment.

## Environment variables

The smoke/crawl vars reuse the **existing** deploy vars — no new ones are introduced;
base URL, www host, and pre/post-migration mode are derived. The quality-gate
entrypoint reads a few extra vars to stamp/route the artifact.

| Var                    | Used for                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `WORKER_DOMAIN`        | Public host under test, e.g. `staging.youproof.hu` (⇒ base URL) |
| `REDIRECT_TARGET_HOST` | Migrated-path 301 target, e.g. `youproof.org`                  |
| `LEGACY_PROXY_HOST`    | Legacy origin; **empty ⇒ post-migration (410) mode**          |
| `ENVIRONMENT`          | `production` / `staging` (gates the www→apex case)            |

Quality-gate-only vars (all optional; used by `scripts/quality-gate.mjs`):

| Var            | Used for                                                                    |
| -------------- | --------------------------------------------------------------------------- |
| `REPORT_OUT`   | Path to write the JSON artifact (default `./quality-gate-report.json`)      |
| `SERVICES_SHA` | 40-hex services commit — stamped into the report + used for the object key  |
| `CONTENT_SHA`  | 40-hex content commit — stamped into the report + used for the object key   |
| `GENERATED_AT` | ISO-8601 timestamp for the report (default: now)                            |

## Running

```sh
# Blocking redirect suite (deterministic)
WORKER_DOMAIN=staging.youproof.hu \
LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
REDIRECT_TARGET_HOST=youproof.org \
ENVIRONMENT=staging \
pnpm --filter @youproof.org/smoke-tests test

# Full-site link crawl (non-blocking; reports broken links + legacy-host leaks)
WORKER_DOMAIN=staging.youproof.hu \
LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
pnpm --filter @youproof.org/smoke-tests crawl

# Quality gate — runs the smoke suites + the crawler and writes the JSON artifact
WORKER_DOMAIN=staging.youproof.hu \
LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
REDIRECT_TARGET_HOST=youproof.org \
ENVIRONMENT=staging \
SERVICES_SHA="$SERVICES_SHA" CONTENT_SHA="$CONTENT_SHA" \
REPORT_OUT=./quality-gate-report.json \
pnpm --filter @youproof.org/smoke-tests quality-gate
```

## What runs where

- **`tests/redirects.test.mjs`** (blocking in CI) — admin-block 404s, unmigrated
  proxy/410, HTTP→HTTPS, www→apex (production only, due to the `www.staging` Universal-SSL
  cert gap), guard-header enforcement, and migrated-path 301s from the Worker manifest.
  Cases self-skip when not applicable.
- **`scripts/crawl.mjs`** (non-blocking in CI) — recursively walks same-origin links
  **and checks each page's assets** (images, stylesheets, scripts, media, `srcset`,
  `<object>`), flagging anything broken (internal = fatal, external = warning; external
  `403`/`429` are treated as bot-block/rate-limit and ignored, since datacenter IPs get
  throttled). It also
  flags `LEGACY_PROXY_HOST` leaking in **any response header** (`Location`, `Link`,
  `Content-Location`, `Set-Cookie` domain, ...), and probes the trailing-slash-stripped
  variant of every `/`-terminated URL to exercise the canonical-redirect Location rewrite
  site-wide. Crawl caps (pages/depth/concurrency) are script constants.

In CI both run post-apply in the `worker` job — on `stable/staging` always, and on
`stable/production` only after cut-over (`PRODUCTION_CUTOVER=true`), never against the
pre-cut-over legacy site. See `.github/workflows/deploy-to-cloudflare.yml`.

## Quality gate (`scripts/quality-gate.mjs`)

The YP-120 quality gate wraps the two suites into one artifact:

- **Smoke suite** — runs every `tests/*.test.mjs` via the built-in `node:test`
  `run()` API (`lib/smoke-runner.mjs`), collecting each top-level case as
  `{ name, status, detail }` (`pass` / `fail` / `skip` / `todo`). A file that
  throws on import (e.g. a missing required env var) surfaces as one failed case.
- **Crawler suite** — `runCrawl()` from `scripts/crawl.mjs` (the same crawl the
  `crawl` CLI runs), returning its finding arrays programmatically.

`lib/report.mjs` assembles the report and classifies status; `scripts/quality-gate.mjs`
writes it to `REPORT_OUT` and exits non-zero iff `overall !== "pass"`.

### Status policy

- A suite is `pass` iff its **fatal** categories are all empty; `overall` is
  `pass` iff every suite is `pass`.
- **Fatal:** broken **internal** links/assets, legacy-host leaks, **math render
  errors** (KaTeX `katex-error`), **redirect loops**, and any failed smoke case.
- **Warnings (never fail the gate):** broken **external** links, **orphan pages**,
  **slow pages**, and external `403`/`429` rate-limited hosts (the last are tracked
  by the crawler but not emitted — the schema has no field for them).

### Crawler checks & thresholds

Beyond the pre-existing broken-link / asset / legacy-leak / trailing-slash checks:

| Check           | Field           | Fatal? | Notes                                                        |
| --------------- | --------------- | ------ | ------------------------------------------------------------ |
| Math render     | `mathErrors`    | yes    | Scans page HTML for `class="katex-error"`; page URL + count + snippet. |
| Redirect loops  | `redirectLoops` | yes    | Follows internal 3xx chains; flags a cycle or `> 5` hops (`MAX_REDIRECT_HOPS`). |
| Orphan pages    | `orphanPages`   | no     | `/sitemap.xml` `<loc>`s not reached by any crawled link (path-keyed, host-agnostic). Skipped with a console note if there is no usable sitemap. |
| Slow pages      | `slowPages`     | no     | Internal `200`s slower than `3000ms` (`SLOW_PAGE_MS`).       |
| Broken images   | `brokenInternal` / `brokenExternal` | internal only | Covered by the existing asset check (`img`/`srcset`/…). |

### Artifact schema (`schemaVersion: 1`)

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

### CI upload

The staging (and post-deploy production) test job runs the gate for the deployed
`(services_sha, content_sha)` pair, then uploads the report to the env's
test-artifacts R2 bucket, keyed by the exact pair:

- `reports/{services_sha}__{content_sha}.json`
- `reports/latest.json` (a copy of the newest, for convenience)

Upload with `if: always()` so a failing gate still publishes its report — the
production-promotion PR gate later reads the pair key and passes only if it exists
and `overall == "pass"`. Retention: keep the newest 30 pair-reports per env (older
ones may be pruned by `generatedAt`; best-effort).
