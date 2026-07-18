// Offline unit tests for the crawler's pure helpers (no network). Verifies asset
// extraction (images/CSS/scripts/media/srcset/object) and legacy-host leak
// detection across all response headers.

import assert from "node:assert/strict";
import { test } from "node:test";

import { extractRefs, findHeaderLeaks, toUrl, extractHtmlLang, extractSeo } from "../lib/extract.mjs";

const BASE = "https://staging.youproof.hu/page/";

test("extractRefs separates navigational links from assets", () => {
  const html = `
    <a href="/other-page/">nav</a>
    <a href="https://youproof.org/moved">external</a>
    <img src="/img/logo.png">
    <img srcset="/img/s.png 480w, /img/l.png 1024w">
    <script src="/js/app.js"></script>
    <link rel="stylesheet" href="/css/site.css">
    <source src="/media/clip.mp4">
    <video src="/media/v.mp4"></video>
    <object data="/files/doc.pdf"></object>
  `;
  const { links, assets } = extractRefs(html, BASE);

  const linkPaths = links.map((u) => u.pathname);
  assert.deepEqual(linkPaths.sort(), ["/moved", "/other-page/"]);

  const assetPaths = assets.map((u) => u.pathname).sort();
  assert.deepEqual(assetPaths, [
    "/css/site.css",
    "/files/doc.pdf",
    "/img/l.png",
    "/img/logo.png",
    "/img/s.png",
    "/js/app.js",
    "/media/clip.mp4",
    "/media/v.mp4",
  ]);
});

test("extractRefs / toUrl skip non-fetchable and internal-only refs", () => {
  const html = `
    <a href="#section">anchor</a>
    <a href="mailto:info@youproof.hu">mail</a>
    <a href="tel:+3611234567">tel</a>
    <a href="javascript:void(0)">js</a>
    <img src="data:image/png;base64,AAAA">
    <a href="/cdn-cgi/l/email-protection">cf</a>
    <link rel="pingback" href="https://staging.youproof.hu/xmlrpc.php">
    <link rel="dns-prefetch" href="//fonts.googleapis.com">
  `;
  const { links, assets } = extractRefs(html, BASE);
  assert.equal(links.length, 0);
  assert.equal(assets.length, 0);

  assert.equal(toUrl("#x", BASE), null);
  assert.equal(toUrl("mailto:a@b.c", BASE), null);
  assert.equal(toUrl("/cdn-cgi/trace", BASE), null);
  assert.equal(toUrl("/xmlrpc.php", BASE), null);
  assert.equal(toUrl("/ok", BASE)?.pathname, "/ok");
});

test("<link> extraction is rel-aware: keeps stylesheet/shortlink, drops hints & xmlrpc", () => {
  const html = `
    <link rel="stylesheet" href="/css/site.css">
    <link rel="dns-prefetch" href="//fonts.googleapis.com">
    <link rel="preconnect" href="https://cdn.example.com">
    <link rel="pingback" href="https://staging.youproof.hu/xmlrpc.php">
    <link rel="EditURI" href="https://staging.youproof.hu/xmlrpc.php?rsd">
    <link rel="shortlink" href="/?p=42">
  `;
  const { assets } = extractRefs(html, BASE);
  const hrefs = assets.map((u) => u.pathname + u.search).sort();
  assert.deepEqual(hrefs, ["/?p=42", "/css/site.css"]);
});

test("<link> extraction skips SEO metadata: canonical + hreflang alternates, keeps feed alternates", () => {
  const html = `
    <link rel="canonical" href="https://staging.youproof.org/hu">
    <link rel="alternate" hreflang="hu" href="https://staging.youproof.org/hu">
    <link rel="alternate" hreflang="x-default" href="https://staging.youproof.org/hu">
    <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    <link rel="stylesheet" href="/css/site.css">
  `;
  const { assets } = extractRefs(html, BASE);
  const hrefs = assets.map((u) => u.pathname).sort();
  assert.deepEqual(hrefs, ["/css/site.css", "/feed.xml"]);
});

test("<link> extraction skips SEO metadata: canonical + hreflang alternates, keeps feed alternates", () => {
  const html = `
    <link rel="canonical" href="https://youproof.org/hu">
    <link rel="alternate" hreflang="hu" href="https://youproof.org/hu">
    <link rel="alternate" hreflang="x-default" href="https://youproof.org/hu">
    <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    <link rel="stylesheet" href="/css/site.css">
  `;
  const { assets } = extractRefs(html, BASE);
  const hrefs = assets.map((u) => u.pathname).sort();
  assert.deepEqual(hrefs, ["/css/site.css", "/feed.xml"]);
});

