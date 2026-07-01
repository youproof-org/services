import type { Env } from "./types";

/**
 * Build a 301 redirect from a migrated legacy path to its new `.org` URL on the
 * environment's redirect target host.
 *
 * The query string is preserved (`search` includes the leading "?" or is empty).
 * The target host is environment-specific (`env.REDIRECT_TARGET_HOST`), never
 * hardcoded.
 */
export function redirectToOrg(newPath: string, search: string, env: Env): Response {
  const location = `https://${env.REDIRECT_TARGET_HOST}${newPath}${search}`;
  // 301 (permanent) — migrated content has moved for good. Use Response with an
  // explicit status rather than Response.redirect() so the status code is
  // unambiguous and not subject to the 302 default in some runtimes.
  return new Response(null, {
    status: 301,
    headers: { Location: location },
  });
}
