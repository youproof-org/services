// validate.ts coverage.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeEmail,
  isValidEmail,
  isSafeRelativePath,
  validateSubscribeBody,
} from "../src/lib/validate.ts";

test("normalizeEmail trims + lowercases", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("isValidEmail", () => {
  for (const ok of ["a@b.co", "user.name@sub.example.hu"]) {
    assert.equal(isValidEmail(ok), true, ok);
  }
  for (const bad of ["", "no-at", "a@b", "a@@b.co", "a b@c.co", "a@b .co"]) {
    assert.equal(isValidEmail(bad), false, bad);
  }
});

test("isSafeRelativePath blocks non-relative / open-redirect shapes", () => {
  assert.equal(isSafeRelativePath("/hu/konyvek/x"), true);
  assert.equal(isSafeRelativePath("//evil.com"), false);
  assert.equal(isSafeRelativePath("https://evil.com"), false);
  assert.equal(isSafeRelativePath("hu/x"), false);
  assert.equal(isSafeRelativePath("/x\\y"), false);
  assert.equal(isSafeRelativePath(""), false);
});

const validBody = {
  name: "Anna",
  email: "Anna@Example.com",
  locale: "hu",
  privacyAccepted: true,
  sourcePage: "/hu/konyvek/algebra/fejezetek/vektorok",
  sourceFormInstance: "/hu/konyvek/algebra/fejezetek/vektorok#pre-footer",
  turnstileToken: "tok",
};

test("validateSubscribeBody accepts + normalizes a valid body", () => {
  const r = validateSubscribeBody(validBody);
  assert.equal(r.ok, true);
  assert.equal(r.value.email, "anna@example.com", "email normalized");
  assert.equal(r.value.name, "Anna");
});

test("validateSubscribeBody flags each rule", () => {
  const cases = [
    [{ ...validBody, name: "  " }, "name_required"],
    [{ ...validBody, email: "nope" }, "email_invalid"],
    [{ ...validBody, privacyAccepted: false }, "privacy_not_accepted"],
    [{ ...validBody, locale: "" }, "locale_invalid"],
    [{ ...validBody, sourcePage: "//x" }, "source_page_invalid"],
    [{ ...validBody, sourceFormInstance: "" }, "source_form_instance_invalid"],
    [{ ...validBody, turnstileToken: "" }, "turnstile_missing"],
  ];
  for (const [body, code] of cases) {
    const r = validateSubscribeBody(body);
    assert.equal(r.ok, false, `expected invalid for ${code}`);
    assert.ok(r.errors.includes(code), `expected ${code} in ${r.errors}`);
  }
});

test("validateSubscribeBody handles non-object input", () => {
  for (const junk of [null, undefined, "str", 42, []]) {
    const r = validateSubscribeBody(junk);
    assert.equal(r.ok, false);
  }
});
