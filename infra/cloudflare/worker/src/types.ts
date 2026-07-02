/**
 * Environment bindings supplied per-deployment by Terraform (see
 * `infra/cloudflare/terraform/worker.tf`). These are intentionally NOT
 * hardcoded in source: production and staging are two separate deployments of
 * this same codebase with different values (see README, Section "Environments").
 */
export interface Env {
  /** Host to 301-redirect migrated paths to, e.g. "youproof.org". */
  REDIRECT_TARGET_HOST: string;
  /**
   * Legacy origin host to transparently proxy unmigrated paths to, e.g.
   * "legacy.youproof.hu". An EMPTY value is the post-migration signal: once the
   * legacy site is decommissioned there is nothing to proxy to, so unmigrated
   * (non-admin, non-migrated) paths return 410 Gone instead of proxying.
   */
  LEGACY_PROXY_HOST: string;
  /**
   * Long-lived access token injected as the `X-Legacy-Guard` header on proxied
   * requests. NOT a true secret — it gates direct access to the legacy host (and
   * keeps `legacy.*` out of search indexes), but is a stable, readable value
   * (a plain Worker binding, not a Workers secret). See README "Admin/login
   * blocking" and the plan's Section 7.
   */
  LEGACY_GUARD_VALUE: string;
}

/**
 * Shape of `manifest.json`. Validated at build/import time by `manifest.ts`
 * (and by `pnpm run validate-manifest` against `manifest.schema.json`) so a
 * malformed edit fails the build rather than the live Worker.
 */
export interface Manifest {
  version: number;
  /** ISO date (YYYY-MM-DD) the manifest was last updated. */
  updatedAt: string;
  /**
   * Map of old legacy path -> new `.org` path. Both are paths only (leading
   * slash, no domain, no trailing slash except the root "/").
   */
  entries: Record<string, string>;
}
