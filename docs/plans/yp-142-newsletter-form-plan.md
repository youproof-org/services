# Newsletter Subscription Feature — Implementation Plan

**Project:** YouProof.org
**Feature:** Newsletter subscription form with Brevo integration, double opt-in, unsubscribe support
**Audience for this document:** Claude Code (implementing agent with full source access)
**Status:** Draft plan — awaiting technical investigation and refinement by the implementing agent

---

## 1. Goal

Add a newsletter subscription capability to youproof.org:

- A subscription form embedded on the site, matching the existing black-and-white visual identity.
- A double opt-in flow: subscribing triggers a confirmation email; only clicking the confirmation link activates the subscription.
- Ongoing newsletter sending via Brevo, with proper unsubscribe support (visible link + List-Unsubscribe headers).
- A dedicated Cloudflare Worker + D1 database to own subscription state, sitting behind `youproof.org/api/v1/newsletter/*`.
- Infrastructure (Worker, D1, and Brevo resources where feasible) managed via Terraform, consistent with how the rest of the project is provisioned.

This document intentionally avoids prescribing code-level design. Where the right approach depends on the actual codebase (repo layout, existing Terraform modules, existing worker patterns, existing frontend component structure, existing CI/CD pipeline), the implementing agent should investigate the source first and choose an approach consistent with existing conventions. Open questions and investigation points are called out explicitly in Section 8.

---

## 2. Repositories Involved

Based on the existing project structure:

- **`youproof-org/services`** — Next.js frontend, Cloudflare Workers, Terraform, CI/CD. This is where the new newsletter worker, its Terraform module, and the frontend form component belong.
- **`youproof-org/content`** — YAML content, including the privacy policy page. The newsletter worker needs to know the commit SHA of this repo at build/deploy time (see Section 6).
- **`youproof-org/editor`** — Not expected to be involved in this feature.

---

## 3. User-Facing Flows

### 3.1 Subscription flow

1. User encounters the newsletter form, placed:
   - Above the footer on every page (index pages, chapters, articles, etc.), **except** the legal pages linked from the footer (privacy policy, terms, etc. — those must not show the form).
   - Additionally, for long chapters/articles, a second instance of the form is placed roughly midway through the content, positioned right before a section header so it's noticeable without disrupting reading flow. Exact heuristic for "long enough to warrant a mid-content form" and how to detect a suitable section-header insertion point is left to Claude Code to investigate against the actual content rendering pipeline.
   - Each form instance needs a stable, unique identifier (e.g. per-page and per-placement) so a later "which form did this subscription come from" reference is possible — see step 6 and Section 8.2 below.
2. Form fields, in this order:
   - **"Hogyan szólíthatlak?"** — subscriber's name (free text)
   - **"Email címed"** — subscriber's email address
   - **Checkbox** — acceptance of the privacy policy, with an inline link to the privacy policy page
   - **Button** — labeled **"Feliratkozom"**
3. On submit, the form calls `POST /api/v1/newsletter/subscriptions` (see Section 5) with the name, email, a reference to which form instance was used (see step 1), and a CSRF token.
4. On success, the user sees an in-page confirmation ("check your inbox") state — not yet a full "subscribed" state, since opt-in is not yet confirmed.
5. Brevo sends (or the worker triggers Brevo to send) a confirmation email containing a unique confirmation link. This link points back to the **same page the user subscribed from**, carrying a query-string parameter that identifies both the subscription and the originating form instance (see Section 8.2 for the confirmation-landing mechanics).
6. Clicking the confirmation link lands the user back on the originating page, where a frontend component reads the query-string parameter, scrolls to the exact form instance the subscription came from, and shows a "successfully confirmed" message (in a dialog or inline in the form) — so the user can pick up reading right where they left off. There is no separate, dedicated thank-you page. Exact UX mechanics (dialog vs. inline swap, scroll behavior, what happens if the referenced form instance no longer exists e.g. content was edited) are left to Claude Code to design.

