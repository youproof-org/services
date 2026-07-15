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
 *  - Location rewriting only: legacy WordPress keeps WP_HOME/WP_SITEURL on the
 *    public `.hu` domain, but WordPress still emits *same-host* canonical 301s
 *    built from the request host (e.g. the trailing-slash normalization
 *    /path -> /path/). Behind the proxy that request host is the internal
 *    `legacy.*` origin, so those redirects would leak the internal hostname to
 *    the browser. We therefore rewrite redirect `Location` headers pointing at
 *    the legacy host back to the public host (see `rewriteLegacyLocation`). No
 *    other response header — and no body — is rewritten.
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
    const response = await fetch(proxiedRequest);
    const located = rewriteLegacyLocation(response, legacyUrl, new URL(request.url), env.LEGACY_PROXY_HOST);
    return applyNoindex(located, env);
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

/**
 * Add `X-Robots-Tag: noindex, nofollow` to a proxied legacy response so the
 * unmigrated legacy content (incl. non-HTML assets, which a <meta> tag can't
 * cover) stays out of search indexes on this environment.
 *
 * Environment-gated via the SEO_NOINDEX binding: noindex UNLESS the value is
 * exactly "false". Default = noindex, so a missing/misconfigured value can never
 * accidentally index staging/legacy. Production sets SEO_NOINDEX="false" because
 * we deliberately keep indexing the still-unmigrated legacy content it proxies.
 */
function applyNoindex(response: Response, env: Env): Response {
  if (env.SEO_NOINDEX === "false") return response;
  // fetch()/copied responses have immutable headers — copy to get a mutable set.
  const r = new Response(response.body, response);
  r.headers.set("X-Robots-Tag", "noindex, nofollow");
  return r;
}

/**
 * Rewrite a redirect `Location` that points at the internal legacy host back to
 * the public host the visitor used. WordPress emits same-host canonical 301s
 * (most visibly the trailing-slash normalization /path -> /path/); behind the
 * proxy that host is the internal legacy origin, which must never leak to the
 * browser.
 *
 * The raw Location is resolved against the outbound (legacy) URL, so a relative
 * value ("/path/") resolves to the legacy host and is rewritten to the same
 * absolute public URL a browser would have computed anyway — equivalent and
 * safe. Only redirects whose resolved host is the legacy host are touched; any
 * other host (a rare genuine external redirect) is passed through untouched.
 */
function rewriteLegacyLocation(
  response: Response,
  legacyUrl: URL,
  publicUrl: URL,
  legacyHost: string,
): Response {
  if (response.status < 300 || response.status >= 400) return response;

  const raw = response.headers.get("Location");
  if (!raw) return response;

  let target: URL;
  try {
    target = new URL(raw, legacyUrl);
  } catch {
    return response; // malformed Location — leave as-is
  }
  if (target.hostname !== legacyHost) return response;

  target.protocol = "https:";
  target.hostname = publicUrl.hostname;
  target.port = "";

  // A Response from fetch() has immutable headers; copy it to get a mutable set.
  const rewritten = new Response(response.body, response);
  rewritten.headers.set("Location", target.toString());
  return rewritten;
}
