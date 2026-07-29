# GDPR Data Transfer Overview — Cloudflare Infrastructure

Context for extending YouProof.org's privacy policy. Covers how personal data
(D1) is stored and processed across Cloudflare's infrastructure, and the legal
basis for any non-EU processing.

## Infrastructure facts

- **D1 database jurisdiction:** set to `eu` at creation (Terraform
  `cloudflare_d1_database` resource, `jurisdiction = "eu"`). This restricts
  where the database *runs and persists data* to the EU. Cannot be changed
  after creation.
- **Worker execution location is NOT restricted by D1 jurisdiction.** Workers
  invoking the EU database can execute from any Cloudflare edge location
  worldwide (e.g. a US-based visitor's request may be served by a US colo).
  Restricting Worker execution location itself (Cloudflare "Regional
  Services") requires an Enterprise plan — not currently in use.
- **Practical exposure:** most requests will be served from EU colos since
  the primary audience is Hungarian/EU-based, but non-EU visitors or edge
  routing can cause a Worker outside the EU to process personal data
  in-flight (query results in memory), even though storage stays EU-only.

## Legal basis for this (for the privacy policy's "International Transfers" section)

1. **Cloudflare acts as our data processor** under GDPR Art. 28. We are the
   controller.
2. **Cloudflare's Data Processing Addendum (DPA)** incorporates the EU
   Standard Contractual Clauses (SCCs) — the EU Commission's approved
   mechanism for transferring personal data to non-adequate countries (e.g.
   the US). This is automatically part of Cloudflare's Self-Serve
   Subscription Agreement.
3. **EU-US Data Privacy Framework (DPF):** Cloudflare is also certified
   under this; transfers made under it are not classified as "restricted
   transfers" under GDPR. The SCCs serve as a fallback if DPF certification
   ever lapses.
4. Net effect: any processing of EU personal data by Cloudflare
   infrastructure located outside the EU (including Workers execution) is
   covered by a documented legal transfer mechanism (SCCs + DPF), not left
   unaddressed.

## Distinctions worth stating explicitly in the policy

- **A user accessing their own data while physically abroad (e.g. an EU
  user traveling in the US) is not a GDPR "transfer."** Transfers apply to
  disclosure to another controller/processor, not a data subject retrieving
  their own data. No special clause needed for this case.
- **Encryption does not remove data from GDPR's scope** if it remains
  linkable to a person — it's a risk-mitigation measure, not an exemption.
  Not currently relied upon as the primary safeguard (SCCs/DPF are).

## Suggested privacy policy content to add

- A sub-processor / infrastructure section naming Cloudflare (D1, Workers,
  R2) and stating data is stored within the EU (D1 `eu` jurisdiction).
- An "International Transfers" clause stating that limited processing may
  occur outside the EU via Cloudflare's global network, safeguarded by
  Cloudflare's DPA (EU SCCs) and its EU-US DPF certification.
- No claim of "your data never leaves the EU" — only that storage is
  EU-restricted and transfers are safeguarded contractually.

## Not covered here / needs a real legal review

- Whether the current setup (no Regional Services) is defensible if
  challenged — this is a risk-acceptance decision, not a purely technical
  one.
- Metadata (IPs, request headers) exposure at non-EU edge locations.
