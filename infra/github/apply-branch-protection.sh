#!/usr/bin/env bash
#
# YP-120 branch-protection applier (REFERENCE — review before running).
#
# NOT executed by any workflow. Run locally with a token that has admin on all
# three repos: youproof-org/services, youproof-org/content, youproof-org/editor:
#
#   GH_TOKEN=<admin PAT> ./apply-branch-protection.sh
#
# What it does (see infra/github/branch-protection.md for rationale):
#   1. Disables squash + rebase merging repo-wide on both repos (merge-commit-only).
#   2. Requires the relevant status checks + PR reviews on the protected branches
#      (zone-purity on all three services lane branches; source-branch on
#      stable/staging + stable/production; artifact-gate on the production
#      targets), and blocks direct pushes on every protected branch.
#
# It does NOT create secrets/vars. Source-branch restriction (GitHub can't do it
# natively) is enforced by the REQUIRED `source-branch` check from
# .github/workflows/branch-source-guard.yml, which this script marks required on
# stable/staging and stable/production. Idempotent: re-running re-asserts the same.
set -euo pipefail

SERVICES="youproof-org/services"
CONTENT="youproof-org/content"
EDITOR="youproof-org/editor"

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

# 2) Protect a branch: PR-only (no direct push), and zero or more required checks.
#    $1 repo  $2 branch  $3.. required-check-names (none = no required checks)
protect_branch() {
  local repo="$1" branch="$2"; shift 2
  local checks=("$@")
  echo ">> ${repo}@${branch}: protect (required checks: ${checks[*]:-none})"

  local checks_json='{"strict":true,"checks":[]}'
  if [ "${#checks[@]}" -gt 0 ]; then
    local items=""
    for c in "${checks[@]}"; do
      items="${items:+${items},}{\"context\":\"${c}\"}"
    done
    checks_json="{\"strict\":true,\"checks\":[${items}]}"
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
# zone-purity (job in .github/workflows/zone-purity-guard.yml) runs on PRs into
# ALL THREE lane branches and blocks any PR that would make the eventual
# stable/production promotion mix a terraform/zone/ change with non-zone changes.
set_merge_policy "$SERVICES"
protect_branch "$SERVICES" "development"       "zone-purity"
# source-branch (job in .github/workflows/branch-source-guard.yml) enforces RULE 1:
# stable/staging may only be merged FROM development.
protect_branch "$SERVICES" "stable/staging"    "source-branch" "zone-purity"
# artifact-gate is the RULE 2 required check (job in .github/workflows/pr-gate.yml);
# source-branch enforces RULE 2's source restriction (only FROM stable/staging).
protect_branch "$SERVICES" "stable/production" "artifact-gate" "source-branch" "zone-purity"

# --- content ------------------------------------------------------------------
set_merge_policy "$CONTENT"
protect_branch "$CONTENT" "draft"
# artifact-gate = RULE 3 pairing check; source-branch (content's branch-source-guard.yml)
# enforces RULE 3's source restriction: stable/released only FROM draft.
protect_branch "$CONTENT" "stable/released" "artifact-gate" "source-branch"

# --- editor -------------------------------------------------------------------
# The editor is NOT part of the (services, content) artifact/ancestor model, so
# no merge-commit-only requirement. It only enforces its promotion source via its
# own branch-source-guard.yml: stable/released only FROM development.
protect_branch "$EDITOR" "development"
protect_branch "$EDITOR" "stable/released" "source-branch"

echo "Done. NOTE: required_linear_history stays FALSE on purpose — merge commits"
echo "are required (their second parent is the ancestor-tracking anchor)."

# --- Source-branch enforcement (implemented) ----------------------------------
# GitHub cannot restrict which branch a PR is merged FROM natively, so the
# `source-branch` check (.github/workflows/branch-source-guard.yml) asserts it in
# CI and is marked REQUIRED above:
#   - stable/production may only be merged FROM stable/staging
#   - stable/staging   may only be merged FROM development
# The content repo's draft -> stable/released source restriction is still only
# covered by its artifact-gate pairing check; add an analogous branch-source
# guard there if a hard assertion is wanted.
