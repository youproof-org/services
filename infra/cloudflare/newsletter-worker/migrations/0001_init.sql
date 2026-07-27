-- Newsletter subscription schema (D1). Applied with:
--   wrangler d1 migrations apply <db> [--local | --remote]
-- Terraform creates the database; wrangler owns the schema (see docs/newsletter.md).
--
-- Datetimes are stored as ISO-8601 UTC strings (TEXT). Ids are app-generated
-- UUIDv4 strings. Email is normalized to lowercase and is the upsert key.

-- One row per (email) subscription. Soft-deleted on unsubscribe (status kept,
-- row retained) so delivery/bounce/spam history stays attached.
CREATE TABLE subscriptions (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  locale              TEXT NOT NULL,
  -- 'pending' | 'confirmed' | 'unsubscribed' | 'blocked'
  status              TEXT NOT NULL,
  -- Originating form: page path + which instance on that page (pre-footer /
  -- mid-content), so the confirmation link can return the user to the exact spot.
  source_page         TEXT,
  source_form_instance TEXT,
  -- Unguessable single-purpose tokens embedded in email links.
  confirm_token       TEXT UNIQUE,
  unsubscribe_token   TEXT NOT NULL UNIQUE,
  -- youproof-org/content commit SHA whose privacy policy was accepted.
  privacy_content_sha TEXT,
  -- Brevo transactional messageId of the confirmation send (webhook join key).
  brevo_message_id    TEXT,
  subscribed_at       TEXT NOT NULL,
  confirmed_at        TEXT,
  unsubscribed_at     TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  -- Brevo list-sync reconciliation markers. Confirmation is recorded in D1 (the
  -- source of truth) even if the Brevo list-add fails; a scheduled cron retries
  -- confirmed-but-unsynced rows and emails an admin once a row keeps failing.
  brevo_synced_at       TEXT,           -- null until the contact is in the Brevo list
  brevo_sync_attempts   INTEGER NOT NULL DEFAULT 0,
  brevo_sync_last_error TEXT,
  brevo_alerted_at      TEXT,           -- set once alerted, so we don't re-alert
  CHECK (status IN ('pending', 'confirmed', 'unsubscribed', 'blocked'))
);

CREATE INDEX idx_subscriptions_status ON subscriptions (status);
-- The reconciliation query: confirmed rows not yet synced to Brevo.
CREATE INDEX idx_subscriptions_unsynced ON subscriptions (status, brevo_synced_at);

-- Bounce/spam suppression, keyed by EMAIL and independent of any subscription
-- row, so it survives soft-deletes/replacements. Presence here blocks
-- resubscription and marks the email 'blocked'. Never sent to again.
CREATE TABLE email_suppressions (
  email          TEXT PRIMARY KEY,
  reason         TEXT NOT NULL, -- 'bounce' | 'spam'
  first_seen_at  TEXT NOT NULL,
  last_event_at  TEXT NOT NULL,
  CHECK (reason IN ('bounce', 'spam'))
);

-- Append-only audit log of Brevo webhook events (delivery/bounce/spam/open/…).
-- (message_id, event) is unique so webhook delivery is idempotent.
CREATE TABLE email_events (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  message_id   TEXT,
  event        TEXT NOT NULL,
  reason       TEXT,
  raw          TEXT,          -- full JSON payload for forensics
  occurred_at  TEXT,          -- Brevo ts_event (UTC), when available
  received_at  TEXT NOT NULL  -- when we recorded it
);

CREATE UNIQUE INDEX idx_email_events_dedup ON email_events (message_id, event);
CREATE INDEX idx_email_events_email ON email_events (email);

-- Rate-limit ledger for the subscribe endpoint (per email + client IP). Rows are
-- pruned by timestamp window at query time. Keeps abuse protection stateful
-- across worker isolates (in-isolate counters are unreliable).
CREATE TABLE subscribe_attempts (
  id          TEXT PRIMARY KEY,
  email       TEXT,
  client_ip   TEXT,
  attempted_at TEXT NOT NULL
);

CREATE INDEX idx_subscribe_attempts_email ON subscribe_attempts (email, attempted_at);
CREATE INDEX idx_subscribe_attempts_ip ON subscribe_attempts (client_ip, attempted_at);
