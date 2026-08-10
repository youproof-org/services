# Plan: Google Analytics 4 Setup + Cookie Consent + Privacy Policy Update

**Project:** youproof.org
**Repos involved:** `youproof-org/services` (frontend, Workers, Terraform), `youproof-org/content` (privacy policy content)
**Author:** David (product owner) — instructions for Claude Code implementation
**Status:** Draft — create Jira tickets from the tasks below before starting work

---

## 0. Context & Decisions Already Made

These are settled — do not re-litigate them during implementation:

1. **Domain verification**: A `google-site-verification` DNS TXT record will be used to verify the domain for Google Search Console (and to link Search Console with GA4). This record is added via **Terraform**, in the same zone-management location as other durable DNS records for `youproof.org` (i.e. wherever the zone's other TXT/verification-style records live in `terraform/zone/`) — not added manually in the Cloudflare dashboard. It is treated as a **plain (non-sensitive) Terraform variable**, not routed through any secrets mechanism — the value is published in public DNS the moment it's live, so there is nothing to protect.
2. **Environments**: `youproof.org` (production) and `staging.youproof.org` (staging) use **two separate GA4 properties** (separate Measurement IDs), not one shared property with filters. This keeps staging/QA traffic completely out of production reporting without relying on remembering to filter it.
3. **Consent mechanism**: The cookie consent dialog will be **built in-house**, not via a third-party CMP (Cookiebot, Osano, etc.). It follows the same "record what was consented to, when, against which version" pattern already used for the newsletter double opt-in — but **stored client-side only** (see Task 2.2 / resolved open question below), not in D1.
4. **Analytics gating**: GA4 must not fire (no script load, no cookies set, no network requests to Google) until the user has given affirmative consent. Google Consent Mode v2 should be used so that GA4's own SDK behavior respects consent state, rather than relying solely on "don't inject the script."
5. **Own-visit exclusion**: David's own testing visits to production must not appear in GA4 reporting. Primary mechanism is a cookie-based debug toggle (Task 4), not IP-based exclusion, since a Hungarian residential IP is not guaranteed to be static.
6. **Locale**: The site's primary content is Hungarian; the consent dialog copy and privacy policy updates must be authored in Hungarian first (English version can follow later, consistent with the site's existing i18n approach).

---

## Task 1 — GA4 Property Setup & Domain Verification

**Goal:** Separate GA4 properties exist for production and staging, domain ownership is verified via Terraform-managed DNS, and each environment's build points at the correct Measurement ID.

Instructions for Claude Code:

- Add a new DNS TXT record resource to the Terraform zone configuration for `youproof.org`, holding the `google-site-verification=...` value (value will be supplied by David after creating the GA4 property / Search Console property). Pass it as a **plain, non-sensitive Terraform variable** (tfvar) — not marked `sensitive = true`, not stored in a secrets manager — since the value is public the moment DNS propagates. Document inline why it's treated this way, so a future contributor doesn't "fix" it into a secret unnecessarily.
- Confirm the record is scoped correctly (root domain, not a subdomain) and does not conflict with existing records (MX/TXT records used for Brevo, SPF, DKIM, DMARC).
- Document in the Terraform module (comment or README) what the record is for and how to regenerate/replace it if the GA4/Search Console property is ever recreated.
- Do **not** touch the existing manually-created Brevo DNS records as part of this task — that's a separate, later cleanup, explicitly out of scope (confirmed, not just deferred).
- Expose **two distinct GA4 Measurement IDs** — one for production (`youproof.org`), one for staging (`staging.youproof.org`) — as build-time environment variables, wired through whatever per-environment config mechanism the Terraform `worker/` per-environment setup already uses for other environment-specific values. The frontend must pick up the correct ID automatically based on which environment it's built/deployed for; there should be no manual step or shared ID that risks staging traffic landing in the production property.

**Acceptance criteria:**
- `terraform plan` shows the new TXT record as the only change; `terraform apply` succeeds against the real zone.
- Google Search Console shows the domain as verified.
- Production build sends events only to the production GA4 property; staging build sends events only to the staging GA4 property. Verify by checking GA4 Realtime reports on both properties while testing each environment.
- No GA4 Measurement ID or the verification TXT value is treated as a secret inconsistent with how the rest of the repo distinguishes secrets from plain config.

---

## Task 2 — Cookie Consent Dialog

**Goal:** A homegrown consent banner/dialog gates GA4 loading, records consent decisions, and supports withdrawal/change of consent later.

Instructions for Claude Code:

