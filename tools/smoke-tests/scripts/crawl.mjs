// Recursive full-site link + asset crawler for the migration Worker.
//
// Starts at https://<WORKER_DOMAIN> and walks same-origin links breadth-first.
// For every page it also checks the page's own assets (images, stylesheets,
// scripts, media, ...). It reports these classes of problem:
//   - broken links/assets — any response >= 400 (internal ones are fatal;
//                       external third-party URLs are reported as warnings only;
//                       external 403/429 are treated as bot-block/rate-limit and
//                       ignored, since datacenter IPs get throttled).
//   - legacy leaks    — the internal LEGACY_PROXY_HOST leaking to the browser in
//                       ANY response header (Location, Link, Content-Location,
//                       Set-Cookie domain, ...).
//   - math errors     — KaTeX render failures (class="katex-error") in page HTML
//                       (fatal — a math content site must render its math).
//   - redirect loops  — cyclic or excessively long (> MAX_REDIRECT_HOPS) redirect
//                       chains, e.g. between the .hu worker and youproof.org (fatal).
//   - orphan pages    — URLs present in /sitemap.xml but linked from nowhere in the
//                       crawl (warning; best-effort, skipped when no sitemap).
//   - slow pages      — internal 200s slower than SLOW_PAGE_MS (warning).
//
// It also actively exercises the Part A canonical-redirect fix: for every
// discovered internal URL that ends in "/", it probes the trailing-slash-stripped
// variant, generating WordPress's canonical 301 and verifying its Location does
// NOT point at the legacy host.
//
// This module exports runCrawl() so the quality-gate entrypoint can consume the
// findings programmatically. Run directly as a CLI (prints a report, exits 1 on
// any fatal finding):
//   WORKER_DOMAIN=staging.youproof.hu LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
//   node scripts/crawl.mjs

import { pathToFileURL } from "node:url";

import { baseUrl, config, request } from "../lib/config.mjs";
import { extractRefs, findHeaderLeaks, extractMathErrors, parseSitemapLocs } from "../lib/extract.mjs";

const MAX_PAGES = 500;
const MAX_DEPTH = 5;
const CONCURRENCY = 5;
// A same-origin 200 slower than this is flagged (warning). CI runners + a
// cold CDN edge make sub-second thresholds flaky; 3s is a generous "something
// is wrong" bar for a static site.
const SLOW_PAGE_MS = 3000;
// A redirect chain longer than this many hops is treated as broken (fatal),
// alongside any detected cycle. The worker never needs more than 1-2 hops.
const MAX_REDIRECT_HOPS = 5;

// External hosts commonly return these to datacenter IPs (e.g. Wikipedia 429s the
// CI runner) — a block/throttle, not a broken link. Ignored for external URLs
// only; our own host returning them would still be flagged.
const BLOCKED_STATUSES = new Set([403, 429]);

const normalize = (url) => {
  const u = new URL(url);
  u.hash = "";
  return u.toString();
};
// Path-only key used to cross-reference sitemap entries against discovered URLs
// (host-agnostic: the sitemap may advertise the canonical host while we crawl a
// per-env hostname). Trailing slash normalized so "/x" and "/x/" match.
const pathKey = (url) => {
  const u = new URL(url);
  const p = u.pathname.replace(/\/+$/, "") || "/";
  return p + u.search;
};

/**
 * Crawl the site under test and collect all findings. Pure of console output and
 * process control so it can be driven by the quality gate. Returns the raw
 * finding arrays + counters; status classification lives in lib/report.mjs.
 */
