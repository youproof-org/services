// Post-deploy checks for the cookie-consent feature, run against the LIVE host.
//
// Why these cannot be left to the crawler: the consent banner is never
// server-rendered (see components/consent/ConsentGate.tsx), so its "read more"
// links exist only in the JS bundle. The crawler follows links in HTML, so the
// one set of URLs the banner depends on is exactly the set it will never visit.
//
// Results are emitted as smoke-suite cases, so a failure is fatal to the gate
// without needing a new artifact schema.

/**
 * The policy-page URLs the banner links to, derived from the generated
 * .generated/consent-policy.json. Pure, so it is unit-testable offline.
 */
export function consentPolicyUrls(baseUrl, pages = []) {
  return pages.map((p) => ({
    name: `consent policy page reachable: /${p.locale}/${p.slug}`,
    url: `${baseUrl}/${p.locale}/${p.slug}`,
  }));
}

async function checkStatus(name, url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { redirect: "follow" });
    return res.ok
      ? { name, status: "pass", detail: `${res.status} ${url}` }
      : { name, status: "fail", detail: `HTTP ${res.status} for ${url}` };
  } catch (err) {
    return { name, status: "fail", detail: `${err.message} for ${url}` };
  }
}

/**
 * @param {object} p
 * @param {string} p.baseUrl
 * @param {Array<{locale:string,slug:string}>} p.pages from the generated consent-policy data
 * @param {string} p.defaultLocale used for the pre-consent homepage check
 * @param {Function} [p.fetchImpl] injectable for tests
 * @returns {Promise<{cases: Array<{name:string,status:string,detail:string}>}>}
 */
export async function runConsentChecks({ baseUrl, pages = [], defaultLocale, fetchImpl = fetch }) {
  const cases = []

  for (const { name, url } of consentPolicyUrls(baseUrl, pages)) {
    cases.push(await checkStatus(name, url, fetchImpl));
  }

  // The served markup must not reference the tag manager. The build-time guard
  // (apps/website/scripts/check-analytics-build.mjs) already asserts this over the
  // whole export; repeating it against the live host catches anything injected
  // between build and delivery — an edge rule, a transform, a stale object.
  const homeUrl = `${baseUrl}/${defaultLocale}`;
  const name = "no pre-consent Google tag in served HTML";
  try {
    const res = await fetchImpl(homeUrl, { redirect: "follow" });
    const html = await res.text();
    cases.push(
      html.includes("googletagmanager.com")
        ? { name, status: "fail", detail: `googletagmanager.com present in ${homeUrl}` }
        : { name, status: "pass", detail: homeUrl },
    );
  } catch (err) {
    cases.push({ name, status: "fail", detail: `${err.message} for ${homeUrl}` });
  }

  return { cases };
}
