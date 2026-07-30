# Legacy re-permission campaign (`legacy_contacts`)

A **one-shot** campaign to re-consent the email addresses inherited from the
previous youproof.org website's newsletter. Those addresses were collected years
ago, the newsletter they subscribed to no longer exists, and we cannot evidence a
valid current consent for them — so they cannot simply be dropped into
`subscriptions` and mailed.

Each address gets **exactly one** personal email offering to join the new
newsletter. Whoever accepts becomes a normal `confirmed` subscriber with a
recorded `privacy_content_sha`; everyone else is erased 90 days after import.
Nothing stays in limbo.

**This runs once and is then deleted.** It lives in its own migration, handler,
tests and doc precisely so the whole thing can be reverted in one piece — see
[Decommission](#decommission). The steady-state newsletter is documented
separately in [newsletter.md](newsletter.md).

## Architecture

- **Separate table, not a subscription status:** `legacy_contacts` (migration
  [`0002_legacy_contacts.sql`](../infra/cloudflare/newsletter-worker/migrations/0002_legacy_contacts.sql))
  keeps these rows unreachable from every subscription code path, Brevo list sync
  and subscriber count. A status on `subscriptions` would have meant auditing
  every existing query for a new exclusion; a separate table makes the safe thing
  the default. Conversion goes through the ordinary `subscribeUpsert`, so a
  converted contact is indistinguishable from someone who used the form.
- **States:** `pending` → `invited` → (`converted` | `declined`), plus `paused`
  (the operator brake) and `failed` (a send that retrying cannot fix).
- **Exactly one email, enforced not hoped for:** the cron takes each row with a
  compare-and-swap (`UPDATE … WHERE id = ? AND status = 'pending'`) *before*
  sending, so two overlapping ticks cannot both mail the same address. The trade
  is deliberate — a crash between claim and send silently drops that invite
  rather than risking a duplicate, which is the right way round for unsolicited
  mail to a stale list. Pinned by
  [`test/legacy-invite.test.mjs`](../infra/cloudflare/newsletter-worker/test/legacy-invite.test.mjs).
- **Deliberately slow:** 5 invites per 15-minute tick (~480/day). A years-old
  list has an unknown hard-bounce rate, and burning through it quickly would
  damage the sending domain's reputation for the *real* newsletter. The slow pace
  also leaves time for one day's bounce webhooks to land before the next day's
  sends.
- **The bounce feedback loop closes itself:** the send worklist excludes, in SQL,
  any address present in `subscriptions` or `email_suppressions`. The webhook
  handler already writes `email_suppressions` on a hard bounce or complaint, so
  yesterday's bounces suppress today's sends with no extra code — and an address
  that subscribed normally in the meantime is never cold-mailed.
- **Both GETs are side-effect free.** Every link here is mailed to an inbox, and
  inboxes are crawled: corporate mail-security scanners and Brevo's click tracker
  fetch links before a human sees them. So the resubscribe `GET` only validates
  and redirects, and the decline `GET` only opens a confirmation dialog. A
  prefetch is provably a no-op, and the invite survives for the real click.
  Pinned by the byte-identical-row assertion in
  [`test/legacy-resubscribe.test.mjs`](../infra/cloudflare/newsletter-worker/test/legacy-resubscribe.test.mjs).
  *This is also why there is no separate short-lived "claim" token handed to the
  browser: minting one would make the GET the one endpoint that writes, which is
  exactly the endpoint that gets crawled.*
- **The decline link needs POST.** A scanner following a one-click opt-out would
  decline on the recipient's behalf and we would never know. The visible "nem
  kérem" link therefore opens a confirmation dialog; the RFC 8058
  `List-Unsubscribe` header points at the `POST`, which is what the spec
  specifies anyway.
- **Marked, not deleted, on conversion:** a converted row is kept (token nulled)
  until the retention sweep, so a double-submit, a second tab or a back-button
  resubmit still answers "already done" instead of 404-ing immediately after the
  user saw a success message.
- **No feature flag:** an empty table sends nothing, so the code ships dark and
  the campaign starts when addresses are imported. Pausing is one `UPDATE` in the
  same D1 console the import happens in — faster than a redeploy.

### Endpoints

All under the existing Workers route `${site_host}/api/v1/newsletter/*`, so this
adds **no Terraform routing change**.

| Method | Path | Behaviour |
| --- | --- | --- |
| `GET` | `/legacy/{id}/resubscribe?token=` | Read-only. `302` → `/{locale}?newsletter_legacy=1&lid=…&ltok=…`, where the popup collects the name + consent. Bad token → `…?newsletter_legacy=invalid`. |
| `POST` | `/legacy/{id}/resubscribe` | `{token, name, privacyAccepted}` → creates a **confirmed** subscriber. `200` · `409` blocked · `400` · `404` · `403` · `429`. |
| `GET` | `/legacy/{id}/decline?token=` | Read-only. `302` → `…?newsletter_legacy=decline`, which asks for confirmation. |
| `POST`/`DELETE` | `/legacy/{id}/decline?token=` | The actual opt-out, and the `List-Unsubscribe` one-click target. |

There is **no second double opt-in** on conversion: the emailed link already
proved control of the mailbox, and the popup supplies the two things the legacy
list lacked — a name and an explicit privacy-policy acceptance.

## Import runbook

Addresses are pasted by hand into the **Cloudflare D1 console** (dashboard → D1 →
`youproof-newsletter-<env>` → Console). There is no import endpoint: a permanently
exposed bulk-write route is not worth building for something that runs once.

**Chunk at ~500 addresses** — D1's console has a statement-size ceiling.

Lowercase the list first; an uppercase address aborts the whole statement by
design (see the `CHECK` below):

```sh
tr 'A-Z' 'a-z' < list.csv | tr -d ' \r' | sort -u
```

### 1. Import

`id`, `status` and `imported_at` are all defaulted in SQL, so the paste is a bare
list of addresses and the CSV→SQL conversion is a mechanical `sed`.
`INSERT OR IGNORE` makes a re-paste and in-batch duplicates no-ops.

```sql
INSERT OR IGNORE INTO legacy_contacts (email) VALUES
  ('elso@example.com'),
  ('masodik@example.com');
```

### 2. Dedupe

A constant — paste it unchanged after every import. It drops anyone who is
already a subscriber or already suppressed, so they are never contacted.

```sql
DELETE FROM legacy_contacts
 WHERE status = 'pending'
   AND (EXISTS (SELECT 1 FROM subscriptions      s WHERE s.email = legacy_contacts.email)
     OR EXISTS (SELECT 1 FROM email_suppressions x WHERE x.email = legacy_contacts.email));
```

### 3. Sanity-check before the next tick

```sql
SELECT status, count(*) FROM legacy_contacts GROUP BY status;
SELECT count(*) FROM legacy_contacts WHERE id IS NULL OR imported_at IS NULL;  -- must be 0
```

> **Why the `CHECK (email = lower(trim(email)))` is not cosmetic:** `subscriptions`
> stores lowercased addresses, so an uppercase legacy row would slip past both
> `NOT EXISTS` dedupes above and get mailed anyway. A loud abort is much better
> than a silently mis-deduped list.
>
> **Why `id TEXT PRIMARY KEY NOT NULL`:** SQLite permits `NULL` in a non-INTEGER
> primary key. Without `NOT NULL`, a minimal `INSERT` would quietly produce
> null-id rows.

### Canary first

Import **~20 addresses**, let a few ticks run, then check what came back before
importing the rest:

```sql
SELECT event, count(*) FROM email_events
 WHERE email IN (SELECT email FROM legacy_contacts) GROUP BY event;
```

A 5–20% hard-bounce rate is normal for a years-old list; much worse than that and
you should stop rather than spend the sending domain's reputation on it. The
invites are tagged `newsletter-legacy-invite`, so Brevo's own dashboard can filter
this campaign's statistics away from the transactional mail.

### Pause, resume, abort

```sql
UPDATE legacy_contacts SET status='paused'  WHERE status='pending';  -- stop sending
UPDATE legacy_contacts SET status='pending' WHERE status='paused';   -- resume
DELETE FROM legacy_contacts WHERE status='pending';                  -- abandon the rest
```

> **Do not re-import this list.** After 90 days the rows are gone, so a re-import
> would re-mail people who already declined or ignored it. Nothing in the code can
> prevent that — the guard is this warning. (Writing declines into
> `email_suppressions` would prevent it, but that table's `CHECK` is
> `reason IN ('bounce','spam')`, and a suppression would also block someone from
> *voluntarily* subscribing later. Wrong trade.)

### Monitoring

```sql
-- Campaign progress.
SELECT status, count(*) FROM legacy_contacts GROUP BY status;

-- Sends that need a human (terminal Brevo 4xx).
SELECT email, send_attempts, last_error FROM legacy_contacts WHERE status='failed';

-- Claimed but never sent (crash between claim and send) — deliberately not
-- auto-retried, since "exactly one email" outranks "definitely one email".
SELECT * FROM legacy_contacts
 WHERE status='invited' AND brevo_message_id IS NULL
   AND invited_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour');
```

To retry a `failed` row after fixing the cause: `UPDATE legacy_contacts SET
status='pending', send_attempts=0 WHERE id='…'`.

## Retention

**90 days from `imported_at`** — the clock starts when the personal data entered
our systems, not when we got around to mailing it. Every row is erased at that
point regardless of status, including `converted` and `declined` ones (the
subscriber they became lives on in `subscriptions`).

The cron **purges before it sends**, which matters: a batch imported long ago and
never mailed satisfies both queries, and erasing it is the right answer — we
should not cold-contact an address we have been sitting on for three months.

Erasure is **D1 only** — unlike the subscription purge, this makes no Brevo call
at all, and that is deliberate. Do not add one:

- **There is nothing of ours there to erase.** These addresses never join the
  Brevo list; Brevo sees them solely as the recipient of one transactional
  message. The period published for them is about our own database, so nothing
  here should depend on a third party being reachable either.
- **A delete would be actively dangerous.** The query selects expired rows in
  *every* status, and a `converted` row is kept past conversion purely so a
  repeated click stays idempotent — its address is by then a confirmed
  subscriber sitting in the Brevo list. Deleting that contact would drop a live
  subscriber **permanently**: `brevo_synced_at` is already set, so the
  reconciliation would never notice they had gone, and the person would just
  stop receiving the newsletter. The same trap catches anyone who declined here,
  or was never mailed, and later signed up through the ordinary form — which is
  why filtering on the legacy status would not save you.

An earlier revision of this campaign did exactly that; `test/retention.test.mjs`
now pins "no legacy status triggers a Brevo delete" across the whole state space.

> **If you do want Brevo to hold nothing for these addresses.** Brevo does not
> create a contact when a transactional message is *sent*. It creates one when
> the recipient **opens or clicks**, identifying them into the
> `identified_contacts` list — which itself only exists once the account has an
> Automation workflow. Since this invite is designed to be clicked, that is a
> real (if narrow) exposure. Turn it off account-wide at **Settings →
> Automations → Transactional emails → Tracking → Anonymous email tracking →
> Yes**, which stops opens and clicks being linked to a contact. Brevo does not
> offer a way to disable open/click collection entirely. Note this is
> account-level, so it also removes per-contact open/click attribution from the
> ordinary confirmation emails.

Four things state this period and must move together:

| Where | What |
| --- | --- |
| `LEGACY_RETENTION_MS` in [`handlers/scheduled.ts`](../infra/cloudflare/newsletter-worker/src/handlers/scheduled.ts) | The enforced value |
| [`test/retention.test.mjs`](../infra/cloudflare/newsletter-worker/test/retention.test.mjs) | The tripwire (89 days kept / 91 purged) |
| The privacy policy's retention section (`content/pages/adatkezeles`, **sibling repo**) | The published promise |
| The invite email copy | The promise made to the recipient — read from the constant, so this one cannot drift |

> **Lawful basis.** Mailing an address whose consent is not evidenced needs a
> documented basis (typically *jogos érdek* for a single re-permission request)
> and a statement of where the address came from. That belongs in the privacy
> policy alongside the retention line, and is a legal call rather than a code
> change.

## Staging verification

1. Seed two rows via the console; confirm the cron mails **once** per address and
   never again on later ticks.
2. `curl` the invite `GET` twice and diff the row — it must be unchanged. This is
   the scanner-prefetch guarantee.
3. Click through → the popup opens on the homepage → submit → the address appears
   in `subscriptions` as `confirmed` with `privacy_content_sha` set, the legacy
   row is `converted`, and the contact is in the Brevo list.
4. Submit twice → one subscription, both responses `200`.
5. Gmail's one-click unsubscribe on the invite → row `declined`. Then
   `curl -X GET` the decline URL → it must **not** decline.
6. Seed a known-bad domain → hard bounce → `email_suppressions` row → the address
   disappears from the send worklist.
7. Backdate `imported_at` by 91 days → the next tick erases the row from D1 and
   makes **no** Brevo call. Do this once for a contact that converted: their
   subscription and their Brevo contact must both survive untouched.

## Decommission

Once `SELECT count(*) FROM legacy_contacts` is `0` and the last import is more
than 90 days old:

- `migrations/0003_drop_legacy_contacts.sql` → `DROP TABLE legacy_contacts;`
- Delete `src/handlers/legacy.ts`, the `legacy re-permission campaign` block in
  `src/lib/db.ts`, the router branch, the cron's `sendLegacyInvites` /
  `purgeExpiredLegacyContacts` and their constants, `buildLegacyInviteEmail`, the
  legacy URL helpers, `validateLegacyResubscribeBody`, the three
  `test/legacy-*.test.mjs` files, the legacy sections of `retention.test.mjs` /
  `email.test.mjs`, and the FakeD1 legacy branches.
- Revert `LegacyResubscribeDialog` and the `NewsletterLanding` param branch, but
  **keep** the extracted `NewsletterDialog` shell — it improves the existing code
  either way.
- Keep the `brevo.ts` widenings (optional `toName`/`tags`) and `BREVO_SENDER_NAME`
  — generally useful, not campaign-specific.
- Remove the retention line from the privacy policy, and replace this document
  with a short historical note.