### 3.2 Unsubscribe flow

1. Every newsletter email includes:
   - A visible unsubscribe link in the footer.
   - A `List-Unsubscribe` (and ideally `List-Unsubscribe-Post` for one-click) email header, so native unsubscribe buttons in clients like Gmail work.
2. Clicking unsubscribe calls `DELETE /api/v1/newsletter/subscriptions/{subscription-id}`.
3. On success, the user is redirected to the **`youproof.org/{locale}` homepage**, with `{locale}` taken from the **locale stored on the subscription being unsubscribed** (not necessarily the browser's current locale), carrying a query parameter indicating the unsubscription result. A frontend component on the homepage reads this parameter and shows the user a **dialog** confirming the unsubscription (or explaining a failure, e.g. an already-invalid/unknown subscription id). There is no separate dedicated unsubscribed page. Exact query parameter shape and dialog content/design are left to Claude Code.
4. **Decision:** the endpoint performs a **soft-delete** — the record is kept, its status set to `unsubscribed`, and the unsubscription datetime recorded, so delivery/bounce/spam history is retained against that subscription. It is never a hard row deletion. The `DELETE` HTTP verb is kept for REST semantics from the client's point of view, but the underlying implementation must not physically remove the row.

### 3.3 Re-subscription / update flow

- If a user submits the form again with an email that already has an **active (pending or confirmed)** subscription record, the name is updated in place (upsert semantics), per the requirements.
- If a user submits the form again with an email that is currently **unsubscribed**:
  - **If no bounce or spam-complaint has ever been recorded for that email address**, the existing record is replaced with a fresh **pending** subscription (new subscription datetime, cleared confirmation datetime, status reset to `pending`, new consent/commit-SHA snapshot per Section 6), and the double opt-in flow runs again from the start.
  - **If a bounce or spam-complaint has been recorded for that email address**, the resubscription must **not** succeed. The user must be shown an explicit message explaining that the resubscription was not accepted (exact wording/UX to be designed, but it must not silently fail or look like a generic success/pending state). The API response for this case needs a distinct, identifiable outcome (e.g. a specific status code or error payload) so the frontend can render the correct message — exact shape left to Claude Code.
  - This means the worker must check bounce/spam history (Section 6) as part of handling `POST /api/v1/newsletter/subscriptions`, not just the current subscription status.
- **Beyond blocking resubscription:** emails with bounce/spam-complaint history must also be prevented from receiving *any* further newsletter sends, even if never explicitly unsubscribed by the user. See the new `blocked` status described in Section 6 and the send-suppression requirement in Section 5.

---

## 4. Visual / Frontend Requirements

- The form must visually match the existing black-and-white design language of the site (typography, spacing, button styles, etc. should reuse existing site components/styles rather than introducing new patterns).
- Fields and copy (Hungarian, since only the `hu` locale exists today):
  - Label: "Hogyan szólíthatlak?"
  - Label: "Email címed"
  - Checkbox with privacy-policy link (link target: the existing privacy policy page — locate it in the content/repo routing)
  - Button label: "Feliratkozom"
- Needs: a "pending confirmation" in-page state after submission, an in-place "successfully confirmed" state shown at the originating form instance after the user clicks the confirmation link (no separate thank-you page — see Section 3.1), and a dedicated successfully-unsubscribed page. These should also follow the existing site's page/layout conventions (header/footer, styling, i18n structure).
- Since the form can appear twice on long chapters/articles (Section 3.1), the "pending" and "confirmed" states must be scoped to the specific form instance the user interacted with, not shown at every instance on the page.
- Client-side validation (required fields, valid email format, checkbox required) should be implemented, but the server must not rely on client-side validation alone.

---

## 5. API Endpoints

All under `youproof.org/api/v1/newsletter/`, served by a new Cloudflare Worker (see Section 6).

### `POST /api/v1/newsletter/subscriptions`
- Upserts a subscription by email:
  - Creates a new pending subscription, or updates the name if an active (pending/confirmed) subscription for that email already exists.
  - If the email is currently unsubscribed and has no recorded bounce/spam history, replaces the record with a fresh pending subscription (re-triggering double opt-in).
  - If the email is currently unsubscribed **and** has bounce/spam history, rejects the request with a distinct, identifiable response so the frontend can show an explicit "not accepted" message (see Section 3.3).
- Accepts a reference to the originating form instance (page + placement identifier) so the confirmation link can later return the user to the right spot (see Section 3.1, Section 8.2).
- Must validate a CSRF token so the endpoint can't be invoked from outside the actual form.
- Must trigger the double opt-in confirmation email (directly or via Brevo), with the confirmation link pointing back to the originating page + form instance.
- Must record all metadata listed in Section 6.

### `DELETE /api/v1/newsletter/subscriptions/{subscription-id}`
- Unsubscribes the given subscription via **soft-delete**: sets status to `unsubscribed` and records the unsubscription datetime; the row and its delivery/bounce/spam history are retained (see Section 3.2, Section 6). The record is never physically removed.
- Must be reachable both from a user clicking the in-email unsubscribe link and from Gmail-style native "unsubscribe" header-triggered requests (which may arrive without a normal browser session/CSRF token — investigate Brevo's and email clients' expected mechanism here; typically these use a unique, unguessable per-subscriber token embedded in the URL rather than a CSRF token, since there's no form involved). Clarify CSRF token applicability for this endpoint vs. the subscribe endpoint — they likely need different anti-abuse strategies.

### Confirmation endpoint (not explicitly named in requirements, but required by the double opt-in flow)
- A `GET`-style endpoint (e.g. `GET /api/v1/newsletter/subscriptions/{subscription-id}/confirm` or similar — exact path to be decided during implementation) that the confirmation email link points to.
- Marks the subscription confirmed, then redirects the browser to the **originating page the user subscribed from**, with a query-string parameter identifying the subscription/form instance so the frontend can scroll to it and show a "successfully confirmed" state in place (see Section 3.1 step 6, Section 8.2). There is no separate thank-you page to redirect to.

### Brevo callback endpoints (for delivery/bounce tracking)
- One or more endpoints to receive Brevo webhook events (e.g. delivered, opened, bounced, spam-reported, unsubscribed via Brevo's own mechanism if used) so this info can be stored against the subscription record. Confirm exact event set and payload shape against Brevo's current webhook documentation during implementation — this is external API investigation, not source-code investigation, so the implementing agent should look this up as part of the work rather than treating it as unknowable.
- **Send suppression on bounce/spam-complaint:** when a bounce or spam-complaint webhook event is received for an email address, the worker must, in addition to recording the event (Section 6):
  - Set that email's status to a new **`blocked`** status, distinct from `unsubscribed` — a `blocked` email must never receive further newsletter sends and must never be allowed to resubscribe (already covered in Section 3.3), whereas `unsubscribed` reflects a voluntary opt-out.
  - Prevent Brevo itself from sending to that address going forward, not just rely on this worker's own bookkeeping. **Investigate whether Brevo can enforce this at the platform level** — e.g. by removing/blacklisting the contact from the relevant Brevo list via the Brevo API when the bounce/spam webhook fires, or via Brevo's own built-in bounce-handling/suppression behavior (many ESPs auto-suppress hard bounces and spam complaints already). If Brevo already does this automatically for hard bounces/spam complaints, confirm the behavior and rely on it rather than duplicating logic; if it doesn't (e.g. for soft bounces, or if using a sending mode that bypasses Brevo's own list suppression), the worker must call the appropriate Brevo API to remove/block the contact explicitly. This should be written up as part of the technical design note in Section 9, step 1.

All endpoint paths above are proposals; finalize exact routing conventions to match how the existing redirection worker or other services in the `services` repo structure their routes.

---

## 6. Data Model (D1)

Each subscription record should capture at least:

| Field | Notes |
|---|---|
| Subscriber name | From "Hogyan szólíthatlak?" |
| Email address | Unique per subscription; upsert key |
| Subscription datetime | When the form was submitted |
| Confirmation datetime | When the opt-in link was clicked (null until confirmed) |
| Unsubscription datetime | When unsubscribed (null if still subscribed) |
| Content repo commit SHA | The commit of `youproof-org/content` whose privacy policy the user accepted at subscription time |
| Status | `pending`, `confirmed`, `unsubscribed`, and **`blocked`** (set when a bounce or spam-complaint is recorded for the email — see Section 5; a `blocked` email can never be sent to again or resubscribed, distinct from a voluntary `unsubscribed`). Exact enum/naming to be finalized during implementation. |
| Source | Which page/placement the subscription came from (see Section 3.1 — needs to identify both the page and the specific form instance, since a page can have two forms) |
| Locale | Taken from a hidden field on the subscription form, set to the locale of the page the form is embedded on at render time — **not** hardcoded to `hu`. Today this will in practice always resolve to `hu` since that's the only published locale, but the field and the form must be built to carry whatever locale the page actually is. This locale is also what determines which `youproof.org/{locale}` homepage the user lands on after unsubscribing (see Section 3.2). |
| Delivery/bounce/spam info | Populated via Brevo webhook callbacks where feasible. This must be queryable **per email address independent of the current subscription record's lifecycle**, since a bounce/spam event recorded against a now-unsubscribed record must still block that email from resubscribing (see Section 3.3). Whether this is modeled as a flag on the subscription row, a separate history table keyed by email, or something else is left to Claude Code — but it must survive across soft-deleted/replaced subscription records for the same email. |

Additional fields the implementing agent may find necessary during actual schema design (e.g. a unique confirmation/unsubscribe token, internal IDs, timestamps for record creation/update) should be added as needed — this table lists the business-required fields, not the full schema.

**Content repo commit SHA:** Per the infra requirements, the newsletter worker should have this value embedded in its deployed manifest, analogous to how the redirection worker embeds its redirect table. This implies the newsletter worker needs to be rebuilt/redeployed whenever the content repo changes (or specifically when the privacy policy page changes) so the embedded SHA stays current — confirm this matches the existing deployment pipeline's behavior for the redirection worker, and align accordingly.

---

## 7. Infrastructure

- **Newsletter Worker:** A new Cloudflare Worker, separate from (but following the same conventions as) the existing redirection worker, bound to `youproof.org` and handling `/api/v1/newsletter/*`.
- **D1 Database:** A new D1 database (or a new set of tables in an existing one, if that fits the project's conventions better) for subscription storage.
- **Terraform:** Both the Worker and D1 database should be defined in Terraform, following the existing `terraform/zone/` vs `terraform/worker/`-style split already used for the redirection worker infra.
- **Brevo resources via Terraform:** Investigate whether Brevo exposes a Terraform provider or a sufficiently stable API to manage things like sender identities, templates, or lists via Terraform. If no usable Terraform provider exists, fall back to documenting the manual/one-time Brevo configuration steps, and manage what *can* be managed as code (e.g. via a setup script or documented manual steps) rather than forcing an unsupported Terraform integration.
- **Secrets:** Brevo API keys and any webhook signing secrets need to be provisioned securely (Cloudflare Worker secrets / existing project secret-management convention) — follow however the project already manages secrets for the redirection worker or other services.

---

## 8. Open Questions / Investigation Required

These require looking at the actual source code, existing conventions, or external (Brevo) documentation, and are explicitly left to the implementing agent:

1. **Existing worker conventions** — How is the redirection worker structured (routing, manifest embedding, build/deploy steps)? The newsletter worker should follow the same patterns where reasonable.
2. **Existing Terraform module structure** — Confirm exact layout to slot the new worker + D1 resources into, consistent with `terraform/zone/` and `terraform/worker/`.
3. **CSRF strategy** — What CSRF mechanism (token issuance, storage, validation) fits this static-export Next.js + Worker architecture, given there's no traditional server-rendered session? Also decide whether/how CSRF applies differently to the unsubscribe endpoint given it's reached from email clients and possibly headerless native-unsubscribe requests.
4. **Brevo integration shape** — Decide whether Brevo sends the actual transactional/confirmation/newsletter emails directly (worker calls Brevo's transactional email API) or whether Brevo's own list/automation features are used to drive the double opt-in sequence. Investigate Brevo's current API/webhook documentation for the exact mechanism for double opt-in, unsubscribe webhooks, and bounce/delivery events.
5. **Brevo Terraform support** — Confirm current availability and maturity of a Brevo Terraform provider; decide fallback approach if none exists.
6. **List-Unsubscribe header mechanics** — Determine whether headers are set by Brevo automatically (many providers do this by default for campaign sends) or need to be constructed manually per email; confirm one-click unsubscribe (`List-Unsubscribe-Post`) support.
7. **Long-content form placement heuristic** — Determine, against the actual chapter/article rendering pipeline, what counts as "long enough" to warrant a second, mid-content form instance, and how to reliably pick an insertion point right before a section header without disrupting existing content rendering (see Section 3.1).
8. **Confirmation-landing mechanics** — Design the concrete mechanism for identifying a specific form instance via query string, scrolling to it, and rendering the "successfully confirmed" state in place (dialog vs. inline swap), including the edge case where the referenced form instance no longer exists (e.g. the content was edited or the page restructured after the subscription was made) (see Section 3.1 step 6).
9. **Bounce/spam history model** — Decide the concrete D1 schema shape for tracking bounce/spam-complaint history per email address, independent of and surviving across individual subscription records for that email, so it can gate resubscription as required (see Section 3.3, Section 6).
10. **Brevo-level send suppression for `blocked` emails** — Investigate whether Brevo already auto-suppresses sends to hard-bounced/spam-complained addresses, and if so under what conditions; if not sufficient, determine the correct Brevo API call(s) to remove/block a contact from the relevant list(s) when a bounce/spam webhook is received, so `blocked` emails are suppressed both in this system's own bookkeeping and at the Brevo platform level (see Section 5).
11. **Rate limiting / abuse protection** — Beyond CSRF, decide if basic rate limiting or bot protection (e.g. Cloudflare Turnstile) is warranted on the subscribe endpoint, consistent with how staging/production already handle bot traffic (relevant given the earlier Facebook-bot-blocking investigation on this project).

---

## 9. Suggested Implementation Phases

1. **Investigation** — Resolve the open questions in Section 8 by reading the existing codebase and current Brevo docs; produce a short technical design note before writing code.
2. **Data layer** — D1 schema + migrations; Terraform for D1 + Worker skeleton.
3. **Worker API** — Implement subscribe (upsert + pending), confirm, unsubscribe, and Brevo webhook callback endpoints.
4. **Brevo integration** — Wire up confirmation email sending, newsletter unsubscribe headers, and webhook receipt for delivery/bounce tracking.
5. **Frontend** — Subscription form component (styled to match site), pending/thank-you/unsubscribed pages, CSRF token plumbing.
6. **CSRF & abuse protection** — Finalize and implement chosen mechanism.
7. **Terraform for Brevo resources** — To the extent feasible.
8. **End-to-end testing** — Full subscribe → confirm → receive → unsubscribe cycle on staging.
9. **Rollout** — Deploy via existing CI/CD pipeline and branching/environment conventions.

---

## 10. Out of Scope (for this iteration)

- Non-`hu` locales (structure should allow for them later, per YP-125, but no additional locale content is required now).
- Any admin UI for managing subscribers (D1 can be inspected directly or via Cloudflare dashboard for now, unless the implementing agent finds this necessary).
- Segmentation/campaign-authoring tooling beyond what Brevo provides out of the box.
