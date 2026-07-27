// tokens.ts coverage. Run: `pnpm --filter @youproof.org/newsletter-worker test`
// (node --import tsx --test). TS source is loaded via the tsx loader.

import assert from "node:assert/strict";
import { test } from "node:test";
import { newId, newToken, verifyToken } from "../src/lib/tokens.ts";

test("newId returns distinct UUIDs", () => {
  const a = newId();
  const b = newId();
  assert.match(a, /^[0-9a-f-]{36}$/);
  assert.notEqual(a, b);
});

test("newToken is URL-safe, high-entropy, and unique", () => {
  const t = newToken();
  assert.match(t, /^[A-Za-z0-9_-]+$/, "url-safe base64url, no padding");
  assert.ok(t.length >= 40, `expected >=40 chars, got ${t.length}`);
  const many = new Set(Array.from({ length: 100 }, () => newToken()));
  assert.equal(many.size, 100, "tokens must be unique");
});

test("verifyToken matches only exact equal strings", () => {
  const t = newToken();
  assert.equal(verifyToken(t, t), true);
  assert.equal(verifyToken(t, newToken()), false);
  assert.equal(verifyToken(t, t + "x"), false, "length mismatch fails");
  assert.equal(verifyToken(t.slice(0, -1), t), false);
});

test("verifyToken rejects null/empty inputs", () => {
  assert.equal(verifyToken(null, "x"), false);
  assert.equal(verifyToken("x", null), false);
  assert.equal(verifyToken("", ""), false);
  assert.equal(verifyToken(null, null), false);
});
