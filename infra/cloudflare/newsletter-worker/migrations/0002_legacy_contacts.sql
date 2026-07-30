-- One-shot legacy re-permission campaign. Addresses imported by hand
-- from the defunct site's newsletter, where consent is not evidenced. Each gets
-- EXACTLY ONE email offering re-subscription to the new list; whatever has not
-- converted is erased 90 days after import.
--
-- Runbook (import SQL, canary, pause/resume, decommission):
--   docs/newsletter-legacy-repermission.md
--
-- Deliberately a separate table, not a status on `subscriptions`: these rows are
-- NOT subscribers and must be unreachable from every subscription code path,
-- Brevo list sync and subscriber count. Conversion creates a normal
-- `subscriptions` row through the ordinary upsert. The whole table is dropped
-- once the campaign is done.

CREATE TABLE legacy_contacts (
  -- Defaulted in SQL so the dashboard paste is a bare list of addresses.
  -- NOT NULL is load-bearing: SQLite permits NULL in a non-INTEGER PRIMARY KEY,
  -- so without it a minimal INSERT silently yields null ids. 32 hex chars rather
  -- than the dashed UUIDs newId() makes — separate table, never joined on.
  id            TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  -- Lowercased, matching subscriptions.email (see validate.normalizeEmail). The
  -- CHECK is not cosmetic: an uppercase row would evade every dedupe against
  -- subscriptions/email_suppressions and get mailed anyway. Fail loudly instead.
  email         TEXT NOT NULL UNIQUE,
  locale        TEXT NOT NULL DEFAULT 'hu',
  -- 'pending'   → imported, not yet mailed (the send worklist)
  -- 'paused'    → operator brake, skipped by the worklist
  -- 'invited'   → the single invite has been sent
  -- 'converted' → became a confirmed subscriber; kept only so a second click is
  --               idempotent, then purged on the normal retention sweep
  -- 'declined'  → opted out
  -- 'failed'    → permanent send failure, needs a human
  status        TEXT NOT NULL DEFAULT 'pending',
  -- Minted at send time and embedded in the invite link. Same opaque-capability
  -- contract as confirm_token/unsubscribe_token (see lib/tokens.ts): unguessable,
  -- compared in constant time, never signed. Nulled on convert/decline, which is
  -- what makes the link single-use.
  invite_token  TEXT UNIQUE,
  imported_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  invited_at    TEXT,
  responded_at  TEXT,           -- converted or declined at
  send_attempts INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  brevo_message_id TEXT,        -- webhook join key, as on subscriptions
  subscription_id  TEXT,        -- the subscriptions.id we created, for forensics
  CHECK (status IN ('pending', 'paused', 'invited', 'converted', 'declined', 'failed')),
  CHECK (email = lower(trim(email)))
);

-- The send worklist: pending rows under the attempt cap, fewest attempts first
-- (same rationale as idx_subscriptions_unsynced — a few permanently-failing rows
-- must not starve fresh ones out of the LIMIT-bounded batch).
CREATE INDEX idx_legacy_contacts_sendable
  ON legacy_contacts (status, send_attempts, imported_at);
-- The 90-day retention sweep, which keys on import time rather than send time.
CREATE INDEX idx_legacy_contacts_imported ON legacy_contacts (imported_at);
