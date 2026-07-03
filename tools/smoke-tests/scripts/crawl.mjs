// Recursive full-site link + asset crawler for the migration Worker.
//
// Starts at https://<WORKER_DOMAIN> and walks same-origin links breadth-first.
// For every page it also checks the page's own assets (images, stylesheets,
// scripts, media, ...). It reports two classes of problem:
//   - broken links/assets — any response >= 400 (internal ones are fatal;
//                       external third-party URLs are reported as warnings only;
//                       external 403/429 are treated as bot-block/rate-limit and
//                       ignored, since datacenter IPs get throttled).
//   - legacy leaks    — the internal LEGACY_PROXY_HOST leaking to the browser in
//                       ANY response header (Location, Link, Content-Location,
//                       Set-Cookie domain, ...).
//
// It also actively exercises the Part A canonical-redirect fix: for every
// discovered internal URL that ends in "/", it probes the trailing-slash-stripped
// variant, generating WordPress's canonical 301 and verifying its Location does
// NOT point at the legacy host.
//
// Exit code 1 on any internal broken URL or leak. Run:
//   WORKER_DOMAIN=staging.youproof.hu LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
//   node scripts/crawl.mjs

import { baseUrl, config, request } from "../lib/config.mjs";
import { extractRefs, findHeaderLeaks } from "../lib/extract.mjs";

const MAX_PAGES = 500;
const MAX_DEPTH = 5;
const CONCURRENCY = 5;

const { workerDomain, legacyProxyHost } = config;

const enqueued = new Set(); // internal pages queued for crawl (deduped)
const checked = new Set(); // every URL we've done a status/leak check on
const brokenInternal = [];
const brokenExternal = [];
const blockedExternal = []; // external 403/429 — datacenter bot-block / rate-limit, not dead
const leaks = [];
let pageCount = 0;

// External hosts commonly return these to datacenter IPs (e.g. Wikipedia 429s the
// CI runner) — a block/throttle, not a broken link. Ignored for external URLs
// only; our own host returning them would still be flagged.
const BLOCKED_STATUSES = new Set([403, 429]);

const normalize = (url) => {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
};
const isInternal = (url) => url.hostname === workerDomain;

// Status + legacy-leak check for a single URL. Does NOT crawl or read the body.
async function check(url, via) {
  const key = normalize(url);
  if (checked.has(key)) return null;
  checked.add(key);

  let res;
  try {
    // A couple of retries to ride out transient blips / cold-cache slowness, with
    // a hard per-attempt timeout so a dead/hanging URL still can't stall the crawl.
    res = await request(url.toString(), { retries: 2, timeoutMs: 20000 });
  } catch (err) {
    const reason = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
    (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: `ERR ${reason}`, via });
    return null;
  }

  if (res.status >= 400) {
    if (!isInternal(url) && BLOCKED_STATUSES.has(res.status)) {
      blockedExternal.push({ url: key, status: res.status, via });
    } else {
      (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: res.status, via });
    }
  }
  for (const detail of findHeaderLeaks(res.headers, legacyProxyHost, url)) {
    leaks.push({ url: key, detail, via });
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
    const via = normalize(item.url);
    const { links, assets } = extractRefs(html, item.url);

    for (const link of links) {
      if (isInternal(link)) {
        const key = normalize(link);
        if (!enqueued.has(key)) {
          enqueued.add(key);
          queue.push({ url: link, depth: item.depth + 1, via });
        }
      } else {
        // External (incl. .org, legacy.*, third parties): status/leak check only.
        await check(link, via);
      }
    }
    // Assets are fetch-checked (own site's images/CSS/JS must download) but never
    // crawled for further links.
    for (const asset of assets) {
      await check(asset, `${via} (asset)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => crawlWorker()));

console.log(`\nCrawled ${pageCount} page(s); checked ${checked.size} URL(s) from ${baseUrl}`);
if (pageCount >= MAX_PAGES) console.log(`(stopped at MAX_PAGES=${MAX_PAGES} cap)`);

const report = (title, items) => {
  console.log(`\n${title}: ${items.length}`);
  for (const it of items) {
    console.log(`  - [${it.status ?? it.detail}] ${it.url}  (via ${it.via})`);
  }
};

if (leaks.length) report("LEGACY-HOST LEAKS (fatal)", leaks);
if (brokenInternal.length) report("Broken internal links/assets (fatal)", brokenInternal);
if (brokenExternal.length) report("Broken external links/assets (warning)", brokenExternal);
if (blockedExternal.length) report("External rate-limited/blocked — ignored (403/429)", blockedExternal);

if (!leaks.length && !brokenInternal.length && !brokenExternal.length && !blockedExternal.length) {
  console.log("\nNo broken links/assets or legacy-host leaks found.");
}

if (leaks.length > 0 || brokenInternal.length > 0) process.exit(1);
