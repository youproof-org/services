// The crawler's orphan check and its page cap, driven end-to-end against a
// throwaway localhost site (node:http, no external network).
//
// Both behaviours only exist at the seams of runCrawl — one fetches the sitemap
// after the walk, the other depends on the queue being abandoned mid-walk — so
// neither is reachable from a pure helper. A tiny real server is the cheapest way
// to assert them.
//
// The sitemap cases are the reason this file exists: /sitemap.xml is a
// <sitemapindex> whose <loc> values are child SITEMAPS, not pages. Cross-
// referencing those against crawled pages matches nothing, so every child would
// be reported as an orphan while no real page was ever checked.

process.env.WORKER_DOMAIN ??= "orphan-check.invalid";

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

const { runCrawl } = await import("../scripts/crawl.mjs");

const page = (links) =>
  `<!doctype html><html lang="hu"><body>${links.map((h) => `<a href="${h}">l</a>`).join("")}</body></html>`;

const urlset = (paths, origin) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  paths.map((p) => `<url><loc>${origin}${p}</loc></url>`).join("") +
  `</urlset>`;

const sitemapindex = (paths, origin) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
  paths.map((p) => `<sitemap><loc>${origin}${p}</loc></sitemap>`).join("") +
  `</sitemapindex>`;

/**
 * Serve `routes` (path → { body, type }) on an ephemeral port and hand the crawl
 * result to `assertions`. `routes` is built by a callback so it can embed the
 * origin, which is not known until the port is assigned.
 */
async function crawlFixture(buildRoutes, options = {}) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const route = server.routes[path];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": route.type });
    res.end(route.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  server.routes = buildRoutes(origin);
  try {
    return await runCrawl({ domain: "127.0.0.1", start: origin, starts: [`${origin}/hu`], ...options });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const html = (body) => ({ body, type: "text/html; charset=utf-8" });
const xml = (body) => ({ body, type: "application/xml; charset=utf-8" });

// Three linked pages plus one the link graph never reaches, advertised across two
// child sitemaps — so finding it requires following the index.
const splitSite = (origin) => ({
  "/hu": html(page(["/hu/a", "/hu/b"])),
  "/hu/a": html(page([])),
  "/hu/b": html(page([])),
  "/hu/unlinked": html(page([])),
  "/sitemap.xml": xml(sitemapindex(["/sitemap-1.xml", "/sitemap-2.xml"], origin)),
  "/sitemap-1.xml": xml(urlset(["/hu", "/hu/a"], origin)),
  "/sitemap-2.xml": xml(urlset(["/hu/b", "/hu/unlinked"], origin)),
});

test("a <sitemapindex> is followed one level down and its children's pages unioned", async () => {
  const r = await crawlFixture(splitSite);

  assert.equal(r.pageCount, 3);
  assert.deepEqual(
    r.orphanPages.map((o) => new URL(o.url).pathname),
    ["/hu/unlinked"],
  );
  // The child sitemaps themselves are never mistaken for pages.
  assert.equal(
    r.orphanPages.some((o) => o.url.includes("sitemap-")),
    false,
  );
  assert.match(r.sitemapNote, /2 child sitemap\(s\), 4 page URL\(s\)/);
});

test("a plain <urlset> at /sitemap.xml still works, and reports no note", async () => {
  const r = await crawlFixture((origin) => ({
    "/hu": html(page(["/hu/a"])),
    "/hu/a": html(page([])),
    "/hu/unlinked": html(page([])),
    "/sitemap.xml": xml(urlset(["/hu", "/hu/a", "/hu/unlinked"], origin)),
  }));

  assert.deepEqual(
    r.orphanPages.map((o) => new URL(o.url).pathname),
    ["/hu/unlinked"],
  );
  assert.equal(r.sitemapNote, "");
});

test("an index whose children do not resolve skips orphan detection rather than reporting them", async () => {
  const r = await crawlFixture((origin) => ({
    "/hu": html(page(["/hu/a"])),
    "/hu/a": html(page([])),
    "/sitemap.xml": xml(sitemapindex(["/sitemap-gone.xml"], origin)),
  }));

  assert.deepEqual(r.orphanPages, []);
  assert.match(r.sitemapNote, /status 404/);
  assert.match(r.sitemapNote, /orphan detection skipped/);
});

test("child sitemap URLs are re-based onto the crawled host, not the advertised one", async () => {
  // The sitemap advertises the canonical host while the crawl runs against a
  // per-env hostname; the children must still be fetched from the host under test.
  const r = await crawlFixture((origin) => ({
    ...splitSite(origin),
    "/sitemap.xml": xml(sitemapindex(["/sitemap-1.xml", "/sitemap-2.xml"], "https://youproof.org")),
  }));

  assert.match(r.sitemapNote, /2 child sitemap\(s\), 4 page URL\(s\)/);
  assert.deepEqual(
    r.orphanPages.map((o) => new URL(o.url).pathname),
    ["/hu/unlinked"],
  );
});

test("hitting the page cap is a fatal finding, not a silent truncation", async () => {
  const r = await crawlFixture(splitSite, { maxPages: 2 });

  assert.equal(r.pageCount, 2);
  assert.equal(r.crawlLimits.length, 1);
  assert.match(r.crawlLimits[0].detail, /MAX_PAGES=2/);
  assert.match(r.crawlLimits[0].detail, /still queued/);
});

test("a complete crawl records no limit finding", async () => {
  const r = await crawlFixture(splitSite);
  assert.deepEqual(r.crawlLimits, []);
});
