// Pure (network-free) helpers for the crawler: HTML reference extraction and
// response-header leak detection. Kept separate from crawl.mjs so they can be
// unit-tested offline.

// Navigational links (crawled if internal + HTML) vs assets (fetch-checked only).
const A_HREF_RE = /<a\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi;
const SRC_RE = /<(?:img|script|source|video|audio|iframe|embed|track)\b[^>]*?\ssrc\s*=\s*["']([^"']+)["']/gi;
const OBJECT_DATA_RE = /<object\b[^>]*?\sdata\s*=\s*["']([^"']+)["']/gi;
const SRCSET_RE = /<(?:img|source)\b[^>]*?\ssrcset\s*=\s*["']([^"']+)["']/gi;
const LINK_TAG_RE = /<link\b[^>]*>/gi;
const ATTR = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i");
const REL_RE = ATTR("rel");
const HREF_RE = ATTR("href");

// <link rel> values that are connection/loading HINTS, not fetchable assets — the
// href is a bare origin or a preconnect target, so a direct GET is meaningless
// (e.g. <link rel="dns-prefetch" href="//fonts.googleapis.com">).
const HINT_RELS = new Set(["dns-prefetch", "preconnect", "prefetch", "preload", "prerender", "modulepreload"]);

/** Parse a raw attribute value into an absolute, crawlable http(s) URL, or null. */
export function toUrl(raw, base) {
  const s = (raw ?? "").trim();
  if (!s || s.startsWith("#") || /^(mailto:|tel:|javascript:|data:)/i.test(s)) return null;
  let url;
  try {
    url = new URL(s, base);
  } catch {
    return null;
  }
  url.hash = "";
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Cloudflare's injected internal endpoints (e.g. /cdn-cgi/l/email-protection)
  // 404 on a direct GET and are not real site URLs.
  if (url.pathname.startsWith("/cdn-cgi/")) return null;
  // WordPress advertises xmlrpc.php via <link rel="pingback"/"EditURI">, but the
  // Worker intentionally blocks it (404) — not a real broken asset.
  if (url.pathname === "/xmlrpc.php") return null;
  return url;
}

function matchAll(re, html) {
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

// <link> hrefs, skipping resource-hint rels (dns-prefetch/preconnect/...).
function extractLinkAssets(html, base) {
  const out = [];
  let m;
  while ((m = LINK_TAG_RE.exec(html)) !== null) {
    const tag = m[0];
    const rel = (tag.match(REL_RE)?.[1] ?? "").toLowerCase().trim();
    if (rel.split(/\s+/).some((r) => HINT_RELS.has(r))) continue;
    const u = toUrl(tag.match(HREF_RE)?.[1], base);
    if (u) out.push(u);
  }
  return out;
}

/** Extract { links: a[href], assets: img/script/link/source/... URLs } from HTML. */
export function extractRefs(html, base) {
  const links = [];
  const assets = [];

  for (const raw of matchAll(A_HREF_RE, html)) {
    const u = toUrl(raw, base);
    if (u) links.push(u);
  }
  for (const re of [SRC_RE, OBJECT_DATA_RE]) {
    for (const raw of matchAll(re, html)) {
      const u = toUrl(raw, base);
      if (u) assets.push(u);
    }
  }
  assets.push(...extractLinkAssets(html, base));
  // srcset: "url 480w, url 2x, ..." — take the URL from each candidate.
  for (const raw of matchAll(SRCSET_RE, html)) {
    for (const candidate of raw.split(",")) {
      const u = toUrl(candidate.trim().split(/\s+/)[0], base);
      if (u) assets.push(u);
    }
  }
  return { links, assets };
}

/**
 * Detect the internal legacy host leaking in response headers. Scans every
 * header value for the host substring (Link, Content-Location, Set-Cookie
 * domain, ...) and additionally resolves a `Location` header (so relative
 * values that resolve to the legacy host are caught too). Returns an array of
 * human-readable detail strings (empty if none).
 *
 * @param headers  a Headers instance (or any [name, value] iterable with .get)
 * @param legacyHost  LEGACY_PROXY_HOST; falsy => nothing to detect
 * @param requestUrl  the URL the response came from (for relative Location)
 */
export function findHeaderLeaks(headers, legacyHost, requestUrl) {
  if (!legacyHost) return [];
  const details = [];
  const needle = legacyHost.toLowerCase();

  for (const [name, value] of headers) {
    if (name === "location") continue; // resolved below
    if (value.toLowerCase().includes(needle)) details.push(`header ${name}: ${value}`);
  }

  const loc = headers.get("location");
  if (loc) {
    try {
      if (new URL(loc, requestUrl).hostname.toLowerCase() === needle) details.push(`Location: ${loc}`);
    } catch {
      /* ignore unparseable Location */
    }
  }
  return details;
}
