import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedOrigin } from "../src/lib/origin.ts";

const ALLOWED = "https://youproof.org,https://www.youproof.org";

function req(headers) {
  return new Request("https://youproof.org/api/v1/newsletter/subscriptions", {
    method: "POST",
    headers,
  });
}

test("accepts an allowed Origin", () => {
  assert.equal(isAllowedOrigin(req({ origin: "https://youproof.org" }), ALLOWED), true);
  assert.equal(isAllowedOrigin(req({ origin: "https://www.youproof.org" }), ALLOWED), true);
});

test("rejects a foreign Origin", () => {
  assert.equal(isAllowedOrigin(req({ origin: "https://evil.example" }), ALLOWED), false);
});

test("falls back to Referer origin when Origin is absent", () => {
  assert.equal(
    isAllowedOrigin(req({ referer: "https://youproof.org/hu/cikkek/x" }), ALLOWED),
    true,
  );
  assert.equal(
    isAllowedOrigin(req({ referer: "https://evil.example/x" }), ALLOWED),
    false,
  );
});

test("rejects when neither Origin nor Referer is present", () => {
  assert.equal(isAllowedOrigin(req({}), ALLOWED), false);
});

test("rejects everything when the allowlist is empty", () => {
  assert.equal(isAllowedOrigin(req({ origin: "https://youproof.org" }), ""), false);
});

test("tolerates trailing slashes in the allowlist", () => {
  assert.equal(
    isAllowedOrigin(req({ origin: "https://youproof.org" }), "https://youproof.org/"),
    true,
  );
});