### 2.1 Consent UI
- Build a banner (not a full-page interstitial) shown on first visit, with:
  - Hungarian copy explaining that analytics cookies are used, linking to the privacy policy (see Task 3).
  - Two clear actions: **Accept** and **Reject** (avoid dark patterns — both options equally prominent, no pre-ticked boxes, no forced "accept to continue").
  - An optional "Preferences"/settings entry point is not required for launch since there's only one category (analytics) — a simple accept/reject is sufficient. Do not build a multi-category preference center unless David asks for one later.
- Provide a persistent way to change the decision later via a **floating action button (FAB)**, fixed to the bottom-left corner of the viewport, using a shield/armor icon (equivalent to MUI's `Fab` component pattern — small circular button, elevated, always accessible regardless of scroll position). Clicking it reopens the same consent dialog, pre-filled with the current choice. Do not place this in the footer.
- The FAB should be present on all pages (site-wide, not just the homepage) and should not visually collide with any other fixed UI elements (check for existing fixed-position elements before placing it).
- The banner must not block page rendering or core content — the site must remain usable while the decision is pending.

### 2.2 Consent state & persistence
- Store the consent decision client-side (cookie or localStorage — pick whichever is simplest given the static-export/CDN architecture) with:
  - The decision (`accepted` / `rejected`)
  - A timestamp
  - The **`consentPolicyVersion`** value that was in effect at time of consent — a small integer/version string dedicated specifically to the cookie/consent-relevant portion of the privacy policy (see Task 4 for how this is maintained in content). Do **not** use the content-repo commit SHA for this — the SHA changes on every content publish (e.g. a new article), which would incorrectly re-trigger consent on unrelated changes. The SHA may still be recorded alongside the version for audit purposes, but must not drive any re-prompt logic.
- **No server-side/D1 logging for this feature** — this is a deliberate decision, not an open question. Unlike the newsletter flow (consent tied to an identifiable email address for direct marketing, where GDPR's demonstrable-consent expectation is stronger), analytics consent here is anonymous with no identifiable data subject to log a record "for" beyond the browser itself. The client-side record (decision + timestamp + policy SHA) already satisfies GDPR Art. 7(1)'s demonstrable-consent requirement for this context, and matches standard practice for cookie banners generally. Do not build a D1-backed consent log for this feature.
- Consent state must survive normal browsing (page navigations within the static site) without re-prompting, until it expires or is changed. Propose a reasonable expiry (e.g. 6–12 months) consistent with common GDPR consent-lifetime guidance, and confirm with David before finalizing.

### 2.3 Gating GA4 + Consent Mode v2
- Implement Google Consent Mode v2: on every page load, before any GA4 script executes, set default consent state to denied (`analytics_storage: 'denied'`, plus the other Consent Mode v2 parameters at their conservative defaults).
- Only update consent state to `granted` (and only then actually load the GA4 tag / allow it to fire) after the user accepts.
- If the user rejects, GA4 must not load at all (no network calls to `google-analytics.com`/`googletagmanager.com`), not just "loaded but blocked."
- If the user later changes their decision (via the footer link), update Consent Mode state accordingly and load/unload GA4 behavior to match, without requiring a full page reload if reasonably achievable.

**Acceptance criteria:**
- With no prior decision: banner appears, GA4 script is not loaded, no GA cookies are set, no requests to Google analytics endpoints occur.
- After accepting: GA4 loads, events fire, consent record is persisted with timestamp + policy SHA.
- After rejecting: banner disappears, no GA4 script/cookies/requests, consent record is persisted with timestamp + policy SHA.
- Reloading the site after a decision does not re-show the banner.
- Changing the decision via the footer link correctly updates GA4 behavior going forward.
- No console errors; Lighthouse/perf impact of the banner itself is minimal (no large third-party bundle, since it's self-built).

---

## Task 3 — Exclude David's Own Testing Traffic (Production)

**Goal:** David's own visits to `youproof.org` while testing/developing must not appear in production GA4 reporting.

Instructions for Claude Code:

- Implement a **cookie-based debug toggle**, not IP-based exclusion (IP-based exclusion is unreliable here since David's residential IP is not guaranteed static).
- Visiting the production site with a specific URL query parameter (e.g. `?ga_debug=exclude`) should set a long-lived first-party cookie (e.g. `youproof_ga_exclude=1`), separate from the consent cookie.
- When this cookie is present, every GA4 event sent from the client must include a custom parameter (e.g. `traffic_type: internal`) so the traffic is identifiable and filterable inside GA4, rather than being silently dropped client-side — silently dropping it would make it harder to debug that GA4 integration is actually working correctly during David's own testing.
- Provide David with the resulting exact URL to visit once (e.g. `https://youproof.org/?ga_debug=exclude`) and confirm the cookie's lifetime (recommend something long, e.g. 1–2 years, since this is a personal debug setting, not a compliance-relevant cookie).
- This mechanism only needs to exist on production — staging traffic doesn't need it, since staging is already a separate property used exclusively for testing.
- Document, outside of code (e.g. in the PR description or a short note to David), the manual step still required in the GA4 Admin console: creating a Data Filter on the `traffic_type = internal` parameter to actually exclude matching events from standard reports. This GA4 admin configuration is not something Claude Code can do (it's a Google Analytics UI action), so it should be called out clearly as a manual follow-up for David rather than left implicit.

**Acceptance criteria:**
- Visiting `?ga_debug=exclude` once persists the exclusion cookie across future visits without needing to repeat the URL.
- All GA4 events fired while the exclusion cookie is present carry `traffic_type: internal`.
- Without the cookie, no such parameter is sent (default/normal visitor behavior unaffected).

---

## Task 4 — Privacy Policy Update

**Goal:** Privacy policy content accurately discloses GA4 usage and the consent mechanism, in Hungarian, versioned consistently with the content repo's existing patterns.

Instructions for Claude Code:

- Locate the existing privacy policy content file(s) in `youproof-org/content` (the same one referenced by the newsletter flow's policy-version SHA tracking).
- Add a new section (or update the existing cookies/tracking section, if one already exists from the newsletter work) covering, with these settings confirmed as the actual configuration (do not treat as open questions — these are the values to disclose):
  - **IP handling**: GA4 does not store IP addresses at all — it is used transiently to derive an approximate city/region and then discarded. No separate "anonymization" toggle exists in GA4 (unlike the old Universal Analytics); state plainly that IP addresses are not retained.
  - **Ad personalization / Google Signals**: disabled. No cross-device tracking, no remarketing audiences, no signed-in Google account data is used. State this explicitly so readers know analytics is scoped to basic usage measurement only.
  - What data is collected (page views, general usage patterns) and what is explicitly *not* collected (no PII beyond what GA4 itself might handle, no ad-related tracking, per the above).
  - That analytics only runs after explicit consent, and how to withdraw or change consent — reference the **floating action button** (shield icon, bottom-left corner) from Task 2, not a footer link.
  - **Data retention**: 14 months for user/event-level data (GA4's Data Settings → Data Retention), noting this applies to detailed/exploration-level data, not standard aggregated reports which are retained indefinitely. Confirm this is the value David wants configured in GA4 Admin before publishing — the policy text must match whatever is actually set there.
  - Third-party processor disclosure for Google (Google as a data processor, transfer mechanism if applicable — consistent with how the GDPR/DPA language was handled for the Brevo/newsletter work).
  - No mention of server-side consent logging is needed, since none is implemented (see Task 2.2) — the policy should describe the client-side consent record model accurately.
- Ensure the updated policy's commit produces a new content-repo SHA, since that SHA is what the Task 2 consent record references — sequence the work so the consent dialog is tested against the *final* policy SHA, not an intermediate draft.
- Do not draft this section from scratch without input — reuse the structure/tone of the existing GDPR analysis and privacy policy sections already produced for the newsletter feature, for consistency.

**Acceptance criteria:**
- Privacy policy page renders the new/updated section correctly in the site's existing content pipeline.
- The SHA referenced by newly-created consent records (Task 2.2) matches the commit that introduced this policy update.
- No broken links between the consent banner's "read more" link and the actual privacy policy section (deep link to the relevant heading if the site supports anchor links).

---

## Decisions Log (previously open, now resolved)

1. **Staging vs. production GA4 property** — separate properties for each environment (Task 1).
2. **Server-side consent logging** — not implemented; client-side record is sufficient under GDPR Art. 7(1) given consent here is anonymous, unlike the identifiable-email newsletter case (Task 2.2).
3. **GA4 configuration meaning** — clarified and locked in as the actual config to disclose: no IP storage (GA4 default), Google Signals/ad personalization off, 14-month retention for user/event-level data (Task 4).
4. **Consent expiry** — 12 months.
5. **Brevo manual DNS records** — explicitly out of scope for this work; no follow-up ticket needed unless raised separately later.

**Remaining true open item:** whether David wants the GA4 Admin "Internal Traffic" IP-based rule set up *in addition to* the cookie-based debug toggle (Task 3), in case he ever has a static IP available (e.g. via VPN). Not required for launch — the cookie-based approach is sufficient on its own.

