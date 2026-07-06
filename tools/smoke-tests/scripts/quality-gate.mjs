// Quality-gate entrypoint. Runs the smoke suites + the site crawler, assembles
// the single JSON test artifact (see docs/plans/yp-120-implementation-contract.md
// "Test artifact schema & bucket layout"), writes it to REPORT_OUT, and exits
// non-zero iff overall !== "pass".
//
// CI keys the artifact by the (services_sha, content_sha) pair it tested and
// uploads it to the env's test-artifacts R2 bucket at
//   reports/{services_sha}__{content_sha}.json  (+ a reports/latest.json copy).
// Upload the artifact with `if: always()` so a failing gate still publishes its
// report (the PR gate later reads overall === "pass" from it).
//
//   WORKER_DOMAIN=staging.youproof.hu LEGACY_PROXY_HOST=legacy.staging.youproof.hu \
//   REDIRECT_TARGET_HOST=youproof.org ENVIRONMENT=staging \
//   SERVICES_SHA=<40hex> CONTENT_SHA=<40hex> REPORT_OUT=./quality-gate-report.json \
//   node scripts/quality-gate.mjs

import { writeFileSync } from "node:fs";

import { config } from "../lib/config.mjs";
import { buildReport } from "../lib/report.mjs";
import { runSmoke } from "../lib/smoke-runner.mjs";
import { runCrawl } from "./crawl.mjs";

const reportOut = process.env.REPORT_OUT ?? "./quality-gate-report.json";

// SKIP_SMOKE=1|true|yes => crawler-only gate. The smoke suites assert the .hu
// migration Worker's 301/410 redirect semantics, which do not apply to the
// youproof.org static site (no redirect worker on that zone). For the .org
// post-deploy gate the crawler is the substantive check, so the smoke suites are
// skipped and recorded as an empty, passing suite. Default (unset) is unchanged:
// the smoke suites run (used by the .hu worker gate).
const skipSmoke = /^(1|true|yes)$/i.test(process.env.SKIP_SMOKE ?? "");

let smoke;
if (skipSmoke) {
  console.log("quality-gate: SKIP_SMOKE set — crawler-only gate (skipping .hu redirect smoke suites).");
  smoke = { total: 0, passed: 0, failed: 0, skipped: 0, cases: [] };
} else {
  console.log("quality-gate: running smoke suites (node:test) ...");
  smoke = await runSmoke();
  console.log(
    `quality-gate: smoke -> ${smoke.passed} passed, ${smoke.failed} failed, ${smoke.skipped} skipped (of ${smoke.total})`,
  );
}

console.log(`quality-gate: crawling https://${config.workerDomain} ...`);
const crawler = await runCrawl();
console.log(
  `quality-gate: crawler -> ${crawler.pageCount} page(s); ` +
    `internal=${crawler.brokenInternal.length} leaks=${crawler.leaks.length} ` +
    `math=${crawler.mathErrors.length} loops=${crawler.redirectLoops.length} ` +
    `external=${crawler.brokenExternal.length} orphans=${crawler.orphanPages.length} slow=${crawler.slowPages.length}`,
);
if (crawler.sitemapNote) console.log(`quality-gate: orphan check note: ${crawler.sitemapNote}`);

const report = buildReport({
  environment: process.env.ENVIRONMENT ?? config.environment ?? "",
  servicesSha: process.env.SERVICES_SHA ?? "",
  contentSha: process.env.CONTENT_SHA ?? "",
  generatedAt: process.env.GENERATED_AT ?? new Date().toISOString(),
  smoke,
  crawler,
});

writeFileSync(reportOut, JSON.stringify(report, null, 2) + "\n");
console.log(
  `quality-gate: wrote ${reportOut} — overall=${report.overall} ` +
    `(smoke=${report.suites.smoke.status}, crawler=${report.suites.crawler.status})`,
);

if (report.overall !== "pass") process.exit(1);
