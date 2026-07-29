import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConfirmationEmail } from "../src/lib/email.ts";

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
  assert.ok(e.htmlContent.includes("Kedves Olvasó"));
  assert.ok(e.textContent.includes("Kedves Olvasó"));
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
