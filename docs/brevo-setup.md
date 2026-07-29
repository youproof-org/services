# Brevo setup (newsletter worker)

The newsletter worker ([`infra/cloudflare/newsletter-worker`](../infra/cloudflare/newsletter-worker))
uses **Brevo** only to *send* the double-opt-in email and to *report*
delivery/bounce/spam via a webhook; all subscription state lives in the worker's
D1 database. There is **no maintained Brevo Terraform provider**, so Brevo
configuration is provisioned out of band — normally by the idempotent
[`scripts/setup-brevo.mjs`](../infra/cloudflare/newsletter-worker/scripts/setup-brevo.mjs),
and by this runbook when manual intervention is needed (the script errors, a
partial state must be reconciled, or you're verifying what it did).

Run it **once per environment** (staging + production) — each environment points
at its own site host, list, and webhook.

## What must exist

| Thing | Where it's used | Notes |
| --- | --- | --- |
| **API key** | worker `BREVO_API_KEY` secret + the setup script | Brevo dashboard → **SMTP & API → API Keys**. |
| **Verified sender + domain auth** | `From:` of every send | Dashboard → **Senders, Domains & Dedicated IPs**. Authenticate the sending domain (SPF/DKIM) or deliverability suffers. **Manual only** — the script only *checks* it. |
| **`FNAME` contact attribute** | contact sync on confirm | Usually a Brevo default; the script ensures it. |
| **Newsletter list** | confirmed-contact sync; future campaigns | Its numeric id → worker `BREVO_LIST_ID`. |
| **Webhooks (transactional + marketing)** | delivery/bounce/spam/unsubscribe events | Both point at the worker's `…/webhooks/brevo?token=…`. Marketing is required so campaign footer-unsubscribes reach the worker. |
| **Webhook token** | worker `BREVO_WEBHOOK_TOKEN` secret + webhook URL | A long random string; Brevo has no HMAC, so this shared token (in the URL) is the webhook's auth. Generate with `openssl rand -hex 32`. |

Values consumed by the worker (set as GitHub Environment secrets/vars — see
[state backend & credentials](state-backend-and-credentials.md)):

- secrets: `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `TURNSTILE_SECRET`
- vars: `BREVO_SENDER_EMAIL`, `BREVO_LIST_ID`, `ALERT_EMAIL` (optional), plus the site host

## Contact-sync reconciliation & alerts

Confirmation is recorded in **D1** (the source of truth) as soon as the user
clicks the link; the contact is then synced into the Brevo list. If that
list-add fails, confirmation still stands — the row is just marked unsynced
(`brevo_synced_at` null, `brevo_sync_attempts`/`brevo_sync_last_error` recorded).

A **Cron Trigger** (every 15 min, `crons.tf` / the worker's `scheduled` handler)
retries confirmed-but-unsynced rows, so transient Brevo failures self-heal. Once
a row has failed `ALERT_THRESHOLD` (3) times, the worker emails **`ALERT_EMAIL`**
once (via the Brevo transactional API) so you can intervene manually; the row is
flagged (`brevo_alerted_at`) to avoid repeat alerts. Leave `ALERT_EMAIL` empty to
disable alert emails. To find rows needing attention:

```sql
SELECT id, email, brevo_sync_attempts, brevo_sync_last_error
FROM subscriptions
WHERE status = 'confirmed' AND brevo_synced_at IS NULL;
```

## The automated path

```bash
cd infra/cloudflare/newsletter-worker
BREVO_API_KEY=xkeysib-… \
SITE_HOST=staging.youproof.org \
BREVO_WEBHOOK_TOKEN="$(openssl rand -hex 32)" \
BREVO_SENDER_EMAIL=hello@youproof.org \
node scripts/setup-brevo.mjs
```

It ensures the `FNAME` attribute, checks the sender, registers the webhook, and
creates/finds the list — then prints the `BREVO_LIST_ID` to record. Re-running is
safe (idempotent). The list defaults to `<SITE_HOST>-newsletter` and each
webhook to `<SITE_HOST>-webhook-<type>` — both names are **sanitized** to
alphanumerics/hyphens/underscores (the host's dots and spaces become hyphens),
because Brevo's dashboard only allows those characters. This keeps a **shared**
Brevo account's staging and production names distinct automatically; override
the base with `BREVO_LIST_NAME` / `BREVO_WEBHOOK_DESCRIPTION` if you want other
names (they're sanitized the same way). The
**same `BREVO_WEBHOOK_TOKEN`** must be stored as the worker secret for that
environment; keep it out of shell history where possible.

## The manual path (mirrors the script step-for-step)

Base URL `https://api.brevo.com/v3`; every call needs `api-key: <BREVO_API_KEY>`.
`$HOST` = `staging.youproof.org` or `youproof.org`; `$TOKEN` = the environment's
webhook token.

### 1. Sender + domain authentication (dashboard, manual)

Dashboard → **Senders, Domains & Dedicated IPs**:
- Add `BREVO_SENDER_EMAIL` as a sender and verify it.
- Authenticate the sending **domain** (add the SPF/DKIM/Brevo DNS records it
  shows). Until the domain is authenticated, confirmation emails may land in spam.

Check via API that the sender is known (what the script does):

```bash
curl -s https://api.brevo.com/v3/senders -H "api-key: $BREVO_API_KEY" | jq '.senders[].email'
```

### 2. `FNAME` contact attribute

```bash
curl -s -X POST https://api.brevo.com/v3/contacts/attributes/normal/FNAME \
  -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
  -d '{"type":"text"}'
# 200/201 = created; 400 "already exists" = fine.
```

### 3. Newsletter list

Find an existing list by name; if none, create one (a list needs a folder). The
name is sanitized to alphanumerics/hyphens/underscores (dashboard constraint):

```bash
curl -s "https://api.brevo.com/v3/contacts/lists?limit=50" -H "api-key: $BREVO_API_KEY" \
  | jq '.lists[] | {id, name}'

# If absent — find/create a per-host folder, then the list:
FOLDER_ID=$(curl -s "https://api.brevo.com/v3/contacts/folders?limit=50" -H "api-key: $BREVO_API_KEY" | jq --arg n "${HOST//./-}" '.folders[] | select(.name==$n) | .id')
# (create the folder if none: POST /contacts/folders {"name":"<HOST//./->"})
curl -s -X POST https://api.brevo.com/v3/contacts/lists \
  -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
  -d "{\"name\":\"${HOST//./-}-newsletter\",\"folderId\":$FOLDER_ID}"
```

Record the returned list `id` → the environment's **`BREVO_LIST_ID`** var.

### 4. Webhooks (BOTH transactional and marketing)

The worker receives events at
`https://$HOST/api/v1/newsletter/webhooks/brevo?token=$TOKEN`. Brevo delivers
events to **separate webhooks per category**: transactional (SMTP/API email) vs
marketing (campaigns). Register **both**, pointing at the same endpoint —
otherwise campaign events (notably a subscriber clicking the **footer
unsubscribe** of a newsletter campaign) never reach the worker and D1 goes
stale. Event names are **camelCase for both** types (per the [create-webhook
reference](https://developers.brevo.com/reference/create-webhook)); the
categories differ only in which events exist — `blocked` is transactional-only,
while `unsubscribed`/`hardBounce`/`spam`/`delivered` are valid for both.

```bash
# see what's already there (per type)
curl -s "https://api.brevo.com/v3/webhooks?type=transactional" -H "api-key: $BREVO_API_KEY" | jq '.webhooks[] | {id,url,events}'
curl -s "https://api.brevo.com/v3/webhooks?type=marketing"     -H "api-key: $BREVO_API_KEY" | jq '.webhooks[] | {id,url,events}'

# transactional (name: alphanumerics/hyphens/underscores only — host dots → hyphens)
curl -s -X POST https://api.brevo.com/v3/webhooks \
  -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
  -d "{\"type\":\"transactional\",\"url\":\"https://$HOST/api/v1/newsletter/webhooks/brevo?token=$TOKEN\",\"events\":[\"delivered\",\"hardBounce\",\"softBounce\",\"spam\",\"unsubscribed\",\"blocked\"],\"description\":\"${HOST//./-}-webhook-transactional\"}"

# marketing (same camelCase names; no `blocked` — not a valid marketing event)
curl -s -X POST https://api.brevo.com/v3/webhooks \
  -H "api-key: $BREVO_API_KEY" -H 'content-type: application/json' \
  -d "{\"type\":\"marketing\",\"url\":\"https://$HOST/api/v1/newsletter/webhooks/brevo?token=$TOKEN\",\"events\":[\"unsubscribed\",\"hardBounce\",\"spam\",\"delivered\"],\"description\":\"${HOST//./-}-webhook-marketing\"}"
```

The worker only *acts* on hard bounce / spam (→ suppress + block) and
unsubscribe (→ soft-delete); it normalizes the casing difference between the two
categories (`classifyBrevoEvent`). Other events are recorded for history.

## Verify

- Send a test subscribe on the environment → a confirmation email arrives from
  `BREVO_SENDER_EMAIL`; clicking the link lands back on the originating page.
- After delivery, the `email_events` table has a `delivered` row (the webhook
  fired and the token was accepted).
- **Inspect a real send's raw headers** to confirm how `List-Unsubscribe` /
  `List-Unsubscribe-Post` behave — Brevo injects its own `List-Unsubscribe`, and
  whether our custom header overrides vs. duplicates it is not documented and
  must be checked per live account. The body's visible unsubscribe link is always
  ours regardless.

## Things Brevo does / gotchas

- **Auto-suppression:** Brevo already blocklists hard bounces + spam complaints
  for transactional sends. The worker mirrors this into D1 (the authoritative
  store) and calls the blocklist API as a backstop — so suppression is covered
  even if one side lags.
- **Event name casing** varies between Brevo surfaces (`hard_bounce` vs
  `hardBounce`); the worker normalizes, but confirm against a live POST if events
  seem to be ignored.
- **Webhook source IPs** (`1.179.112.0/20`, `172.246.240.0/20`) can change; the
  worker authenticates by the URL token rather than IP, but note them if you add
  an IP allowlist.
- **Free tier** is 300 emails/day (transactional + marketing combined);
  transactional sends and webhooks are available on all plans.
