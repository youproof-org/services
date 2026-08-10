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

import { readFileSync, writeFileSync } from "node:fs";

import { config, baseUrl } from "../lib/config.mjs";
import { buildReport } from "../lib/report.mjs";
import { runSmoke } from "../lib/smoke-runner.mjs";
import { runConsentChecks } from "../lib/consent-checks.mjs";
import { runCrawl } from "./crawl.mjs";

const reportOut = process.env.REPORT_OUT ?? "./quality-gate-report.json";

// Locale dictionary (shared source of truth). Drives two things:
//   1. The crawl START: every public page is locale-prefixed and the bare root
//      is a redirect to the locale home — a static index.html stub (HTTP 200 +
//      client-side redirect) today, plus an edge 302 once the parked zone rule
//      ships. Neither is followed by a link-crawler, so we start the crawl at the
//      default locale's homepage directly (independent of how `/` redirects), or
//      the crawler would traverse nothing.
//   2. The per-page <html lang> check (crawler `langErrors`): each live page must
//      declare the language of the locale in its URL path.
// Unreadable dictionary => crawl from root with no lang check (degrades safely).
let locales = null;
let defaultLocale = null;
let crawlStart = baseUrl;
try {
  const ld = JSON.parse(
    readFileSync(new URL("../../../apps/website/lib/i18n/locales.json", import.meta.url), "utf8"),
  );
  locales = ld.locales;
  const keys = Object.keys(locales);
  const envDefault = process.env.DEFAULT_LOCALE?.trim();
  defaultLocale = envDefault && locales[envDefault] ? envDefault : keys[0];
  crawlStart = `${baseUrl}/${defaultLocale}`;
} catch (err) {
  console.log(`quality-gate: could not read locales dictionary (${err.message}) — crawling from root, no lang check`);
}

// Migrated-redirect targets to verify exist (200) on the live .org site. The
// worker job generates the manifest from content and hands it to this job via a
// workflow artifact (MANIFEST_PATH). The manifest's VALUES are the .org paths
// each legacy path 301s to; we confirm each resolves to a real page (catching
// manifest/route drift). No MANIFEST_PATH (older runs / the .hu gate) => none.
let migrationTargets = [];
const manifestPath = process.env.MANIFEST_PATH;
if (manifestPath) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    migrationTargets = Object.values(m.entries ?? {});
    console.log(
      `quality-gate: will verify ${migrationTargets.length} migrated .org target(s) from ${manifestPath}`,
    );
  } catch (err) {
    console.log(`quality-gate: could not read manifest at ${manifestPath} (${err.message}) — skipping target check`);
  }
}

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

// Consent checks: the banner's policy links plus a pre-consent tag check. Folded
// into the smoke suite (rather than a new suite) so the artifact schema is
// unchanged and failures stay fatal.
//
// The page list arrives via CONSENT_POLICY_PAGES, set from the website job's
// output. It cannot be read from disk here: the generated file is gitignored and
// this job runs on a fresh checkout with no content clone. Falling back to the
// file anyway covers running this locally straight after a build. Empty or absent
// => the consent feature is off in this build and there is nothing to verify.
let consentPages = [];
if (process.env.CONSENT_POLICY_PAGES) {
  try {
    consentPages = JSON.parse(process.env.CONSENT_POLICY_PAGES);
  } catch (err) {
    console.log(`quality-gate: CONSENT_POLICY_PAGES is not valid JSON (${err.message}) — skipping consent checks`);
  }
} else {
  try {
    consentPages =
      JSON.parse(
        readFileSync(new URL("../../../apps/website/.generated/consent-policy.json", import.meta.url), "utf8"),
      ).pages ?? [];
  } catch {
    // Expected in CI: nothing generated in this job.
  }
}

if (consentPages.length > 0) {
  const { cases } = await runConsentChecks({
    baseUrl,
    pages: consentPages,
    defaultLocale: defaultLocale ?? "hu",
  });
  smoke.cases = [...(smoke.cases ?? []), ...cases];
  smoke.total = smoke.cases.length;
  smoke.passed = smoke.cases.filter((c) => c.status === "pass").length;
  smoke.failed = smoke.cases.filter((c) => c.status === "fail").length;
  console.log(
    `quality-gate: consent checks -> ${cases.filter((c) => c.status === "pass").length}/${cases.length} passed`,
  );
} else {
  console.log("quality-gate: no consent policy pages for this build — skipping consent checks.");
}

// Seed the crawl with EVERY locale's homepage (locales are separate link-islands
// with no switcher between them), so all locales are crawled and lang-checked —
// not just the default. Falls back to the single default-locale home.
const crawlStarts = locales ? Object.keys(locales).map((loc) => `${baseUrl}/${loc}`) : [crawlStart];
// The .org content gate (post-migration mode: empty LEGACY_PROXY_HOST) also runs
// the SEO/OG + robots.txt assertions; the .hu worker crawl does not.
const checkSeo = config.legacyProxyHost === "";
const environment = process.env.ENVIRONMENT ?? config.environment ?? "";
console.log(`quality-gate: crawling ${crawlStarts.join(", ")} (SEO checks ${checkSeo ? "on" : "off"}) ...`);
const crawler = await runCrawl({ migrationTargets, starts: crawlStarts, locales, defaultLocale, checkSeo, environment });
console.log(
  `quality-gate: crawler -> ${crawler.pageCount} page(s); ` +
    `internal=${crawler.brokenInternal.length} leaks=${crawler.leaks.length} ` +
    `math=${crawler.mathErrors.length} loops=${crawler.redirectLoops.length} ` +
    `lang=${crawler.langErrors.length} seo=${crawler.seoErrors?.length ?? 0} robots=${crawler.robotsErrors?.length ?? 0} ` +
    `external=${crawler.brokenExternal.length} orphans=${crawler.orphanPages.length} slow=${crawler.slowPages.length} ` +
    `(seoChecked=${crawler.seoChecked ?? 0}, seoWarn=${crawler.seoWarnings?.length ?? 0})`,
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
