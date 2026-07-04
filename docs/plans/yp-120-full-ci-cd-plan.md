# youproof.org CI/CD Pipeline — Implementation Plan

> Status: DRAFT v2 — all sections filled in and confirmed, with explicit
> `[For Claude Code]` callouts marking design work intentionally left open
> for implementation-time analysis rather than decided here.
>
> Scope: the build/deploy pipeline for `youproof.org` (production) and
> `staging.youproof.org` (staging), which is the next phase after the
> already-implemented `youproof.hu` → `youproof.org` redirect worker
> infrastructure.

---

## 1. Branching strategy — CONFIRMED

### Repositories and branches

- `youproof-org/services` (website code + infra-as-code) has:
  - `development` — ongoing feature work, merged into `stable/staging`
  - `stable/staging` — staging environment
  - `stable/production` — production environment
- `youproof-org/content` (mathematical content model as YAML) has two
  branches:
  - `draft` — ongoing content work
  - `stable/released` — content currently live in production

A deployable "version" of the site is really a **pair**:
`(services_commit, content_commit)`. The rules below exist to make sure that
pair is always validated before it reaches production.

### Content/services compatibility rules

1. **Staging auto-deploy trigger.** A merge to `stable/staging` in `services`,
   *or* a merge to `draft` in `content`, triggers an automatic deployment to
   the staging environment, always combining the **latest** `stable/staging`
   (services) with the **latest** `draft` (content) — i.e. staging always
   reflects the newest of both, regardless of which repo changed.
2. **Post-deploy compatibility test.** After that deploy, a comprehensive test
   suite runs against this specific `(stable/staging, draft)` version pair to
   prove the site is fully operational with that content.
3. **Test artifact.** The result of that test run is written to an artifact,
   keyed by the exact `(services_commit_sha, content_commit_sha)` pair it
   tested. The production promotion pipeline (see Branch protection rules
   below) looks this artifact up later to decide whether a given
   services/content pair is allowed into production.

### Branch protection rules

1. Merges to `stable/staging` (services) and `draft` (content) are only
   allowed via PR — no direct pushes to either. Additionally, merges to
   `stable/staging` are only allowed **from `development`** (i.e. no other
   branch may be merged directly into `stable/staging`).
2. Merges to `stable/production` (services) are only allowed **from
   `stable/staging`**, via PR, and only if a test artifact exists proving
   that the current `stable/staging` (services) is fully operational with
   the content version that is the **direct ancestor of the current
   `stable/released`** on the `draft` branch — i.e. the exact `draft` commit
   that `stable/released` was last promoted from.
3. Merges to `stable/released` (content) are only allowed **from `draft`**,
   via PR, and only if a test artifact exists proving that the **direct
   ancestor of the current `stable/production`** (i.e. the exact
   `stable/staging` commit that `stable/production` was last promoted from)
   is fully operational with the current `draft` content.

In other words: promoting *either* side to production requires a passing
test artifact for the pairing of "the new version of the side being
promoted" with "whatever the other side's production is already known to be
compatible with." This keeps services and content promotions from racing
ahead of each other without a validated pairing.

### Implementation considerations — RESOLVED

