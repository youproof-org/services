/**
 * Admin/login endpoint blocking.
 *
 * The legacy WordPress admin and auth flows must NEVER be reachable through the
 * public `.hu` Worker domain. They are only accessed directly against the legacy
 * host's own domain (`legacy.youproof.hu` / `legacy.staging.youproof.hu`), where
 * the legacy host enforces the `X-Legacy-Guard` header for direct access.
 *
 * When a request matches a blocked pattern the Worker returns 404 (mirroring the
 * legacy host's own "not found" treatment of unguarded direct access) and does
 * NOT proxy — the public domain behaves as if these paths don't exist.
 *
 * Matching is deliberately an explicit, conservative list rather than a broad
 * regex, to avoid accidentally blocking legitimate content paths or leaving a
 * gap. Keep this list in sync with the live install.
 *
 * IMPORTANT (verify before production apply): this is the standard WordPress
 * core admin/auth surface. Plugins can add additional admin-adjacent endpoints.
 * The live legacy install's actual exposed routes should be confirmed and any
 * extras added here. See README "Admin/login blocking".
 */

/** Exact-match blocked paths (already normalized: no trailing slash). */
const BLOCKED_EXACT: ReadonlySet<string> = new Set([
  "/wp-login.php",
  "/wp-admin", // bare /wp-admin (WordPress normally redirects this to /wp-admin/)
  "/wp-signup.php",
  "/wp-activate.php",
  "/wp-cron.php",
  "/wp-trackback.php",
  "/xmlrpc.php", // XML-RPC: auth/remote-management surface, brute-force vector
]);

/**
 * Path prefixes under which everything is blocked. Each prefix is matched as a
 * true path segment boundary, so "/wp-admin" blocks "/wp-admin/options.php" but
 * NOT a hypothetical content path like "/wp-administration-guide".
 */
const BLOCKED_PREFIXES: readonly string[] = ["/wp-admin"];

/**
 * @param path A path already normalized by `normalizePath`.
 * @returns true if the request must be blocked (404) and never proxied.
 */
export function isBlockedAdminPath(path: string): boolean {
  if (BLOCKED_EXACT.has(path)) {
    return true;
  }
  for (const prefix of BLOCKED_PREFIXES) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      return true;
    }
  }
  return false;
}
