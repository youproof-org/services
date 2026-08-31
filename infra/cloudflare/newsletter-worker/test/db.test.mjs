// db.ts coverage: subscribeUpsert branching + status transitions, exercised
// against an in-memory fake D1 (interprets the specific statements db.ts issues)
// with injected deterministic deps.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  subscribeUpsert,
  confirmSubscription,
  unsubscribeSubscription,
  isSuppressed,
  getSubscriptionByEmail,
} from "../src/lib/db.ts";
import { FakeD1, FIXTURE_NOW, makeDeps } from "./helpers/fake-d1.mjs";

const input = {
  name: "Anna",
  email: "anna@example.com",
  locale: "hu",
  privacyAccepted: true,
  sourcePage: "/hu/cikkek/x",
  sourceFormInstance: "/hu/cikkek/x#pre-footer",
  turnstileToken: "t",
};

test("created: fresh pending subscription with tokens + content SHA", async () => {
  const db = new FakeD1();
  const r = await subscribeUpsert(db, input, "sha123", makeDeps());
  assert.equal(r.kind, "created");
  assert.equal(r.subscription.status, "pending");
  assert.equal(r.subscription.privacy_content_sha, "sha123");
  assert.ok(r.subscription.confirm_token, "has confirm token");
  assert.ok(r.subscription.unsubscribe_token, "has unsubscribe token");
  const stored = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(stored.status, "pending");
});

test("blocked: suppressed email is rejected, no row created", async () => {
  const db = new FakeD1();
  db.suppressed.add("anna@example.com");
  const r = await subscribeUpsert(db, input, "sha", makeDeps());
  assert.equal(r.kind, "blocked");
  assert.equal(await getSubscriptionByEmail(db, "anna@example.com"), null);
});

test("updated: active pending updates name in place, keeps status + token", async () => {
  const db = new FakeD1();
  await subscribeUpsert(db, input, "sha", makeDeps());
  const before = await getSubscriptionByEmail(db, "anna@example.com");
  const r = await subscribeUpsert(db, { ...input, name: "Anna B" }, "sha", makeDeps());
  assert.equal(r.kind, "updated");
  assert.equal(r.subscription.status, "pending");
  const after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.name, "Anna B");
  assert.equal(after.confirm_token, before.confirm_token, "token unchanged on name update");
});

test("updated: confirmed subscription updates name, stays confirmed", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, "2026-07-24T01:00:00.000Z");
  const r = await subscribeUpsert(db, { ...input, name: "Anna C" }, "sha", makeDeps());
  assert.equal(r.kind, "updated");
  const after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.status, "confirmed");
  assert.equal(after.name, "Anna C");
});

test("resubscribed: unsubscribed (not suppressed) resets to fresh pending", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  const oldToken = c.subscription.confirm_token;
  await unsubscribeSubscription(db, c.subscription.id, "2026-07-24T01:00:00.000Z");
  const r = await subscribeUpsert(db, input, "sha2", makeDeps());
  assert.equal(r.kind, "resubscribed");
  const after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.status, "pending");
  assert.equal(after.confirmed_at, null);
  assert.equal(after.unsubscribed_at, null);
  assert.equal(after.privacy_content_sha, "sha2", "new consent snapshot");
  assert.notEqual(after.confirm_token, oldToken, "fresh confirm token");
});

test("blocked status short-circuits even without a suppression row", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  db.rows.get(c.subscription.id).status = "blocked";
  const r = await subscribeUpsert(db, input, "sha", makeDeps());
  assert.equal(r.kind, "blocked");
});

test("confirmSubscription only flips pending → confirmed (idempotent)", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await confirmSubscription(db, c.subscription.id, "t1");
  let after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.status, "confirmed");
  assert.equal(after.confirmed_at, "t1");
  await confirmSubscription(db, c.subscription.id, "t2"); // no-op
  after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.confirmed_at, "t1", "confirmed_at not overwritten");
});

test("unsubscribeSubscription soft-deletes but never touches blocked", async () => {
  const db = new FakeD1();
  const c = await subscribeUpsert(db, input, "sha", makeDeps());
  await unsubscribeSubscription(db, c.subscription.id, "u1");
  let after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.status, "unsubscribed");
  assert.equal(after.unsubscribed_at, "u1");

  db.rows.get(c.subscription.id).status = "blocked";
  await unsubscribeSubscription(db, c.subscription.id, "u2");
  after = await getSubscriptionByEmail(db, "anna@example.com");
  assert.equal(after.status, "blocked", "blocked is terminal");
});

test("isSuppressed reflects the suppression table", async () => {
  const db = new FakeD1();
  assert.equal(await isSuppressed(db, "x@y.z"), false);
  db.suppressed.add("x@y.z");
  assert.equal(await isSuppressed(db, "x@y.z"), true);
});

test("updated: re-submitting while pending restarts the confirmation window", async () => {
  const db = new FakeD1();
  const first = await subscribeUpsert(db, input, "sha", makeDeps());
  const id = first.subscription.id;
  // Pretend the original signup was 29 days ago and they never confirmed.
  db.rows.get(id).subscribed_at = "2026-06-01T00:00:00.000Z";

  const again = await subscribeUpsert(db, { ...input, name: "Anna B" }, "sha", makeDeps());

  // Re-submitting re-sends the confirmation mail, so the 30-day retention window
  // has to restart with it — otherwise the sweep could erase the row days after
  // we handed out a fresh link.
  assert.equal(again.kind, "updated");
  assert.equal(db.rows.get(id).subscribed_at, FIXTURE_NOW);
  assert.equal(again.subscription.subscribed_at, FIXTURE_NOW, "and the returned row agrees");
  assert.equal(db.rows.get(id).status, "pending");
  assert.equal(db.rows.get(id).name, "Anna B");
});

test("updated: a confirmed row's subscribed_at is never moved", async () => {
  const db = new FakeD1();
  const first = await subscribeUpsert(db, input, "sha", makeDeps());
  const id = first.subscription.id;
  await confirmSubscription(db, id, "2026-07-01T00:00:00.000Z");
  db.rows.get(id).subscribed_at = "2026-06-01T00:00:00.000Z";

  const again = await subscribeUpsert(db, { ...input, name: "Anna C" }, "sha", makeDeps());

  // That timestamp is the record of when they actually subscribed; moving it
  // would falsify the consent evidence.
  assert.equal(db.rows.get(id).subscribed_at, "2026-06-01T00:00:00.000Z");
  assert.equal(again.subscription.subscribed_at, "2026-06-01T00:00:00.000Z");
  assert.equal(db.rows.get(id).name, "Anna C", "the name still updates");
});
