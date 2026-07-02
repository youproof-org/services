# @youproof.org/smoke-tests

Post-deploy smoke tests and a recursive link crawler for the `youproof.hu → .org`
migration Worker. Dependency-free — Node built-ins only (`node:test`, `node:assert`,
global `fetch`). Runs against a live, already-deployed environment.

## Environment variables

Reuses the **existing** deploy vars — no new variables are introduced. Everything else
(base URL, www host, pre/post-migration mode) is derived.

| Var                    | Used for                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `WORKER_DOMAIN`        | Public host under test, e.g. `staging.youproof.hu` (⇒ base URL) |
| `REDIRECT_TARGET_HOST` | Migrated-path 301 target, e.g. `youproof.org`                  |
| `LEGACY_PROXY_HOST`    | Legacy origin; **empty ⇒ post-migration (410) mode**          |
| `ENVIRONMENT`          | `production` / `staging` (gates the www→apex case)            |

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
```

## What runs where

- **`tests/redirects.test.mjs`** (blocking in CI) — admin-block 404s, unmigrated
  proxy/410, HTTP→HTTPS, www→apex (production only, due to the `www.staging` Universal-SSL
  cert gap), guard-header enforcement, and migrated-path 301s from the Worker manifest.
  Cases self-skip when not applicable.
- **`scripts/crawl.mjs`** (non-blocking in CI) — recursively walks same-origin links
  **and checks each page's assets** (images, stylesheets, scripts, media, `srcset`,
  `<object>`), flagging anything broken (internal = fatal, external = warning). It also
  flags `LEGACY_PROXY_HOST` leaking in **any response header** (`Location`, `Link`,
  `Content-Location`, `Set-Cookie` domain, ...), and probes the trailing-slash-stripped
  variant of every `/`-terminated URL to exercise the canonical-redirect Location rewrite
  site-wide. Crawl caps (pages/depth/concurrency) are script constants.

In CI both run post-apply in the `worker` job — on `stable/staging` always, and on
`stable/production` only after cut-over (`PRODUCTION_CUTOVER=true`), never against the
pre-cut-over legacy site. See `.github/workflows/deploy-to-cloudflare.yml`.