- **Ancestor tracking.** Promotions from `draft` → `stable/released` and from
  `stable/staging` → `stable/production` must always use a real **merge
  commit** (i.e. `git merge --no-ff` equivalent). Fast-forward, squash-merge,
  and rebase-merge are explicitly disallowed for these two promotion paths —
  **and also for merges into `development` (services), `stable/staging`
  (services), and `draft` (content)**. In short: merge-commit-only applies
  across the board, on every branch in both repos; nowhere in the pipeline
  are fast-forward, squash, or rebase merges permitted.
  This means the merge commit's second parent is always the exact `draft` (or
  `stable/staging`) commit that was promoted, so the "direct ancestor" needed
  by branch protection rules 2 and 3 can be read directly from git history
  (the merge commit's parent pointing back into `draft`/`stable/staging`) —
  no separate metadata file/tag is needed.
  - Note for GitHub branch protection config: this requires disabling
    "Allow squash merging" and "Allow rebase merging" **repo-wide** (or at
    minimum on every protected branch: `development`, `stable/staging`,
    `stable/production` in `services`; `draft`, `stable/released` in
    `content`), leaving only "Allow merge commits" enabled.
- **Artifact keying/lookup.** Confirmed: the test-artifact check is a
  **required CI status check** on PRs targeting `stable/production` and
  `stable/released`. The check looks up whether a passing artifact exists for
  the specific `(services_sha, content_sha)` pair implied by rule 2 or 3, and
  fails the PR if none is found.
- **Failure path.** Confirmed: if the staging compatibility test fails for a
  `(stable/staging, draft)` pair, no artifact is produced for that pair.
  Production promotion is blocked **implicitly** — the required status check
  on the next `stable/production`/`stable/released` PR simply has nothing to
  find and fails. No separate alerting/blocking mechanism is needed beyond
  that.

---

## 2. Static site generation — CONFIRMED (with notes for Claude Code)

### Content model changes

Chapter YAML files in `youproof-org/content` gain two new fields:

- **`published`** (bool) — whether this chapter can be served from
  `youproof.org` (a chapter can have `published: true` even if a counterpart
  still also exists at the legacy `youproof.hu` domain).
- **`legacy-path`** — the chapter's old path on the `youproof.hu` domain, if
  one exists.

### Not found pages

Migrated chapters can link to chapters that aren't migrated yet
(`published: false`). Behavior by case:

| Case | Behavior |
|---|---|
| Target yaml exists, `published: false`, has a `legacy-path` | Next.js generates a not-found page at the target's path, telling the user the chapter isn't migrated yet, with a link to the `youproof.hu` legacy counterpart. |
| Target yaml exists, `published: false`, **no** `legacy-path` | Generic "Sorry" not-found page (no legacy link). |
| Target yaml doesn't exist at all (no file, no generated html for that path) | Same generic "Sorry" not-found page, served via a **CDN-level rule** if Cloudflare supports it for this setup; otherwise a bare 404. |

This means: **every** chapter/article that's referenced anywhere in the
content model — migrated or not — needs a YAML file (at minimum
`published: false` + `legacy-path` if applicable), so Next.js has something
to generate a stub page from. Only genuinely non-existent paths (no YAML at
all) fall through to the CDN-level/bare-404 case.

> Confirmed: for a `published: false` chapter, Next.js generates a static
> page at that chapter's own target path (the same path it would have if
> published), so internal links from migrated chapters resolve to this stub
> instead of a hard 404.

### Worker manifest generation

- **Decision:** the Cloudflare Worker will be **redeployed on every content
  change**, not just on services changes. The earlier idea of a KV-only
  update path (decoupling manifest updates from Worker redeploys) is
  **dropped** — a full Worker redeploy is performed instead, every time. This
  means a `youproof-org/content` merge to `draft` must be able to trigger a
  `services`-repo Worker deploy, not just a content-only site rebuild.
- The manifest is regenerated from every published chapter's `legacy-path`
  field.
- The mapped value (new `youproof.org` path) for a given `legacy-path` is
  derived from that chapter's location in the YAML content model hierarchy
  (book/chapter/section structure).

> **For Claude Code:** this needs further design work before implementation.
> At minimum, work out:
> - The exact algorithm for deriving a chapter's canonical `youproof.org`
>   path from its position in the content hierarchy.
> - How the manifest is bundled directly into the Worker script for each full
>   redeploy (KV is no longer in the picture), including whether manifest
>   size becomes a concern for Worker bundle limits at scale.
> - How to handle edge cases: a `legacy-path` that no longer resolves to any
>   current chapter, duplicate `legacy-path` values across chapters, and a
>   chapter that gets un-published after previously being published (does its
>   manifest entry get removed, or does it 301 to the not-found stub?).

### R2 folder structure

- Generated HTML files are uploaded at deploy time into one of two R2
  buckets: `youproof-staging-content` (staging) or `youproof-production-content`
  (production).
- The folder structure inside each bucket mirrors the URL path structure as
  mapped at the CDN level — i.e. bucket keys correspond directly to request
  paths.
- The generic "Sorry" not-found page is also uploaded into the bucket (so it
  can be referenced as a CDN custom-error/fallback object).
- Cache busting is handled via **automatic CDN cache invalidation at deploy
  time**, not via content-hashed filenames.

Two additional R2 buckets hold test artifacts (one per environment, separate
from the content buckets above):

- **`youproof-staging-test-artifacts`** — holds the test artifacts produced
  for `(stable/staging, draft)` version pairs (see Branching strategy →
  Content/services compatibility rules). These are the artifacts the
  production-promotion CI checks look up before allowing a merge to
  `stable/production` or `stable/released`.
- **`youproof-production-test-artifacts`** — holds test artifacts for the
  currently-deployed `(stable/production, stable/released)` pair. After a
  production release, automatic testing runs against this pair and the
  result determines whether an automatic rollback is triggered (see
  Rollback strategy).

