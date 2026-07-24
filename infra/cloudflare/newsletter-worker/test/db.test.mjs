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

const INSERT_COLS = [
  "id", "email", "name", "locale", "status", "source_page",
  "source_form_instance", "confirm_token", "unsubscribe_token",
  "privacy_content_sha", "brevo_message_id", "subscribed_at", "confirmed_at",
  "unsubscribed_at", "created_at", "updated_at",
];

class FakeD1 {
  constructor() {
    this.rows = new Map(); // id -> row
    this.suppressed = new Set(); // email
    this.attempts = [];
  }
  prepare(sql) {
    return new Stmt(this, sql);
  }
  _byEmail(email) {
    for (const r of this.rows.values()) if (r.email === email) return r;
    return null;
  }
}

class Stmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async first() {
    const { sql, args, db } = this;
    if (sql.includes("FROM email_suppressions WHERE email")) {
      return db.suppressed.has(args[0]) ? { email: args[0] } : null;
    }
    if (sql.includes("COUNT(*) AS n FROM subscribe_attempts")) {
      return { n: db.attempts.length };
    }
    if (sql.includes("FROM subscriptions WHERE email")) {
      const r = db._byEmail(args[0]);
      return r ? { ...r } : null;
    }
    if (sql.includes("FROM subscriptions WHERE id")) {
      const r = db.rows.get(args[0]);
      return r ? { ...r } : null;
    }
    throw new Error(`FakeD1.first: unhandled SQL: ${sql}`);
  }
  async run() {
    const { sql, args, db } = this;
    if (sql.startsWith("INSERT INTO subscriptions")) {
      const row = {};
      INSERT_COLS.forEach((c, i) => (row[c] = args[i]));
      db.rows.set(row.id, row);
      return;
    }
    if (sql.includes("INSERT INTO subscribe_attempts")) {
      db.attempts.push({ id: args[0], email: args[1], client_ip: args[2], attempted_at: args[3] });
      return;
    }
    if (sql.includes("status = 'confirmed'")) {
      const [now, , id] = args;
      const r = db.rows.get(id);
      if (r && r.status === "pending") {
        r.status = "confirmed";
        r.confirmed_at = r.confirmed_at ?? now;
        r.updated_at = now;
      }
      return;
    }
    if (sql.includes("status = 'unsubscribed'")) {
      const [now, , id] = args;
      const r = db.rows.get(id);
      if (r && r.status !== "blocked") {
        r.status = "unsubscribed";
        r.unsubscribed_at = r.unsubscribed_at ?? now;
        r.updated_at = now;
      }
      return;
    }
    if (sql.includes("confirm_token = ?, unsubscribe_token = ?")) {
      // reset-to-pending
      const [name, locale, sourcePage, formInstance, confirmToken, unsubToken, sha, subscribedAt, updatedAt, id] = args;
      const r = db.rows.get(id);
      Object.assign(r, {
        name, locale, status: "pending", source_page: sourcePage,
        source_form_instance: formInstance, confirm_token: confirmToken,
        unsubscribe_token: unsubToken, privacy_content_sha: sha,
        brevo_message_id: null, subscribed_at: subscribedAt,
        confirmed_at: null, unsubscribed_at: null, updated_at: updatedAt,
      });
      return;
    }
    if (sql.includes("brevo_message_id = ?")) {
      const [messageId, now, id] = args;
      const r = db.rows.get(id);
      r.brevo_message_id = messageId;
      r.updated_at = now;
      return;
    }
    if (sql.startsWith("UPDATE subscriptions SET name = ?, updated_at = ? WHERE id")) {
      const [name, now, id] = args;
      const r = db.rows.get(id);
      r.name = name;
      r.updated_at = now;
      return;
    }
    throw new Error(`FakeD1.run: unhandled SQL: ${sql}`);
  }
}

function makeDeps() {
  let n = 0;
  return {
    now: () => "2026-07-24T00:00:00.000Z",
    newId: () => `id-${++n}`,
    newToken: () => `tok-${++n}`,
  };
}

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
