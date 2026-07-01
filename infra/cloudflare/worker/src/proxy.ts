import type { Env } from "./types";

/**
 * Transparently reverse-proxy an unmigrated, non-admin request to the
 * environment's legacy origin host.
 *
 * The visitor's browser must keep showing the `.hu` Worker domain — this is a
 * proxy, NOT a redirect. We only swap the hostname of the outgoing fetch.
 *
 * Behavior notes (intentional):
 *  - Method & body passthrough: `new Request(url, request)` preserves the
 *    method, headers, and body, so POST/PUT/etc. and their bodies are proxied,
 *    not just GET.
 *  - Query string: preserved (we keep the full URL, only changing hostname).
 *  - Host header: a `Request` constructed from a URL sends `Host` matching that
 *    URL's host, so the outgoing `Host` becomes `env.LEGACY_PROXY_HOST`. This is
 *    required for the shared-host vhost to route correctly. (We also set it
 *    explicitly below to be unambiguous across runtime versions.)
 *  - Guard header: `X-Legacy-Guard` is injected so the legacy host accepts the
 *    proxied request. Direct (non-Worker) access without this header is 404'd by
 *    the legacy host itself. The value is a long-lived access token, not a true
 *    secret (see types.ts / README), but must still never be logged.
 *  - No response rewriting: per confirmed assumption, legacy WordPress has
 *    WP_HOME/WP_SITEURL set to the public `.hu` domain, so it does not emit
 *    Location headers pointing at the internal `legacy.*` host. We therefore do
 *    NOT rewrite response headers. Revisit this assumption if redirects ever
 *    leak the internal hostname.
 *  - No Worker-layer caching: caching is handled by Cloudflare's CDN config per
 *    the architecture doc, not here.
 */
export async function proxyToLegacy(request: Request, env: Env): Promise<Response> {
  const legacyUrl = new URL(request.url);
  legacyUrl.hostname = env.LEGACY_PROXY_HOST;
  // Force default port; the public request may carry no port and the origin is
  // reached over standard HTTPS regardless.
  legacyUrl.port = "";

  const proxiedRequest = new Request(legacyUrl, request);
  proxiedRequest.headers.set("X-Legacy-Guard", env.LEGACY_GUARD_VALUE);
  proxiedRequest.headers.set("Host", env.LEGACY_PROXY_HOST);

  try {
    return await fetch(proxiedRequest);
  } catch (err) {
    // DNS failure, timeout, connection refused, etc. Return a safe, generic
    // 502 rather than letting the exception surface a Cloudflare error page
    // that could leak internal details (the legacy hostname, stack traces).
    console.error("Legacy proxy fetch failed:", err);
    return new Response("Bad Gateway", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