> **For Claude Code:** design the concrete folder/key structure for both
> buckets (e.g. keyed by `services_sha`/`content_sha` pair, timestamp,
> environment), the artifact file format (test report schema — pass/fail per
> suite, summary vs. full detail), and a retention policy (how long artifacts
> are kept, and whether older ones can be pruned once superseded by a newer
> validated pair).

### Search engine indexing

Search engine indexing must be **prevented on staging**
(`staging.youproof.org`) — production should be the only indexable
environment.

> **For Claude Code:** decide the concrete mechanism (e.g. a build-time
> `noindex` meta tag / `robots.txt` disallow-all generated only for the
> staging build, vs. an `X-Robots-Tag: noindex` response header set at the
> CDN level for the staging environment) and make sure whichever approach is
> chosen can't accidentally leak into the production build/config.

---

## 3. Quality gates — CONFIRMED (with notes for Claude Code)

### Staging quality checks

- Runs automatically **after every successful staging deployment**.
- Produces the test artifacts described below, written to
  `youproof-staging-test-artifacts` (see Static site generation → R2 folder
  structure), keyed to the `(stable/staging, draft)` pair that was deployed.
- There's already a crawler implemented for testing the old (legacy
  WordPress) website — this should be used as the starting baseline.

> **For Claude Code:** design a comprehensive test suite covering the whole
> site — link healthiness (internal and external), image accessibility,
> and whatever else makes sense for a static math content site. Use the
> existing legacy-site crawler as a baseline/starting point rather than
> designing from scratch, and propose additional test cases beyond what the
> crawler already covers.

### Production quality checks

Two distinct checks, at two different points in the pipeline:

1. **Pre-merge PR gate.** A mandatory CI check on PRs targeting
   `stable/production` and `stable/released` downloads the test artifact
   from the **last staging deployment** (i.e. the artifact for the relevant
   `(stable/staging, draft)` pair — see Branching strategy) and blocks the PR
   if that artifact indicates any problems. This is the "required status
   check" referenced in the Branching strategy section.
2. **Post-deploy production check.** After a successful production
   deployment, the same test suite used for staging runs again, this time
   against production, producing the same kind of artifact — written to
   `youproof-production-test-artifacts`. If this run indicates any problems,
   it triggers the rollback workflow (see Rollback strategy — not yet
   designed).

### Test result artifacts

Two categories of results, both in JSON:

