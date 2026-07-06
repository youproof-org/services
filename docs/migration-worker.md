# Migration worker (`youproof.hu`)

A Terraform-managed Cloudflare Worker on the legacy `youproof.hu` zone that
intercepts all traffic and either **redirects** migrated paths to `youproof.org`,
**reverse-proxies** unmigrated content from the legacy WordPress origin, or
**blocks** admin/login endpoints. One codebase (`infra/cloudflare/worker/`,
`@youproof.org/migration-worker`) is deployed twice — production + staging — with
different environment bindings; nothing about the domains is hardcoded in source.

## Request handling

For every request on the `.hu` domain, the Worker (`worker/src/index.ts`):

1. **Normalizes** the path (decode once, strip trailing slash except root,
   single leading slash; matching is case-sensitive).
2. **Blocks admin/login paths** → `404`, never proxied (see below).
3. **Looks up** the path in the bundled migration manifest. If migrated → `301`
   redirect to `https://<REDIRECT_TARGET_HOST><new-path>` (query string
   preserved).
4. Otherwise **reverse-proxies** to the environment's legacy origin
   (`LEGACY_PROXY_HOST`), injecting the `X-Legacy-Guard` access-token header.
   The browser keeps showing the `.hu` domain — a proxy, not a redirect. If no
   legacy origin is configured, returns `410 Gone` (see
   [410 mode](#post-migration-410-gone-mode)).

## The migration manifest (generated from content)

The manifest (`worker/src/manifest.json`) is a static JSON file **bundled
directly into the Worker** (no KV), mapping legacy `.hu` paths to new `.org`
paths:

```json
{
  "version": 1,
  "updatedAt": "2026-07-01",
  "entries": {
    "/old-slug-one": "/books/algebra/chapters/vectors",
    "/some/nested/old-path": "/books/geometry/chapters/triangles"
  }
}
```

**The manifest is now generated at deploy time from the content model — it is no
longer hand-edited.** (The earlier "edit `manifest.json` and redeploy on every
content move" workflow is obsolete.) The generator
`infra/cloudflare/worker/scripts/gen-manifest.mjs`:

- Reads `CONTENT_DIR` (the same env var the website build uses; it points at the
  content repo's `content/` subdir containing `books/`), walks every book →
  part → chapter, and emits one entry per chapter that is **both**
  `published: true` **and** has a `legacy-path`.
- **Key** = the chapter's `legacy-path` (its old `.hu` path). **Value** = the
  chapter's canonical `.org` path, `/books/{book}/chapters/{chapter}`, where
  `{book}`/`{chapter}` are the respective `name` fields (folder/file basename
  with the leading `NN-` numeric prefix stripped). This is the same
  [canonical URL rule](content-site-and-static-generation.md#canonical-url-rule)
  the static export uses, so redirect targets always resolve to a real page.
- **Un-published or missing-`legacy-path` chapters produce no entry.** An entry
  therefore disappears when a chapter is un-published — the `.hu` Worker then
  proxies/410s that path per its normal logic; it does **not** 301 to a stub.
- **Duplicate `legacy-path` across chapters is a hard error** (fails the build).
  A `legacy-path` that resolves to no current chapter can't happen by
  construction (entries are derived *from* chapters); a stale one simply doesn't
  appear. The generator logs a summary entry count.

### Deploy ordering

Generation is **not** part of `prebuild`: the committed `manifest.json` (empty
entries) must stay buildable/typecheckable without a content checkout, so
`prebuild` only runs `validate-manifest`. A real deploy (with `CONTENT_DIR`
available) runs generation explicitly **before** the build:

```bash
pnpm --filter @youproof.org/migration-worker run generate-manifest
pnpm --filter @youproof.org/migration-worker run build   # prebuild validates, esbuild inlines
```

The deploy pipeline runs these steps automatically — the Worker is redeployed on
**every content change**, not only on services changes, because a content merge
can change the manifest. See the [deploy pipeline](deploy-pipeline.md).

> **One generator, per-env content ref:** both environments use the same
> manifest generator; their manifests differ **only** because each builds
> against its own content ref (staging → `draft`, production → `stable/released`).
> There is no environment-specific mapping logic. Introduce per-env manifests
> (`manifest.production.json` / `manifest.staging.json`, selected at build time)
> only if staging ever needs a mapping that isn't derivable from its content —
> e.g. staging-only test redirects. Not wired up today; revisit if it comes up.

## Admin/login blocking

The legacy WordPress admin/auth surface must **never** be reachable through the
public `.hu` Worker domain — only directly against the legacy origin, where the
legacy host enforces the guard header. Blocked requests return `404` (matching
the legacy host's own treatment of unguarded direct access) and are **never**
proxied.

The blocked set is an explicit, conservative list in `worker/src/admin-guard.ts`:
`/wp-admin` (and everything under it), `/wp-login.php`, `/wp-signup.php`,
`/wp-activate.php`, `/wp-cron.php`, `/wp-trackback.php`, `/xmlrpc.php`.

> This is the standard WordPress core surface. Plugins can expose additional
> admin-adjacent endpoints; confirm the live legacy install's exposed routes and
> add any extras to `admin-guard.ts`.

## Build & local checks

The Worker is a pnpm workspace member (`@youproof.org/migration-worker`). From
the repo root:

```bash
pnpm install
pnpm --filter @youproof.org/migration-worker run generate-manifest  # if CONTENT_DIR is set
pnpm --filter @youproof.org/migration-worker run validate-manifest  # JSON Schema check
pnpm --filter @youproof.org/migration-worker run typecheck          # tsc --noEmit
pnpm --filter @youproof.org/migration-worker run build              # -> worker/dist/worker.js
```

`build` runs `validate-manifest` first (via `prebuild`), so a malformed manifest
fails the build.

## The `X-Legacy-Guard` value

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

## Post-migration `410 Gone` mode

While `LEGACY_PROXY_HOST` is set, unmigrated (non-admin, non-migrated) paths are
reverse-proxied to legacy WordPress. Once the legacy site is **decommissioned**,
clear the environment's `LEGACY_PROXY_HOST` variable and redeploy: the absence
of a legacy host is the post-migration signal, so the Worker returns **`410
Gone`** for those paths and Terraform drops the now-pointless `legacy.*` A record
(its `count` is gated on the var). Migrated paths keep 301-ing from the manifest.
This is per-environment, so staging can be switched to 410 for verification
independently of production. No zone ruleset is used for canonical redirects —
pre-410 they are handled by the proxy `Location` rewrite, and post-410 there is
no origin left to redirect.

## Post-deploy verification checklist

Automated coverage of the redirect-facing checks lives in
[`@youproof.org/smoke-tests`](quality-gates-and-artifacts.md) (run post-deploy in
CI). This checklist is the authoritative superset for manual verification; run it
against **both** environments after a deploy.

**DNS & TLS baseline:**

1. **NS delegation** — `dig NS youproof.hu` lists Cloudflare's assigned
   nameservers.
2. **DNS records resolve** — `dig A legacy.youproof.hu` returns the Rackhost IP
   directly (gray-cloud); the worker hosts resolve through Cloudflare. Same for
   the `staging.*` equivalents.
3. **Legacy host TLS** — hit `https://legacy.youproof.hu` and
   `https://legacy.staging.youproof.hu` directly (with the `X-Legacy-Guard`
   header) → valid TLS cert + a WordPress response. This is exactly the path the
   Worker's outbound fetch uses.

**Worker behaviour:**

4. **Migrated redirect** — request a known migrated slug on the `.hu` domain →
   `301` to the correct `.org` URL, query string preserved.
5. **Unmigrated proxy** — request a known unmigrated, non-admin slug → legacy
   WordPress content renders and the address bar still shows `.hu`. (Once
   `LEGACY_PROXY_HOST` is cleared, the same request returns `410 Gone`.)
6. **Canonical redirect host** — request an unmigrated page **without** its
   trailing slash → the `301` `Location` points at the public `.hu` host, never
   the internal `legacy.*` host.
7. **Admin blocking** — request `/wp-admin` and `/wp-login.php` on the `.hu`
   domain → `404`, never proxied. Confirm they *do* work directly against
   `legacy.*` with the correct `X-Legacy-Guard` header.
8. **Guard enforcement** — request the legacy origin directly without the header
   → `404`.
9. **Non-GET** — a `POST` on a non-blocked path passes through to the legacy
   host.
10. **Trailing slash / case** — confirm normalization (trailing slash stripped,
    case-sensitive matching).
11. **www redirect** — request `https://www.<domain>/<path>?x=1` → `301` to
    `https://<domain>/<path>?x=1`, then handled by the Worker.
12. **HTTP → HTTPS** — request `http://youproof.hu/<path>` and
    `http://www.youproof.hu/<path>` → `301` to the `https://` equivalent.
13. **Failure mode** — make the legacy host unreachable → the Worker returns a
    safe `502`, not an unhandled exception / Cloudflare error page.
14. **Environment isolation** — confirm a staging deploy never touches
    production state or resources (check the plan's names/IDs and the
    `environment` output before any apply), and vice versa.
