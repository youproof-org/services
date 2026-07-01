import { isBlockedAdminPath } from "./admin-guard";
import { lookup } from "./manifest";
import { normalizePath } from "./path";
import { proxyToLegacy } from "./proxy";
import { redirectToOrg } from "./redirect";
import type { Env } from "./types";

/**
 * youproof.hu -> youproof.org migration Worker.
 *
 * A single codebase deployed twice (production & staging) with different
 * environment bindings (see types.ts / Terraform). For each request on the
 * legacy `.hu` domain it:
 *
 *   1. Blocks admin/login paths (404, never proxied).
 *   2. 301-redirects migrated paths to the environment's `.org` host.
 *   3. Transparently proxies everything else to the environment's legacy origin.
 *
 * See `infra/cloudflare/README.md` for the full architecture and the manual
 * verification checklist.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const normalizedPath = normalizePath(url.pathname);

    // 1. Admin/login endpoints: behave as if they don't exist on the public
    //    domain. Never proxy, even with the guard header.
    if (isBlockedAdminPath(normalizedPath)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // 2. Migrated path: permanent redirect to the new .org URL, preserving the
    //    query string.
    const newPath = lookup(normalizedPath);
    if (newPath !== null) {
      return redirectToOrg(newPath, url.search, env);
    }

    // 3. Unmigrated, non-admin: transparent reverse proxy to the legacy origin.
    return proxyToLegacy(request, env);
  },
} satisfies ExportedHandler<Env>;
