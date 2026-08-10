import { test } from "node:test";
import assert from "node:assert/strict";

import { consentPolicyUrls, runConsentChecks } from "../lib/consent-checks.mjs";

const PAGES = [
  { locale: "hu", slug: "adatkezeles", title: "Adatkezelési tájékoztató" },
  { locale: "hu", slug: "suti-cookie-kezelese", title: "Süti tájékoztató" },
];

test("builds one URL per policy page", () => {
  assert.deepEqual(
    consentPolicyUrls("https://youproof.org", PAGES).map((c) => c.url),
    ["https://youproof.org/hu/adatkezeles", "https://youproof.org/hu/suti-cookie-kezelese"],
  );
});

test("builds nothing when the feature is off", () => {
  assert.deepEqual(consentPolicyUrls("https://youproof.org", []), []);
  assert.deepEqual(consentPolicyUrls("https://youproof.org"), []);
});

function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) throw new Error(`unexpected request to ${url}`);
    if (r.throws) throw new Error(r.throws);
    return { ok: r.status < 400, status: r.status, text: async () => r.body ?? "" };
  };
}

test("passes when every policy page resolves and the markup is clean", async () => {
  const { cases } = await runConsentChecks({
    baseUrl: "https://youproof.org",
    pages: PAGES,
    defaultLocale: "hu",
    fetchImpl: fakeFetch({
      "https://youproof.org/hu/adatkezeles": { status: 200 },
      "https://youproof.org/hu/suti-cookie-kezelese": { status: 200 },
      "https://youproof.org/hu": { status: 200, body: "<html>clean</html>" },
    }),
  });
  assert.equal(cases.length, 3);
  assert.ok(cases.every((c) => c.status === "pass"), JSON.stringify(cases));
});

test("fails a policy page the banner links to but the site does not serve", async () => {
  const { cases } = await runConsentChecks({
    baseUrl: "https://youproof.org",
    pages: PAGES,
    defaultLocale: "hu",
    fetchImpl: fakeFetch({
      "https://youproof.org/hu/adatkezeles": { status: 200 },
      "https://youproof.org/hu/suti-cookie-kezelese": { status: 404 },
      "https://youproof.org/hu": { status: 200, body: "<html>clean</html>" },
    }),
  });
  const failed = cases.filter((c) => c.status === "fail");
  assert.equal(failed.length, 1);
  assert.match(failed[0].detail, /HTTP 404.*suti-cookie-kezelese/);
});

test("fails when the served HTML references the tag manager", async () => {
  const { cases } = await runConsentChecks({
    baseUrl: "https://youproof.org",
    pages: [],
    defaultLocale: "hu",
    fetchImpl: fakeFetch({
      "https://youproof.org/hu": {
        status: 200,
        body: '<script src="https://www.googletagmanager.com/gtag/js?id=G-X"></script>',
      },
    }),
  });
  assert.equal(cases.length, 1);
  assert.equal(cases[0].status, "fail");
  assert.match(cases[0].detail, /googletagmanager\.com present/);
});

test("reports a network error as a failure rather than throwing", async () => {
  const { cases } = await runConsentChecks({
    baseUrl: "https://youproof.org",
    pages: [PAGES[0]],
    defaultLocale: "hu",
    fetchImpl: fakeFetch({
      "https://youproof.org/hu/adatkezeles": { throws: "ECONNREFUSED" },
      "https://youproof.org/hu": { status: 200, body: "ok" },
    }),
  });
  assert.equal(cases[0].status, "fail");
  assert.match(cases[0].detail, /ECONNREFUSED/);
});
