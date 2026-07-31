import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfirmationEmail, buildLegacyInviteEmail } from "../src/lib/email.ts";

const confirmUrl = "https://youproof.org/api/v1/newsletter/subscriptions/abc/confirm?token=t1";
const unsubscribeUrl = "https://youproof.org/api/v1/newsletter/subscriptions/abc/unsubscribe?token=t2";

test("includes greeting, confirm link, and unsubscribe link", () => {
  const e = buildConfirmationEmail({ name: "Anna", confirmUrl, unsubscribeUrl });
  assert.match(e.subject, /erősítsd meg/i);
  assert.ok(e.htmlContent.includes(confirmUrl), "html has confirm url");
  assert.ok(e.htmlContent.includes(unsubscribeUrl), "html has unsubscribe url");
  assert.ok(e.htmlContent.includes("Anna"), "html greets by name");
  assert.ok(e.textContent.includes(confirmUrl), "text has confirm url");
  assert.ok(e.textContent.includes(unsubscribeUrl), "text has unsubscribe url");
});

test("falls back to a neutral greeting for an empty name", () => {
  const e = buildConfirmationEmail({ name: "  ", confirmUrl, unsubscribeUrl });
  // Both bodies, byte-for-byte: the greeting is built once and only escaped for
  // HTML, so the two can't drift apart.
  assert.ok(e.htmlContent.includes("Szia Kedves Olvasó!"));
  assert.ok(e.textContent.includes("Szia Kedves Olvasó!"));
});

test("greets by name identically in both bodies", () => {
  const e = buildConfirmationEmail({ name: "  Anna  ", confirmUrl, unsubscribeUrl });
  assert.ok(e.htmlContent.includes("Szia Anna!"), "trimmed in HTML");
  assert.ok(e.textContent.includes("Szia Anna!"), "and the same in text");
});

test("escapes HTML in the name (no injection)", () => {
  const e = buildConfirmationEmail({
    name: '<script>alert(1)</script>',
    confirmUrl,
    unsubscribeUrl,
  });
  assert.ok(!e.htmlContent.includes("<script>"), "raw script tag must not appear");
  assert.ok(e.htmlContent.includes("&lt;script&gt;"), "name is escaped");
});

// --- legacy re-permission invite ---

const legacyArgs = {
  resubscribeUrl: "https://youproof.org/api/v1/newsletter/legacy/abc/resubscribe?token=t1",
  declineUrl: "https://youproof.org/api/v1/newsletter/legacy/abc/decline?token=t1",
  privacyUrl: "https://youproof.org/hu/adatkezeles",
  senderName: "Moldvai Dávid",
  retentionDays: 90,
};

test("the legacy invite carries both actions and the privacy policy", () => {
  const e = buildLegacyInviteEmail(legacyArgs);

  for (const part of [e.htmlContent, e.textContent]) {
    assert.ok(part.includes(legacyArgs.resubscribeUrl), "resubscribe link present");
    assert.ok(part.includes(legacyArgs.declineUrl), "decline link present");
    assert.ok(part.includes(legacyArgs.privacyUrl), "privacy policy linked");
    assert.ok(part.includes("Moldvai Dávid"), "personal sign-off");
  }
});

test("the legacy invite states that doing nothing is enough, and names the window", () => {
  const e = buildLegacyInviteEmail(legacyArgs);

  // This sentence is what makes the campaign's opt-out honest: the recipient
  // does not have to act to be forgotten.
  assert.match(e.textContent, /nem kell tenned semmit/);
  assert.match(e.htmlContent, /nem kell tenned semmit/);
  assert.match(e.textContent, /90 napon belül/);
});

test("the retention promise in the copy follows the constant it is passed", () => {
  const e = buildLegacyInviteEmail({ ...legacyArgs, retentionDays: 30 });

  assert.match(e.textContent, /30 napon belül/);
  assert.ok(!e.textContent.includes("90 napon"), "no hardcoded period to drift");
});

test("the legacy invite greets without a name and carries no subscriber unsubscribe link", () => {
  const e = buildLegacyInviteEmail(legacyArgs);

  // There is no name on a legacy address; "Szia Kedves Olvasó!" would be wrong
  // Hungarian, so the greeting is bare.
  assert.match(e.textContent, /^Szia!/);
  assert.ok(!e.textContent.includes("Kedves Olvasó"));
  // These people are not subscribers yet — there is nothing to unsubscribe from.
  assert.ok(!e.textContent.includes("/unsubscribe"));
  assert.ok(!e.htmlContent.includes("/unsubscribe"));
});

test("escapes the interpolated URLs and sender name", () => {
  const e = buildLegacyInviteEmail({
    ...legacyArgs,
    senderName: '<script>alert(1)</script>',
  });

  assert.ok(!e.htmlContent.includes("<script>"));
  assert.ok(e.htmlContent.includes("&lt;script&gt;"));
});

test("the legacy invite's two bodies say the same things", () => {
  const e = buildLegacyInviteEmail(legacyArgs);

  // Derived from the text body rather than a hardcoded sentence list, so
  // rewording the copy doesn't break the test — only the two bodies actually
  // diverging does. URLs are stripped from both sides because the HTML puts them
  // in href/anchor position (and behind a button) rather than inline mid-sentence.
  const strip = (s) =>
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const html = strip(e.htmlContent);
  const prose = e.textContent
    .split("\n")
    .map(strip)
    .filter((line) => line.length > 0);

  assert.ok(prose.length >= 6, "sanity: the text body still has its paragraphs");
  for (const line of prose) {
    assert.ok(html.includes(line), `HTML is missing this line of the text body:\n  ${line}`);
  }

  // Both name the old and the new site, from the shared constants.
  for (const part of [e.htmlContent, e.textContent]) {
    assert.ok(part.includes("https://youproof.hu"));
    assert.ok(part.includes("https://youproof.org"));
  }
});
