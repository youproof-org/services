#!/usr/bin/env bash
#
# YP-120 branch-protection applier (REFERENCE — review before running).
#
# NOT executed by any workflow. Run locally with a token that has admin on BOTH
# youproof-org/services and youproof-org/content:
#
#   GH_TOKEN=<admin PAT> ./apply-branch-protection.sh
#
# What it does (see infra/github/branch-protection.md for rationale):
#   1. Disables squash + rebase merging repo-wide on both repos (merge-commit-only).
#   2. Requires the artifact-gate status check + PR reviews on the promotion
#      target branches, and blocks direct pushes on every protected branch.
#
# It does NOT create secrets/vars or restrict PR source branches (GitHub can't do
# the latter natively — see the runbook; the artifact-gate check enforces the
# real constraint). Idempotent: re-running just re-asserts the same settings.
set -euo pipefail

SERVICES="youproof-org/services"
CONTENT="youproof-org/content"

require_gh() {
  command -v gh >/dev/null || { echo "gh CLI required"; exit 1; }
}

# 1) Merge-commit-only, repo-wide.
set_merge_policy() {
  local repo="$1"
  echo ">> ${repo}: merge-commit-only"
  gh api -X PATCH "repos/${repo}" \
    -F allow_merge_commit=true \
    -F allow_squash_merge=false \
    -F allow_rebase_merge=false >/dev/null
}

# 2) Protect a branch: PR-only (no direct push), and optionally a required check.
#    $1 repo  $2 branch  $3 required-check-name (empty = none)
protect_branch() {
  local repo="$1" branch="$2" check="${3:-}"
  echo ">> ${repo}@${branch}: protect (required check: ${check:-none})"

  local checks_json='{"strict":true,"checks":[]}'
  if [ -n "$check" ]; then
    checks_json="{\"strict\":true,\"checks\":[{\"context\":\"${check}\"}]}"
  fi

  # PUT /repos/{repo}/branches/{branch}/protection — full protection object.
  gh api -X PUT "repos/${repo}/branches/${branch}/protection" \
    --input - >/dev/null <<JSON
{
  "required_status_checks": ${checks_json},
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
}

require_gh

# --- services -----------------------------------------------------------------
set_merge_policy "$SERVICES"
protect_branch "$SERVICES" "development"       ""
protect_branch "$SERVICES" "stable/staging"    ""
# artifact-gate is the RULE 2 required check (job name in .github/workflows/pr-gate.yml).
protect_branch "$SERVICES" "stable/production" "artifact-gate"

# --- content ------------------------------------------------------------------
set_merge_policy "$CONTENT"
protect_branch "$CONTENT" "draft"           ""
# artifact-gate is the RULE 3 required check (job name in the content repo's pr-gate.yml).
protect_branch "$CONTENT" "stable/released" "artifact-gate"

echo "Done. NOTE: required_linear_history stays FALSE on purpose — merge commits"
echo "are required (their second parent is the ancestor-tracking anchor)."

# --- OPTIONAL: source-branch enforcement (NOT natively supported) -------------
# GitHub cannot restrict which branch a PR is merged FROM. The artifact-gate
# check already blocks wrong-source promotions (no matching validated pair). If
# you additionally want a hard source-branch assertion, add a one-step job to
# each pr-gate.yml, e.g.:
#
#   if [ "${{ github.head_ref }}" != "stable/staging" ]; then
#     echo "::error::stable/production may only be merged from stable/staging"; exit 1
#   fi
#
# (and the analogous draft -> stable/released check in the content repo).
