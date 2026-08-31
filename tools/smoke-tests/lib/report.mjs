// Quality-gate report builder. Assembles the single JSON test artifact defined
// in docs/plans/yp-120-implementation-contract.md ("Test artifact schema &
// bucket layout"), and computes per-suite + overall pass/fail.
//
// Status policy:
//   - A suite is "pass" iff its FATAL categories are all empty.
//   - Crawler fatal categories: brokenInternal, brokenExternal, legacyLeaks,
//     mathErrors, redirectLoops, langErrors, seoErrors (a content page missing a
//     required meta/OG/canonical/hreflang tag, or the pipeline emitting none),
//     robotsErrors (robots.txt wrong for the environment) and crawlLimits (the
//     crawl hit its page cap, so no category above is complete and the pages it
//     never reached would surface as orphans). brokenExternal is fatal
//     because this is a mathematical portal: every outbound link must resolve, or
//     the content is stale (SEO / consistency risk). Warnings (do NOT fail):
//     orphanPages, slowPages, seoWarnings (over-long title/description,
//     non-self-referential canonical), and external 403/429 rate-limited hosts
//     (dropped, not emitted — bot-block/rate-limit is not a broken link).
//   - Smoke fatal: any failed case.
//   - overall === "pass" iff every suite status === "pass".
//
// Pure module — no I/O — so it is unit-testable offline.

export const SCHEMA_VERSION = 1;

/** Classify a smoke-suite result ({ total, passed, failed, cases }) → suite object. */
export function buildSmokeSuite(smoke = {}) {
  const cases = (smoke.cases ?? []).map((c) => ({
    name: c.name ?? "",
    status: c.status ?? "pass",
    detail: c.detail ?? "",
  }));
  const failed = smoke.failed ?? cases.filter((c) => c.status === "fail").length;
  const passed = smoke.passed ?? cases.filter((c) => c.status === "pass").length;
  const total = smoke.total ?? cases.length;
  return {
    status: failed > 0 ? "fail" : "pass",
    total,
    passed,
    failed,
    cases,
  };
}

/** Classify a runCrawl() result → crawler suite object matching the schema. */
export function buildCrawlerSuite(crawl = {}) {
  const brokenInternal = crawl.brokenInternal ?? [];
  const brokenExternal = crawl.brokenExternal ?? [];
  const legacyLeaks = crawl.leaks ?? [];
  const mathErrors = crawl.mathErrors ?? [];
  const redirectLoops = crawl.redirectLoops ?? [];
  const langErrors = crawl.langErrors ?? [];
  const seoErrors = crawl.seoErrors ?? [];
  const robotsErrors = crawl.robotsErrors ?? [];
  const crawlLimits = crawl.crawlLimits ?? [];

  const fatal =
    brokenInternal.length +
    brokenExternal.length +
    legacyLeaks.length +
    mathErrors.length +
    redirectLoops.length +
    langErrors.length +
    seoErrors.length +
    robotsErrors.length +
    crawlLimits.length;

  return {
    status: fatal > 0 ? "fail" : "pass",
    pagesCrawled: crawl.pageCount ?? 0,
    brokenInternal,
    brokenExternal,
    legacyLeaks,
    mathErrors,
    orphanPages: crawl.orphanPages ?? [],
    redirectLoops,
    slowPages: crawl.slowPages ?? [],
    langErrors,
    seoErrors,
    robotsErrors,
    crawlLimits,
    seoWarnings: crawl.seoWarnings ?? [],
  };
}

/**
 * Build the full report object.
 *
 * @param {object} p
 * @param {string} p.environment   "staging" | "production" | ...
 * @param {string} p.servicesSha
 * @param {string} p.contentSha
 * @param {string} p.generatedAt   ISO-8601
 * @param {object} p.smoke         { total, passed, failed, cases }
 * @param {object} p.crawler       a runCrawl() result
 */
export function buildReport({ environment, servicesSha, contentSha, generatedAt, smoke, crawler }) {
  const smokeSuite = buildSmokeSuite(smoke);
  const crawlerSuite = buildCrawlerSuite(crawler);
  const overall = smokeSuite.status === "pass" && crawlerSuite.status === "pass" ? "pass" : "fail";

  return {
    schemaVersion: SCHEMA_VERSION,
    environment: environment ?? "",
    servicesSha: servicesSha ?? "",
    contentSha: contentSha ?? "",
    generatedAt: generatedAt ?? new Date().toISOString(),
    overall,
    suites: {
      smoke: smokeSuite,
      crawler: crawlerSuite,
    },
  };
}
