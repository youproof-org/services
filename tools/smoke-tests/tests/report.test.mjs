// Offline unit tests for the quality-gate report builder (lib/report.mjs) and the
// new pure crawler helpers (extractMathErrors, parseSitemapLocs). No network.

import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReport, buildCrawlerSuite, buildSmokeSuite } from "../lib/report.mjs";
import { extractMathErrors, parseSitemapLocs, isSitemapIndex } from "../lib/extract.mjs";

test("buildReport: clean crawl + all-green smoke => overall pass, schema shape", () => {
  const report = buildReport({
    environment: "staging",
    servicesSha: "a".repeat(40),
    contentSha: "b".repeat(40),
    generatedAt: "2026-07-05T00:00:00.000Z",
    smoke: { total: 3, passed: 3, failed: 0, cases: [{ name: "x", status: "pass", detail: "" }] },
    crawler: { pageCount: 12 },
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.environment, "staging");
  assert.equal(report.servicesSha, "a".repeat(40));
  assert.equal(report.contentSha, "b".repeat(40));
  assert.equal(report.generatedAt, "2026-07-05T00:00:00.000Z");
  assert.equal(report.overall, "pass");
  assert.equal(report.suites.smoke.status, "pass");
  assert.equal(report.suites.crawler.status, "pass");
  assert.equal(report.suites.crawler.pagesCrawled, 12);
  // Every crawler finding key present, defaulted to [].
  for (const k of ["brokenInternal", "brokenExternal", "legacyLeaks", "mathErrors", "orphanPages", "redirectLoops", "slowPages", "langErrors", "seoErrors", "robotsErrors", "crawlLimits", "seoWarnings"]) {
    assert.deepEqual(report.suites.crawler[k], [], `crawler.${k}`);
  }
});

test("buildCrawlerSuite: each fatal category fails the suite; warnings do not", () => {
  const fatalCases = [
    { brokenInternal: [{ url: "/x" }] },
    { brokenExternal: [{ url: "https://x" }] },
    { leaks: [{ url: "/x", detail: "d" }] },
    { mathErrors: [{ url: "/x", count: 1 }] },
    { redirectLoops: [{ url: "/x", detail: "cycle" }] },
    { langErrors: [{ url: "/en/x", found: "hu", expected: "en" }] },
    { seoErrors: [{ url: "/x", missing: ["og:image"] }] },
    { robotsErrors: [{ detail: "production robots.txt Disallow: /" }] },
    // A truncated crawl is fatal: the pages it never reached are missing from every
    // other category and would be reported as orphans.
    { crawlLimits: [{ detail: "crawl stopped at MAX_PAGES=1000" }] },
  ];
  for (const c of fatalCases) {
    assert.equal(buildCrawlerSuite(c).status, "fail", JSON.stringify(c));
  }

  const warningsOnly = buildCrawlerSuite({
    orphanPages: [{ url: "/y" }],
    slowPages: [{ url: "/z", ms: 9000 }],
    seoWarnings: [{ url: "/z", warnings: ["meta description 180 chars (> 160)"] }],
  });
  assert.equal(warningsOnly.status, "pass");
  // legacyLeaks maps from the crawler's `leaks` array.
  assert.deepEqual(buildCrawlerSuite({ leaks: [{ url: "/x", detail: "d" }] }).legacyLeaks, [
    { url: "/x", detail: "d" },
  ]);
});

test("buildSmokeSuite: any failed case fails the suite; overall reflects it", () => {
  const suite = buildSmokeSuite({
    cases: [
      { name: "a", status: "pass" },
      { name: "b", status: "fail", detail: "boom" },
      { name: "c", status: "skip" },
    ],
  });
  assert.equal(suite.status, "fail");
  assert.equal(suite.failed, 1);
  assert.equal(suite.passed, 1);
  assert.equal(suite.total, 3);

  const report = buildReport({ smoke: { cases: [{ name: "b", status: "fail" }] }, crawler: {} });
  assert.equal(report.overall, "fail");
});

test("extractMathErrors counts katex-error spans and returns a snippet", () => {
  const clean = `<span class="katex">x^2</span>`;
  assert.equal(extractMathErrors(clean).count, 0);

  const broken = `<p>ok</p><span class="katex-error" title="ParseError">\\frac{</span>
                  <span class='foo katex-error bar'>oops</span>`;
  const r = extractMathErrors(broken);
  assert.equal(r.count, 2);
  assert.match(r.snippet, /katex-error/);
});

test("isSitemapIndex tells a <sitemapindex> from a <urlset>", () => {
  assert.equal(
    isSitemapIndex(`<?xml version="1.0"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://youproof.org/sitemap-tetelek.xml</loc></sitemap>
      </sitemapindex>`),
    true,
  );
  assert.equal(
    isSitemapIndex(`<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://youproof.org/hu</loc></url>
      </urlset>`),
    false,
  );
  // The word appearing inside a <loc> is not the root element.
  assert.equal(
    isSitemapIndex(`<urlset><url><loc>https://youproof.org/sitemapindex-notes</loc></url></urlset>`),
    false,
  );
});

test("parseSitemapLocs extracts absolute page URLs, deduped, entity-decoded", () => {
  const xml = `<?xml version="1.0"?>
    <urlset>
      <url><loc>https://staging.youproof.hu/</loc></url>
      <url><loc>https://staging.youproof.hu/a?x=1&amp;y=2</loc></url>
      <url><loc>https://staging.youproof.hu/</loc></url>
      <url><loc>/relative/ignored</loc></url>
    </urlset>`;
  const locs = parseSitemapLocs(xml);
  assert.deepEqual(locs.sort(), [
    "https://staging.youproof.hu/",
    "https://staging.youproof.hu/a?x=1&y=2",
  ]);
});