- **Smoke test / other test suite results** — JSON format (exact schema
  TBD as part of Claude Code's test-suite design above).
- **Comprehensive crawler test results** — JSON format, indicating broken
  internal/external links, missing/non-existing images, etc.

> **For Claude Code:** beyond broken links and missing images, propose
> additional crawler test cases worth covering for a static math knowledge
> base (e.g. malformed math rendering, cross-reference integrity between
> chapters, orphaned pages, redirect-loop detection between the legacy
> redirect worker and `youproof.org`, response time/availability checks).

---

## 4. Infra — CONFIRMED (with notes for Claude Code)

### Redirect worker

- This worker already exists (on the `youproof.hu` zone), but its redirect
  manifest is currently a **hardcoded file in the repository**. This needs to
  change: the manifest should be **generated at deployment time** from the
  content YAML files (see Static site generation → Worker manifest
  generation, and the decision to always fully redeploy the worker rather
  than use KV).

> **For Claude Code:** design how this actually fits into the deployment
> pipeline — concretely, the worker lives in `youproof-org/services`, but the
> data driving its manifest lives in `youproof-org/content`. Work out the
> cross-repository step needed to read/fetch the current content model at
> deploy time, generate the manifest from it, inject it into the worker
> build, and redeploy — and how this interacts with the existing
> `deploy-to-cloudflare` GitHub Actions workflow.

### R2 buckets

Four buckets total, per environment × purpose (all already specified in
earlier sections — listed here for the Infra/Terraform inventory):

- `youproof-staging-content` / `youproof-production-content` — generated HTML
  and static assets (see Static site generation → R2 folder structure).
- `youproof-staging-test-artifacts` / `youproof-production-test-artifacts` —
  test artifacts from the quality-gate test suites (see Quality gates).

### DNS Zone

- Today there's a single `youproof.hu` zone shared by both environments,
  with zone-level security settings and a WWW redirect rule, plus
  per-environment DNS records (`youproof.hu`, `staging.youproof.hu`) within
  that one zone.
- A new, equivalent `youproof.org` zone needs to be created, with the same
  kind of zone-level settings/rules, covering both the staging and
  production environments.
- Within the `youproof.org` zone, per-environment DNS records
  (`youproof.org`, `staging.youproof.org`) point **directly to the CDN** —
  unlike the `youproof.hu` zone, there is no Worker routing on this zone (the
  redirect worker lives entirely on the `youproof.hu` side).

> Note for Claude Code: the existing Terraform layout splits `terraform/zone/`
> (one-time zone setup) from `terraform/worker/` (per-environment, owns DNS
> records + Worker resources). Since the `youproof.org` zone has no Worker,
> confirm whether the per-environment module should be a new
> `terraform/cdn/`-style module (DNS records + CDN config, no Worker
> resources) or whether it makes sense to generalize the existing
> `terraform/worker/` module to optionally omit Worker resources.

### CDN

- No Workers on this zone — just CDN configuration per environment (cache
  rules, purge-on-deploy strategy).
- Cache invalidation must happen automatically **at deploy time** (this is
  also referenced in Static site generation → R2 folder structure, as the
  chosen cache-busting mechanism instead of content-hashed filenames).
- The R2 content buckets store the generated pages as `.html` files, but
  public URLs served through the CDN must **not** expose the `.html`
  extension (e.g. bucket object `some/path.html` must be reachable at
  `youproof.org/some/path`, not `youproof.org/some/path.html`). This needs to
  be handled by the CDN-level path-to-object mapping.

> **For Claude Code:** further investigation needed on the concrete CDN
> setup — e.g. how Cloudflare serves R2 bucket contents as a custom domain
> (R2 custom domains vs. a CDN-level rule mapping paths to bucket objects),
> what cache rules are appropriate for HTML vs. static assets, how the
> custom "Sorry" not-found object gets wired in as a fallback, how the
> `.html`-suffix stripping is implemented (e.g. a Transform Rule/URL rewrite
> mapping request path → `<path>.html` object key, consistently with the
> not-found and not-yet-migrated stub pages also being reachable at
> extensionless paths), and the exact mechanism for deploy-time cache
> invalidation (full zone purge vs. targeted purge of changed paths).

---

## 5. GitHub workflows — CONFIRMED (with notes for Claude Code)

### Cross repository triggers

- `youproof-org/content` is a **private repo on the free GitHub plan**, which
  means no per-environment variables/secrets (GitHub Environments) are
  available there. Because of this, no complex, environment-aware deployment
  or testing logic can live in the `content` repo.
- All complex, environment-dependent deploy/test workflows already live in
  `youproof-org/services` — that doesn't change.
- So the `content` repo's role is limited to **triggering**: a merge to
  `draft` or to `stable/released` should just emit an event recording that
  fact; the actual deployment workflow lives in and is triggered from
  `services`.

> **For Claude Code:** design the concrete triggering mechanism — e.g. a
> lightweight workflow in `content` that fires a `repository_dispatch` (or
> reusable-workflow-call) event to `services` on merges to `draft` /
> `stable/released`, using a repo-level (non-environment) secret/PAT with
> minimal scope. Work out the event payload (which branch merged, resulting
> commit SHA) and how the `services`-repo workflow listens for and
> distinguishes a `draft` merge (→ trigger staging deploy) from a
> `stable/released` merge (→ trigger production deploy).

### Deploy

Synthesizing what's already been decided in Branching strategy, Static site
generation, Quality gates, and Infra:

- **Staging deploy** — triggered by a merge to `stable/staging` (services,
  direct) or a merge to `draft` (content, via the cross-repo trigger above).
  Always builds from the **latest** `stable/staging` + **latest** `draft`.
  Steps, in order:
  1. Regenerate the redirect worker's manifest from the current content
     YAMLs.
  2. Redeploy the whole infra (Terraform apply / worker deploy etc.) for the
     staging environment, **except the DNS zone** (zones are deployed
     separately — Claude Code already knows those details from the existing
     `youproof.hu` zone Terraform).
  3. Build the Next.js static export (using the latest content).
  4. Upload the build output to `youproof-staging-content` (R2).
  5. Invalidate the staging CDN cache.
  6. Kick off staging quality checks (see Testing, below).
- **Production deploy** — triggered by a merge to `stable/production`
  (services, direct) or a merge to `stable/released` (content, via the
  cross-repo trigger). Confirmed to be automatic on merge, mirroring the
  staging trigger exactly. Same step order as staging, against
  `stable/production` + `stable/released`, uploading to
  `youproof-production-content`.

### Testing

Also synthesizing from Quality gates:

- A **staging test job** runs after every staging deploy, executing the
  comprehensive test suite (crawler-based + smoke tests) against the
  `(stable/staging, draft)` pair, writing its artifact to
  `youproof-staging-test-artifacts`.
- A **production test job** runs after every production deploy, same suite,
  against the `(stable/production, stable/released)` pair, writing to
  `youproof-production-test-artifacts` — and triggers the (not-yet-designed)
  rollback workflow if it finds problems.
- A **PR gate job** runs on PRs targeting `stable/production` and
  `stable/released`: downloads the relevant staging test artifact and fails
  the required check if it indicates problems (this is the same check
  described in Branching strategy / Quality gates, just naming it here as
  its own workflow job for completeness).

---

## 6. Rollback strategy

### Trigger

As established in Quality gates / GitHub workflows → Testing: after every
production deploy, the production test job runs the full test suite against
`(stable/production, stable/released)`. If that run indicates problems, it
triggers this rollback workflow. Design of the workflow itself is left to
Claude Code, starting from the open points below.

> **For Claude Code:** design the rollback workflow. Some open points to
> think through as a starting point (not exhaustive):
> - **What "rollback" actually reverts.** Presumably: the R2 production
>   content bucket back to the previous known-good build output, the
>   redirect worker back to its previous manifest/deployment, and a CDN cache
>   invalidation to make the reverted content visible immediately. Confirm
>   whether infra (Terraform-managed resources beyond the worker) also needs
>   reverting, or only content + worker.
> - **What counts as "known-good."** Likely the most recent
>   `(stable/production, stable/released)` pair that has a passing artifact
>   in `youproof-production-test-artifacts` — needs a defined lookup rule for
>   "most recent passing pair before the one that just failed."
> - **Git branch state vs. deployed state.** Does a rollback also move the
>   `stable/production`/`stable/released` branches back (e.g. revert commit),
>   or does it just redeploy old build artifacts while branch history stays
>   forward-only? The latter risks branch state and deployed state diverging;
>   the former interacts with the merge-commit-only / ancestor-tracking
>   invariant from Branching strategy and needs care.
> - **Automatic vs. gated rollback.** Should rollback execute fully
>   automatically on test failure, given it's a production-impacting action,
>   or should it require a manual approval step (e.g. a workflow that
>   prepares the rollback and waits for confirmation)?
> - **Retention.** How many previous production build outputs (and their
>   test artifacts) need to be kept available to roll back to, and for how
>   long — ties into the retention policy already asked of Claude Code for
>   the test-artifact buckets (see Quality gates / R2 folder structure).
> - **Notification.** Who/what gets notified when a rollback is triggered
>   (and separately, if a rollback itself fails).

---

## 7. Cleanup: `infra/cloudflare/README.md`

This document has grown large and now contains a lot of detail specific to
the production cutover performed as part of the previous backlog item —
much of which is no longer relevant now that that cutover is done.

> **For Claude Code:** you already know the details of this document and the
> cutover it documents, so use that context directly. At a high level:
> - Move the document out of `infra/cloudflare/` and into the `docs` folder.
> - Split it into several smaller Markdown files, each covering one distinct
>   topic, rather than one monolithic file.
> - Drop content that's explicitly tied to the one-time production cutover
>   and is no longer relevant now that it's complete.
> - Keep only what's long-term relevant (ongoing architecture/operational
>   reference), reorganized sensibly across the new files.
> - Beyond reorganizing the existing content, **extend this new documentation
>   structure with design topics from this CI/CD pipeline implementation**
>   (branching strategy, deploy flow, quality gates, rollback strategy, etc.)
>   so the `docs` folder becomes the durable, long-term reference for this
>   pipeline going forward — not just a home for the old cutover content.

---

## Open questions / things to confirm as we go

- ~~Does "deploy" under GitHub workflows duplicate or supersede the "Deploy"
  concerns already covered under Static site generation?~~ **Resolved by how
  the doc filled in:** Static site generation describes *what* the manifest/
  R2 layout/cache-busting mean conceptually; GitHub workflows → Deploy
  describes the concrete, ordered CI steps that implement them. No actual
  duplication — they're complementary levels of detail, not competing
  descriptions.
- ~~Relationship between this pipeline and the existing `deploy-to-cloudflare`
  workflow?~~ **Resolved:** the existing `deploy-to-cloudflare` workflow gets
  extended to cover this pipeline, rather than creating a separate one.