export async function runCrawl({
  domain = config.workerDomain,
  legacyHost = config.legacyProxyHost,
  start = baseUrl,
  maxPages = MAX_PAGES,
  maxDepth = MAX_DEPTH,
  concurrency = CONCURRENCY,
  slowPageMs = SLOW_PAGE_MS,
  maxRedirectHops = MAX_REDIRECT_HOPS,
} = {}) {
  const enqueued = new Set(); // internal pages queued for crawl (deduped)
  const checked = new Set(); // every URL we've done a status/leak check on
  const discoveredPaths = new Set(); // path-keys of every internal URL we saw
  const redirectChecked = new Set(); // internal redirecting URLs already loop-checked
  const brokenInternal = [];
  const brokenExternal = [];
  const blockedExternal = []; // external 403/429 — datacenter bot-block / rate-limit, not dead
  const leaks = [];
  const mathErrors = [];
  const redirectLoops = [];
  const slowPages = [];
  let orphanPages = [];
  let sitemapNote = "";
  let pageCount = 0;

  const isInternal = (url) => url.hostname === domain;

  // Follow a redirect chain from a URL that already returned a 3xx, detecting
  // cycles (A->B->A) and excessively long chains (> maxRedirectHops).
  async function detectRedirectLoop(startUrl, via) {
    const key = normalize(startUrl);
    if (redirectChecked.has(key)) return;
    redirectChecked.add(key);

    const chain = [];
    const seen = new Set();
    let current = startUrl.toString();
    for (let hop = 0; hop <= maxRedirectHops + 1; hop++) {
      let res;
      try {
        res = await request(current, { retries: 0, timeoutMs: 15000 });
      } catch {
        return; // network error terminates the chain — not a loop
      }
      chain.push({ url: current, status: res.status });
      if (res.status < 300 || res.status >= 400) return; // reached a terminal response
      const loc = res.headers.get("location");
      if (!loc) return;
      let next;
      try {
        next = new URL(loc, current).toString();
      } catch {
        return;
      }
      if (seen.has(next)) {
        redirectLoops.push({ url: key, detail: `cycle back to ${next}`, chain, via });
        return;
      }
      seen.add(current);
      current = next;
      if (hop >= maxRedirectHops) {
        redirectLoops.push({ url: key, detail: `exceeded ${maxRedirectHops} hops`, chain, via });
        return;
      }
    }
  }

  // Status + legacy-leak + timing check for a single URL. Does NOT crawl or read
  // the body. Returns the response (for the caller to inspect/read) or null.
  async function check(url, via) {
    const key = normalize(url);
    if (checked.has(key)) return null;
    checked.add(key);
    if (isInternal(url)) discoveredPaths.add(pathKey(url));

    let res;
    const startedAt = Date.now();
    try {
      // A couple of retries to ride out transient blips / cold-cache slowness, with
      // a hard per-attempt timeout so a dead/hanging URL still can't stall the crawl.
      res = await request(url.toString(), { retries: 2, timeoutMs: 20000 });
    } catch (err) {
      const reason = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err);
      (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: `ERR ${reason}`, via });
      return null;
    }
    const elapsedMs = Date.now() - startedAt;

    if (res.status >= 400) {
      if (!isInternal(url) && BLOCKED_STATUSES.has(res.status)) {
        blockedExternal.push({ url: key, status: res.status, via });
      } else {
        (isInternal(url) ? brokenInternal : brokenExternal).push({ url: key, status: res.status, via });
      }
    } else if (isInternal(url) && res.status === 200 && elapsedMs > slowPageMs) {
      slowPages.push({ url: key, ms: elapsedMs, via });
    }

    for (const detail of findHeaderLeaks(res.headers, legacyHost, url)) {
      leaks.push({ url: key, detail, via });
    }

    // Loop detection only for internal redirects (covers the .hu -> .org path).
    if (isInternal(url) && res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await detectRedirectLoop(url, via);
    }
    return res;
  }

  const queue = [{ url: new URL(start), depth: 0, via: "(root)" }];
  enqueued.add(normalize(start));

  async function crawlWorker() {
    while (queue.length > 0 && pageCount < maxPages) {
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
      if (item.depth >= maxDepth) continue;

      const html = await res.text();
      const via = normalize(item.url);

      // Math render failures: KaTeX emits class="katex-error" for un-parseable TeX.
      const mathCount = extractMathErrors(html);
      if (mathCount.count > 0) {
        mathErrors.push({ url: via, count: mathCount.count, snippet: mathCount.snippet });
      }

      const { links, assets } = extractRefs(html, item.url);

      for (const link of links) {
        if (isInternal(link)) {
          const key = normalize(link);
          discoveredPaths.add(pathKey(link));
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

  await Promise.all(Array.from({ length: concurrency }, () => crawlWorker()));

  // Orphan detection: URLs advertised in /sitemap.xml but reached by no link.
  try {
    const sitemapUrl = new URL("/sitemap.xml", start).toString();
    const res = await request(sitemapUrl, { retries: 1, timeoutMs: 15000 });
    if (res.status === 200) {
      const xml = await res.text();
      const locs = parseSitemapLocs(xml);
      if (locs.length === 0) {
        sitemapNote = "sitemap.xml found but contained no <loc> page entries";
      } else {
        orphanPages = locs
          .filter((loc) => {
            try {
              return !discoveredPaths.has(pathKey(loc));
            } catch {
              return false;
            }
          })
          .map((loc) => ({ url: loc }));
      }
    } else {
      sitemapNote = `no usable sitemap.xml (status ${res.status}) — orphan detection skipped`;
    }
  } catch {
    sitemapNote = "sitemap.xml unreachable — orphan detection skipped";
  }

  return {
    pageCount,
    checked,
    brokenInternal,
    brokenExternal,
    blockedExternal,
    leaks,
    mathErrors,
    orphanPages,
    redirectLoops,
    slowPages,
    sitemapNote,
    cappedAtMaxPages: pageCount >= maxPages,
  };
}

// ---------------------------------------------------------------------------
// Thin CLI wrapper — console report + exit code, unchanged behaviour.
// ---------------------------------------------------------------------------

async function cli() {
  const r = await runCrawl();

  console.log(`\nCrawled ${r.pageCount} page(s); checked ${r.checked.size} URL(s) from ${baseUrl}`);
  if (r.cappedAtMaxPages) console.log(`(stopped at MAX_PAGES=${MAX_PAGES} cap)`);
  if (r.sitemapNote) console.log(`(orphan check: ${r.sitemapNote})`);

  const report = (title, items, fmt) => {
    console.log(`\n${title}: ${items.length}`);
    for (const it of items) console.log(`  - ${fmt(it)}`);
  };
  const linkFmt = (it) => `[${it.status ?? it.detail}] ${it.url}  (via ${it.via})`;

  if (r.leaks.length) report("LEGACY-HOST LEAKS (fatal)", r.leaks, linkFmt);
  if (r.brokenInternal.length) report("Broken internal links/assets (fatal)", r.brokenInternal, linkFmt);
  if (r.mathErrors.length) {
    report("Math render errors — katex-error (fatal)", r.mathErrors, (it) => `[${it.count}x] ${it.url}`);
  }
  if (r.redirectLoops.length) report("Redirect loops (fatal)", r.redirectLoops, linkFmt);
  if (r.brokenExternal.length) report("Broken external links/assets (warning)", r.brokenExternal, linkFmt);
  if (r.blockedExternal.length) report("External rate-limited/blocked — ignored (403/429)", r.blockedExternal, linkFmt);
  if (r.orphanPages.length) report("Orphan pages — in sitemap, linked from nowhere (warning)", r.orphanPages, (it) => it.url);
  if (r.slowPages.length) report(`Slow pages > ${SLOW_PAGE_MS}ms (warning)`, r.slowPages, (it) => `[${it.ms}ms] ${it.url}`);

  const fatal = r.leaks.length + r.brokenInternal.length + r.mathErrors.length + r.redirectLoops.length;
  const warnings =
    r.brokenExternal.length + r.blockedExternal.length + r.orphanPages.length + r.slowPages.length;
  if (fatal === 0 && warnings === 0) {
    console.log("\nNo broken links/assets, leaks, math errors, redirect loops, orphans or slow pages found.");
  }

  if (fatal > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await cli();
}