test("findHeaderLeaks flags the legacy host in any header, incl. relative Location", () => {
  const legacy = "legacy.staging.youproof.hu";

  // Absolute Location on the legacy host.
  const absLoc = new Headers({ location: `https://${legacy}/path/` });
  assert.deepEqual(findHeaderLeaks(absLoc, legacy, BASE), [`Location: https://${legacy}/path/`]);

  // Relative Location that resolves to the legacy request URL.
  const relLoc = new Headers({ location: "/path/" });
  assert.deepEqual(findHeaderLeaks(relLoc, legacy, `https://${legacy}/path`), ["Location: /path/"]);

  // Non-Location header leaking the host (e.g. Link).
  const linkHdr = new Headers({ link: `<https://${legacy}/wp-json/>; rel="https://api.w.org/"` });
  const found = findHeaderLeaks(linkHdr, legacy, BASE);
  assert.equal(found.length, 1);
  assert.match(found[0], /^header link: /);

  // Clean headers on the public host -> no leaks.
  const clean = new Headers({ location: "https://staging.youproof.hu/x/", "x-foo": "bar" });
  assert.deepEqual(findHeaderLeaks(clean, legacy, BASE), []);

  // No legacy host configured (post-migration) -> never flags.
  assert.deepEqual(findHeaderLeaks(absLoc, "", BASE), []);
});

test("extractHtmlLang reads the <html> lang attribute (or '' when absent)", () => {
  assert.equal(extractHtmlLang('<!doctype html><html lang="hu" class="x">'), "hu");
  assert.equal(extractHtmlLang('<html class="x" lang="en">'), "en");
  assert.equal(extractHtmlLang("<html lang='pt-BR'>"), "pt-BR");
  assert.equal(extractHtmlLang("<html class=\"x\">"), "");
  assert.equal(extractHtmlLang("<div lang=\"hu\">not the html tag</div>"), "");
});

test("extractSeo pulls title/description/canonical/hreflang + the OG block (order-agnostic)", () => {
  const html = `
    <title>Alice és Bob színrelép | youproof.org - Deep Math. Human Access.</title>
    <meta name="description" content="Bevezetés a kriptográfiába.">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="https://staging.youproof.org/hu/konyvek/alice-es-bob"/>
    <link rel="alternate" hreflang="hu" href="https://staging.youproof.org/hu/konyvek/alice-es-bob"/>
    <link rel="alternate" hreflang="x-default" href="https://staging.youproof.org/hu/konyvek/alice-es-bob"/>
    <meta property="og:title" content="Alice és Bob színrelép"/>
    <meta content="1. rész" property="og:description"/>
    <meta property="og:type" content="article"/>
    <meta property="og:url" content="https://staging.youproof.org/hu/konyvek/alice-es-bob"/>
    <meta property="og:site_name" content="youproof.org"/>
    <meta property="og:locale" content="hu_HU"/>
    <meta property="og:image" content="https://staging.youproof.org/content/books/alice-es-bob/og-thumbnail.jpg"/>
    <meta property="og:image:width" content="1200"/>
  `;
  const seo = extractSeo(html);
  assert.match(seo.title, /^Alice és Bob színrelép \| /);
  assert.equal(seo.description, "Bevezetés a kriptográfiába.");
  assert.equal(seo.robots, "noindex, nofollow");
  assert.equal(seo.canonical, "https://staging.youproof.org/hu/konyvek/alice-es-bob");
  assert.deepEqual(seo.hreflangs.sort(), ["hu", "x-default"]);
  assert.equal(seo.og.title, "Alice és Bob színrelép");
  assert.equal(seo.og.description, "1. rész"); // content-before-property order handled
  assert.equal(seo.og.type, "article");
  assert.equal(seo.og.siteName, "youproof.org");
  assert.equal(seo.og.locale, "hu_HU");
  assert.equal(seo.og.image, "https://staging.youproof.org/content/books/alice-es-bob/og-thumbnail.jpg");
  // og:image (not og:image:width) is matched exactly.
  assert.ok(!seo.og.image.endsWith("1200"));
});

test("extractSeo returns nulls / empty for a page with no SEO head (a stub)", () => {
  const seo = extractSeo("<!doctype html><html><body>Sorry</body></html>");
  assert.equal(seo.title, null);
  assert.equal(seo.description, null);
  assert.equal(seo.canonical, null);
  assert.deepEqual(seo.hreflangs, []);
  assert.equal(seo.og.title, null);
});
