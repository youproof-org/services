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
    this.legacy = new Map(); // id -> legacy_contacts row
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
  /**
   * Seed a legacy_contacts row. Deliberately NOT an SQL insert path: production
   * rows are created by hand-written SQL pasted into the D1 dashboard, so there
   * is no worker code path to exercise here.
   */
  seedLegacy(row) {
    const full = {
      id: `lc-${this.legacy.size + 1}`,
      locale: "hu",
      status: "pending",
      invite_token: null,
      imported_at: "2026-07-01T00:00:00.000Z",
      invited_at: null,
      responded_at: null,
      send_attempts: 0,
      last_error: null,
      brevo_message_id: null,
      subscription_id: null,
      ...row,
    };
    this.legacy.set(full.id, full);
    return full;
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
    // MUST come first: legacy SQL contains substrings the subscription branches
    // below match on (e.g. "brevo_message_id = ?"), so a later check would
    // silently run the wrong branch against the wrong table.
    if (sql.includes("legacy_contacts")) return this._firstLegacy();
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
    if (sql.includes("legacy_contacts")) return this._allLegacy();
    if (sql.includes("brevo_synced_at IS NULL")) {
      const limit = args[0];
      const rows = [...db.rows.values()]
        .filter(
          (r) =>
            (r.status === "confirmed" || r.status === "unsubscribed") &&
            r.brevo_synced_at == null,
        )
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
    if (sql.includes("status = 'unsubscribed' AND unsubscribed_at IS NOT NULL")) {
      const [cutoff, limit] = args;
      const rows = [...db.rows.values()]
        .filter(
          (r) =>
            r.status === "unsubscribed" &&
            r.unsubscribed_at != null &&
            r.unsubscribed_at < cutoff,
        )
        // Mirror the query's ORDER BY unsubscribed_at ASC.
        .sort((a, b) => String(a.unsubscribed_at).localeCompare(String(b.unsubscribed_at)))
        .slice(0, limit)
        .map((r) => ({ ...r }));
      return { results: rows };
    }
    // Same tripwire as first()/run(): an unrecognised query must fail loudly
    // rather than return an empty result set that reads as "nothing matched".
    throw new Error(`FakeD1.all: unhandled SQL: ${sql}`);
  }
  async run() {
    const { sql, args, db } = this;
    if (sql.includes("legacy_contacts")) return this._runLegacy();

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
    if (sql.startsWith("DELETE FROM email_events")) {
      const [cutoff] = args;
      db.events = db.events.filter((e) => e.received_at >= cutoff);
      return;
    }
    if (sql.startsWith("DELETE FROM subscriptions")) {
      const [id] = args;
      db.rows.delete(id);
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
      // our-endpoint unsubscribe (by id) also resets the Brevo-sync markers to
      // enqueue the blacklist propagation.
      const [now, , id] = args;
      const r = db.rows.get(id);
      if (r && r.status !== "blocked") {
        r.status = "unsubscribed";
        r.unsubscribed_at = r.unsubscribed_at ?? now;
        r.updated_at = now;
        r.brevo_synced_at = null;
        r.brevo_sync_attempts = 0;
        r.brevo_sync_last_error = null;
        r.brevo_alerted_at = null;
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

  // --- legacy re-permission campaign ---
  // Split out so the whole campaign can be deleted in one piece later.

  async _firstLegacy() {
    const { sql, args, db } = this;
    if (sql.includes("SELECT * FROM legacy_contacts WHERE id")) {
      const r = db.legacy.get(args[0]);
      return r ? { ...r } : null;
    }
    throw new Error(`FakeD1.first: unhandled legacy SQL: ${sql}`);
  }

  async _allLegacy() {
    const { sql, args, db } = this;
    if (sql.includes("status = 'pending' AND send_attempts <")) {
      const [maxAttempts, limit] = args;
      const rows = [...db.legacy.values()]
        .filter(
          (r) =>
            r.status === "pending" &&
            r.send_attempts < maxAttempts &&
            // Mirror the two NOT EXISTS clauses.
            db._byEmail(r.email) == null &&
            !db.suppressed.has(r.email),
        )
        // Mirror ORDER BY send_attempts ASC, imported_at ASC.
        .sort(
          (a, b) =>
            (a.send_attempts ?? 0) - (b.send_attempts ?? 0) ||
            String(a.imported_at).localeCompare(String(b.imported_at)),
        )
        .slice(0, limit)
        .map((r) => ({ ...r }));
      return { results: rows };
    }
    if (sql.includes("WHERE imported_at <")) {
      const [cutoff, limit] = args;
      const rows = [...db.legacy.values()]
        .filter((r) => r.imported_at < cutoff)
        .sort((a, b) => String(a.imported_at).localeCompare(String(b.imported_at)))
        .slice(0, limit)
        .map((r) => ({ ...r }));
      return { results: rows };
    }
    throw new Error(`FakeD1.all: unhandled legacy SQL: ${sql}`);
  }

  async _runLegacy() {
    const { sql, args, db } = this;

    if (sql.startsWith("DELETE FROM legacy_contacts")) {
      db.legacy.delete(args[0]);
      return { meta: { changes: 1 } };
    }
    // The compare-and-swap claim. This is the one branch whose meta.changes is
    // load-bearing: claimLegacyInvite reads it to decide whether it won the row,
    // so returning undefined here would silently stop every invite.
    if (sql.includes("SET status = 'invited'")) {
      const [now, token, id] = args;
      const r = db.legacy.get(id);
      if (!r || r.status !== "pending") return { meta: { changes: 0 } };
      Object.assign(r, {
        status: "invited",
        invited_at: now,
        invite_token: token,
        send_attempts: (r.send_attempts ?? 0) + 1,
        last_error: null,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status = 'pending'")) {
      const [error, id] = args;
      const r = db.legacy.get(id);
      Object.assign(r, {
        status: "pending",
        invited_at: null,
        invite_token: null,
        last_error: error,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status = 'failed'")) {
      const [error, id] = args;
      const r = db.legacy.get(id);
      Object.assign(r, { status: "failed", invite_token: null, last_error: error });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status = 'converted'")) {
      const [now, subscriptionId, id] = args;
      const r = db.legacy.get(id);
      Object.assign(r, {
        status: "converted",
        responded_at: r.responded_at ?? now,
        subscription_id: subscriptionId,
        invite_token: null,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET status = 'declined'")) {
      const [now, id] = args;
      const r = db.legacy.get(id);
      Object.assign(r, {
        status: "declined",
        responded_at: r.responded_at ?? now,
        invite_token: null,
      });
      return { meta: { changes: 1 } };
    }
    if (sql.includes("SET brevo_message_id = ?")) {
      const [messageId, id] = args;
      db.legacy.get(id).brevo_message_id = messageId;
      return { meta: { changes: 1 } };
    }
    throw new Error(`FakeD1.run: unhandled legacy SQL: ${sql}`);
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
