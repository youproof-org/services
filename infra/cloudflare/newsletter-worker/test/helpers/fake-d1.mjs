// In-memory fake D1 that interprets the specific statements src/lib/db.ts issues.
// Coupled to those query strings on purpose — it exists to unit-test our own SQL,
// not to be a general SQLite. Shared by db.test.mjs and webhook.test.mjs.

const INSERT_COLS = [
  "id", "email", "name", "locale", "status", "source_page",
  "source_form_instance", "confirm_token", "unsubscribe_token",
  "privacy_content_sha", "brevo_message_id", "subscribed_at", "confirmed_at",
  "unsubscribed_at", "created_at", "updated_at",
];

export class FakeD1 {
  constructor() {
    this.rows = new Map(); // id -> subscription row
    this.suppressed = new Set(); // email membership
    this.suppressionDetails = new Map(); // email -> { reason, first_seen_at, last_event_at }
    this.attempts = [];
    this.events = []; // email_events rows
    this._eventKeys = new Set(); // `${message_id}||${event}` for dedup
  }
  prepare(sql) {
    return new Stmt(this, sql);
  }
  _byEmail(email) {
    for (const r of this.rows.values()) if (r.email === email) return r;
    return null;
  }
  _rowsByEmail(email) {
    return [...this.rows.values()].filter((r) => r.email === email);
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
      const [value, since] = args;
      const field = sql.includes("WHERE email =") ? "email" : "client_ip";
      const n = db.attempts.filter(
        (a) => a[field] === value && a.attempted_at >= since,
      ).length;
      return { n };
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
  async all() {
    const { sql, args, db } = this;
    if (sql.includes("brevo_synced_at IS NULL")) {
      const limit = args[0];
      const rows = [...db.rows.values()]
        .filter((r) => r.status === "confirmed" && r.brevo_synced_at == null)
        // Mirror the query's ORDER BY brevo_sync_attempts ASC, subscribed_at ASC.
        .sort(
          (a, b) =>
            (a.brevo_sync_attempts ?? 0) - (b.brevo_sync_attempts ?? 0) ||
            String(a.subscribed_at).localeCompare(String(b.subscribed_at)),
        )
        .slice(0, limit)
        .map((r) => ({ ...r }));
      return { results: rows };
    }
    return { results: [] };
  }
  async run() {
    const { sql, args, db } = this;

    if (sql.startsWith("INSERT INTO subscriptions")) {
      const row = {};
      INSERT_COLS.forEach((c, i) => (row[c] = args[i]));
      // Columns with table defaults not present in the INSERT statement.
      row.brevo_synced_at = null;
      row.brevo_sync_attempts = 0;
      row.brevo_sync_last_error = null;
      row.brevo_alerted_at = null;
      db.rows.set(row.id, row);
      return;
    }
    if (sql.startsWith("INSERT OR IGNORE INTO email_events")) {
      const [id, email, messageId, event, reason, raw, occurredAt, receivedAt] = args;
      // Real SQLite treats NULL as DISTINCT in a UNIQUE index, so INSERT OR
      // IGNORE only dedups rows with a non-null message_id — null-message events
      // (e.g. some list-level unsubscribes) are always inserted. Model that.
      if (messageId != null) {
        const key = `${messageId}||${event}`;
        if (db._eventKeys.has(key)) return;
        db._eventKeys.add(key);
      }
      db.events.push({ id, email, message_id: messageId, event, reason, raw, occurred_at: occurredAt, received_at: receivedAt });
      return;
    }
    if (sql.startsWith("INSERT INTO email_suppressions")) {
      const [email, reason, firstSeen, lastEvent] = args;
      db.suppressed.add(email);
      const existing = db.suppressionDetails.get(email);
      db.suppressionDetails.set(email, {
        reason,
        first_seen_at: existing?.first_seen_at ?? firstSeen,
        last_event_at: lastEvent,
      });
      return;
    }
    if (sql.includes("INSERT INTO subscribe_attempts")) {
      db.attempts.push({ id: args[0], email: args[1], client_ip: args[2], attempted_at: args[3] });
      return;
    }
    if (sql.startsWith("DELETE FROM subscribe_attempts")) {
      const [cutoff] = args;
      db.attempts = db.attempts.filter((a) => a.attempted_at >= cutoff);
      return;
    }
    if (sql.includes("SET status = 'blocked'")) {
      const [now, email] = args;
      for (const r of db._rowsByEmail(email)) {
        if (r.status !== "blocked") {
          r.status = "blocked";
          r.updated_at = now;
        }
      }
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
      if (sql.includes("WHERE email")) {
        const [now, , email] = args;
        for (const r of db._rowsByEmail(email)) {
          if (r.status !== "blocked" && r.status !== "unsubscribed") {
            r.status = "unsubscribed";
            r.unsubscribed_at = r.unsubscribed_at ?? now;
            r.updated_at = now;
          }
        }
        return;
      }
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
      const [name, locale, sourcePage, formInstance, confirmToken, unsubToken, sha, subscribedAt, updatedAt, id] = args;
      const r = db.rows.get(id);
      Object.assign(r, {
        name, locale, status: "pending", source_page: sourcePage,
        source_form_instance: formInstance, confirm_token: confirmToken,
        unsubscribe_token: unsubToken, privacy_content_sha: sha,
        brevo_message_id: null, subscribed_at: subscribedAt,
        confirmed_at: null, unsubscribed_at: null, updated_at: updatedAt,
        brevo_synced_at: null, brevo_sync_attempts: 0,
        brevo_sync_last_error: null, brevo_alerted_at: null,
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
    if (sql.includes("brevo_synced_at = ?")) {
      const [syncedAt, now, id] = args;
      const r = db.rows.get(id);
      r.brevo_synced_at = syncedAt;
      r.brevo_sync_last_error = null;
      r.updated_at = now;
      return;
    }
    if (sql.includes("brevo_sync_attempts = brevo_sync_attempts + 1")) {
      const [error, now, id] = args;
      const r = db.rows.get(id);
      r.brevo_sync_attempts = (r.brevo_sync_attempts ?? 0) + 1;
      r.brevo_sync_last_error = error;
      r.updated_at = now;
      return;
    }
    if (sql.includes("brevo_alerted_at = ?")) {
      const [alertedAt, now, id] = args;
      const r = db.rows.get(id);
      r.brevo_alerted_at = alertedAt;
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

export function makeDeps() {
  let n = 0;
  return {
    now: () => "2026-07-24T00:00:00.000Z",
    newId: () => `id-${++n}`,
    newToken: () => `tok-${++n}`,
  };
}
