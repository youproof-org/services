# Newsletter worker (`youproof.org/api/v1/newsletter/*`)

A Cloudflare Worker on the `youproof.org` zone backing the newsletter
subscription feature: a **double opt-in** flow with all state in a **D1**
database, using **Brevo** only to send email and to report delivery/bounce/spam
via a webhook. It is the **first Worker on the `.org` zone** — everything else
there is served static from R2. Brevo provisioning is covered separately in the
[Brevo setup runbook](brevo-setup.md).

## Architecture

- **Route:** a `cloudflare_workers_route` binds `<site_host>/api/v1/newsletter/*`
  to the worker. A Workers route with a specific path pattern takes precedence
  over the R2 custom domain, so only that prefix hits the worker while all other
  paths keep serving static content from R2. *(Verify this precedence first on
  staging — it's the one load-bearing new assumption.)*
- **State:** D1 is the source of truth (`subscriptions`, `email_suppressions`
  keyed by email so bounce/spam history survives re-subscription, `email_events`
  as an idempotent webhook log, `subscribe_attempts` as the rate-limit ledger).
- **Worker-owned double opt-in:** the worker generates its own tokenized confirm
  link (back to the exact originating page + form instance) and sends it via
  Brevo's transactional API. Nothing activates until the recipient clicks it.
- **Endpoints:** `POST /subscriptions` (validate → origin/Turnstile/rate-limit →
  suppression gate → upsert → send/resend confirmation; uniform `202 {pending}`,
  distinct `409 subscription_blocked`), `GET /subscriptions/{id}/confirm`,
  `GET|POST|DELETE /subscriptions/{id}/unsubscribe` (token-authed soft-delete +
  propagate a blacklist to Brevo), `POST /webhooks/brevo` (token-authed,
  idempotent; hard bounce/spam → suppress + block, Brevo-side unsubscribe →
  soft-delete).
- **Brevo state sync + reconciliation:** D1 is authoritative and the worker
  pushes each row's desired state OUT to Brevo — `confirmed` → in the list +
  `emailBlacklisted:false` (also reactivates a re-confirmed resubscriber);
  `unsubscribed` (via our endpoint, which Brevo never sees) → `emailBlacklisted:true`.
  Each push is best-effort inline; on failure the row is marked
  (`brevo_synced_at IS NULL`) and retried by a 15-minute **Cron Trigger** — one
  unified worklist covering confirm, resubscribe, and unsubscribe — which emails
  `ALERT_EMAIL` once a row keeps failing. (Webhook-driven unsubscribes aren't
  re-pushed: Brevo already knows.) A **misconfigured `BREVO_LIST_ID`** (list
  doesn't exist) is caught up front — the worker verifies the list before adding
  a contact — so it fails loudly via reconciliation + alert instead of silently
  dropping subscribers (Brevo otherwise accepts a bad list assignment with a 2xx).

## `.html` transform and `/api/` paths

The `youproof.org` zone's `.html`-stripping **Transform Rule**
([terraform/zone/transform.tf](../infra/cloudflare/terraform/zone/transform.tf))
rewrites extensionless paths to `<path>.html` **before** a Worker on the zone
runs. Its rule explicitly **excludes `/api/`** (`and not
starts_with(http.request.uri.path, "/api/")`) so the newsletter API paths reach
the Worker unrewritten — without that, `/api/v1/newsletter/subscriptions` would
arrive as `…subscriptions.html` and match no route (→ 404).

> History: a temporary router-level `.html` strip in `src/router.ts` unblocked
> staging before the zone-transform exclusion could be landed (the zone root is a
> shared, production-only, `zone-purity`-gated singleton). Once the exclusion
> reached production the stopgap was removed.

## Repo layout

- Worker source: `infra/cloudflare/newsletter-worker/` (`@youproof.org/newsletter-worker`).
- Terraform root: `infra/cloudflare/terraform/newsletter/` (per-env; state key
  `cloudflare/newsletter/{env}.tfstate`; reads `org_zone_id` from the zone root).
- Frontend: `apps/website/components/newsletter/` + placement in `SiteFooter`,
  `ChapterPage`, `StandalonePage`, and `NewsletterLanding` in the root layout.

## Build & deploy

The `newsletter-worker` job in [deploy.yml](../.github/workflows/deploy.yml) runs
independently of the content-site chain and does a **three-step apply** so the
worker never serves before its schema exists:

1. `terraform apply -target=cloudflare_d1_database.newsletter` — create the DB only.
2. `wrangler d1 migrations apply DB --remote` against it (the CI step patches the
   config's placeholder `database_id` with the Terraform output).
3. `terraform apply` (full) — worker script + bindings + route + cron.

The accepted **privacy-policy content SHA** is embedded into the bundle by
`gen-buildinfo.mjs` (from the pipeline's `content_sha`) and also bound as
`CONTENT_SHA`; because the pipeline re-runs on every content change
(`repository_dispatch`), the SHA stays current. The committed `buildinfo.json`
stub keeps the worker buildable without a content checkout — the same rationale
as the migration worker's committed empty `manifest.json`.

Terraform owns the D1 database (`jurisdiction = "eu"`, matching the R2 buckets);
wrangler owns only schema migrations + local dev (`wrangler dev`), never the
worker deploy.

## One-time setup checklist (per environment)

Do this for **staging first**, then production. Newsletter Brevo resources should
use a **separate Brevo account per environment** so a staging test never touches
the production contact list or suppression state (see [Brevo setup](brevo-setup.md)).

**Cloudflare**
- [ ] Add **D1 (Account, Edit)** to the `CLOUDFLARE_API_TOKEN` for both
      environments (see [state backend & credentials](state-backend-and-credentials.md)).
- [ ] Create a **Turnstile** widget for the env's `.org` host → record the
      **sitekey** (public) and **secret**.

**Brevo** (run [`scripts/setup-brevo.mjs`](../infra/cloudflare/newsletter-worker/scripts/setup-brevo.mjs)
or follow the [runbook](brevo-setup.md))
- [ ] Create + **verify the sender** and authenticate the sending domain (SPF/DKIM).
- [ ] Create an **API key** → `BREVO_API_KEY`.
- [ ] Generate a random **webhook token** (`openssl rand -hex 32`) → `BREVO_WEBHOOK_TOKEN`.
- [ ] Ensure the newsletter **list** → record its id → `BREVO_LIST_ID`.
- [ ] Register **both** the transactional and marketing webhooks at `https://<host>/api/v1/newsletter/webhooks/brevo?token=<token>` (campaign footer-unsubscribes only reach a *marketing* webhook).

**GitHub Environment** (`staging` and `production`)
- [ ] secrets: `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `TURNSTILE_SECRET`
- [ ] vars: `BREVO_SENDER_EMAIL`, `BREVO_LIST_ID`, `ALERT_EMAIL` (optional),
      `TURNSTILE_SITEKEY` (consumed by the website build as
      `NEXT_PUBLIC_TURNSTILE_SITEKEY`)
- [ ] (site host + allowed origins reuse the existing `REDIRECT_TARGET_HOST` var — nothing new)

> The form calls the API **same-origin** (relative `/api/v1/newsletter/*`), so no
> API-base variable is needed in the deployed site. `NEXT_PUBLIC_NEWSLETTER_API_BASE`
> exists only as an optional local-dev override to point at a running staging worker.

## End-to-end verification (staging)

First merge the PR to `development` and promote `development → stable/staging` so
the feature is deployed to staging; then run these against `staging.youproof.org`:

1. **Route precedence (do first):** `GET https://staging.youproof.org/api/v1/newsletter/subscriptions`
   (or any `/api/v1/newsletter/*` path) reaches the worker (JSON response), while
   every other path still serves the static site from R2.
2. **Full cycle:** submit the form → "check your inbox" → confirmation email from
   `BREVO_SENDER_EMAIL` → click confirm → land back on the exact originating page
   + form instance showing the confirmed state → contact appears in the Brevo list.
3. **Unsubscribe:** via the email's visible link → redirected to `/{locale}` with
   the unsubscribe dialog; row soft-deleted (retained). Test Gmail one-click.
4. **Resubscribe:** unsubscribed-without-suppression → fresh pending; a suppressed
   email → the explicit "not accepted" message (no silent success).
5. **Bounce/spam:** trigger (or POST a token-authed test webhook) → suppression row
   + subscription `blocked` + future subscribe attempts rejected.
6. **Abuse:** a cross-origin/no-token POST is rejected; Turnstile-fail → 403;
   exceed the rate limit → 429.
7. **Live-account Brevo checks** (from the API research):
   - Inspect a real send's raw headers for `List-Unsubscribe` / `List-Unsubscribe-Post`
     behavior (Brevo injects its own; confirm override vs. duplicate).
   - Confirm webhook `event` casing and current egress IP ranges.
   - Confirm `wrangler d1 migrations apply --remote` works against the
     **EU-jurisdiction** D1; if wrangler can't target it, apply `0001_init.sql`
     via the D1 HTTP API as a fallback.

Once all staging checks pass, promote `stable/staging → stable/production`, then
smoke-test one live subscribe→confirm→unsubscribe cycle on production.
