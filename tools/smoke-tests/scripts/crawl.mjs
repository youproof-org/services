// Recursive full-site link crawler for the migration Worker.
//
// Starts at https://<WORKER_DOMAIN> and walks same-origin links breadth-first.
// It reports two classes of problem:
//   - broken links   — any response >= 400 (internal ones are fatal; external
//                       third-party links are reported as warnings only).
//   - legacy leaks    — any 3xx whose Location host is LEGACY_PROXY_HOST, i.e.
//                       the internal origin leaking to the browser.
//
// It also actively exercises the Part A canonical-redirect fix: for every
// discovered internal URL that ends in "/", it probes the trailing-slash-stripped
// variant, generating WordPress's canonical 301 and verifying its Location does
// NOT point at the legacy host.
//
// Exit code 1 on any internal broken link or leak. Run:
//   WORKER_DOMAIN=staging.youproof.hu LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
//   node scripts/crawl.mjs

import { baseUrl, config, request } from "../lib/config.mjs";

const MAX_PAGES = 500;
const MAX_DEPTH = 5;
const CONCURRENCY = 5;

const { workerDomain, legacyProxyHost } = config;

const HREF_RE = /<a\b[^>]*\shref\s*=\s*["']([^"']+)["']/gi;

const enqueued = new Set(); // internal pages queued for crawl (deduped)
const checked = new Set(); // every URL we've done a status/leak check on
const brokenInternal = [];
const brokenExternal = [];
const leaks = [];
let pageCount = 0;

const normalize = (url) => {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
};
const isInternal = (url) => url.hostname === workerDomain;

function extractLinks(html, base) {
  const links = [];
  let m;
  while ((m = HREF_RE.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith("#") || /^(mailto:|tel:|javascript:)/i.test(raw)) continue;
    try {
      const url = new URL(raw, base);
      url.hash = "";
      // Skip Cloudflare's injected internal endpoints (e.g. the email-protection
      // decoder at /cdn-cgi/l/email-protection), which 404 on a direct GET and are
      // not real site links.
      if (url.pathname.startsWith("/cdn-cgi/")) continue;
      if (url.protocol === "http:" || url.protocol === "https:") links.push(url);
    } catch {
      /* ignore unparseable href */
    }
  }
  return links;
}

// Status + legacy-leak check for a single URL. Does NOT crawl or read the body.
async function check(url, via) {
  const key = normalize(url);
  if (checked.has(key)) return null;
  checked.add(key);

  let res;
  try {
    // Fail fast on dead/hanging links (no retry) so the crawl stays bounded.
    res = await request(url.toString(), { retries: 0, timeoutMs: 10000 });
  } catch (err) {
    const reason = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
    (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: `ERR ${reason}`, via });
    return null;
  }

  if (res.status >= 400) {
    (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: res.status, via });
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    if (loc && legacyProxyHost) {
      try {
        if (new URL(loc, url).hostname === legacyProxyHost) leaks.push({ url: key, location: loc, via });
      } catch {
        /* ignore unparseable Location */
      }
    }
  }
  return res;
}

const queue = [{ url: new URL(baseUrl), depth: 0, via: "(root)" }];
enqueued.add(normalize(baseUrl));

async function crawlWorker() {
  while (queue.length > 0 && pageCount < MAX_PAGES) {
    const item = queue.shift();
    if (!item) break;
    pageCount++;

    const res = await check(item.url, item.via);

    // Canonical trailing-slash probe (Part A regression): force the WordPress
    // /path/ -> /path canonical redirect and confirm it doesn't leak legacy.*.
    const path = item.url.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      const stripped = new URL(item.url);
      stripped.pathname = path.replace(/\/+$/, "");
      await check(stripped, `${normalize(item.url)} (trailing-slash probe)`);
    }

    if (!res || res.status !== 200) continue;
    if (!/text\/html/i.test(res.headers.get("content-type") ?? "")) continue;
    if (item.depth >= MAX_DEPTH) continue;

    const html = await res.text();
    for (const link of extractLinks(html, item.url)) {
      if (isInternal(link)) {
        const key = normalize(link);
        if (!enqueued.has(key)) {
          enqueued.add(key);
          queue.push({ url: link, depth: item.depth + 1, via: normalize(item.url) });
        }
      } else {
        // External (incl. .org, legacy.*, third parties): status/leak check only.
        await check(link, normalize(item.url));
      }
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => crawlWorker()));

console.log(`\nCrawled ${pageCount} page(s); checked ${checked.size} URL(s) from ${baseUrl}`);
if (pageCount >= MAX_PAGES) console.log(`(stopped at MAX_PAGES=${MAX_PAGES} cap)`);

const report = (title, items) => {
  console.log(`\n${title}: ${items.length}`);
  for (const it of items) {
    console.log(`  - [${it.status ?? it.location}] ${it.url}  (via ${it.via})`);
  }
};

if (leaks.length) report("LEGACY-HOST LEAKS (fatal)", leaks);
if (brokenInternal.length) report("Broken internal links (fatal)", brokenInternal);
if (brokenExternal.length) report("Broken external links (warning)", brokenExternal);

if (!leaks.length && !brokenInternal.length && !brokenExternal.length) {
  console.log("\nNo broken links or legacy-host leaks found.");
}

if (leaks.length > 0 || brokenInternal.length > 0) process.exit(1);
