#!/usr/bin/env bash
# Wait for required pull-request checks in one bounded command.
#
# This is a read-only convenience for contributors and agents so a single
# bounded invocation replaces repeated ad-hoc polling. It never creates,
# edits, comments on, re-runs, approves, or otherwise mutates a repository or
# pull request.
#
# Usage:
#   scripts/ci/wait-for-required-checks.sh [PR_NUMBER] [TIMEOUT_SECONDS]
#
# Environment overrides:
#   REQUIRED_CHECKS   Newline-separated check names. Defaults to the stable
#                     branch-protection contexts "CI required" and
#                     "Security required".
#   WAIT_INTERVAL     Poll interval in seconds (default 20).
set -euo pipefail

pr_number="${1:-}"
timeout_seconds="${2:-1800}"
required_checks="${REQUIRED_CHECKS:-$(printf 'CI required\nSecurity required')}"
poll_interval="${WAIT_INTERVAL:-20}"

if ! command -v gh >/dev/null 2>&1; then
  printf 'error: gh CLI is required to wait for required checks\n' >&2
  exit 1
fi

if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || [ "$timeout_seconds" -le 0 ]; then
  printf 'error: timeout must be a positive integer number of seconds\n' >&2
  exit 2
fi

if ! [[ "$poll_interval" =~ ^[0-9]+$ ]] || [ "$poll_interval" -le 0 ]; then
  printf 'error: WAIT_INTERVAL must be a positive integer number of seconds\n' >&2
  exit 2
fi

if [ -z "$pr_number" ]; then
  if ! pr_number="$(gh pr view --json number --jq '.number' 2>/dev/null)"; then
    printf 'error: could not determine the pull request for the current branch\n' >&2
    exit 1
  fi
fi

if ! [[ "$pr_number" =~ ^[0-9]+$ ]]; then
  printf 'error: pull request number must be numeric, got: %s\n' "$pr_number" >&2
  exit 2
fi

printf 'Waiting up to %ss for required checks on PR #%s: %s\n' \
  "$timeout_seconds" "$pr_number" "$required_checks"

deadline=$((SECONDS + timeout_seconds))

while :; do
  # One bounded request per iteration. Only the stable check name and its
  # bucket are read, so the command never depends on optional check metadata.
  if checks="$(
    gh pr checks "$pr_number" --json name,bucket \
      --jq '.[] | "\(.name)\t\(.bucket)"' 2>/dev/null
  )"; then :; fi

  if [ -z "$checks" ]; then
    printf 'notice: no check results yet for PR #%s; retrying\n' "$pr_number"
  else
    missing=""
    failed=""
    while IFS= read -r required; do
      [ -n "$required" ] || continue
      bucket="$(printf '%s\n' "$checks" | awk -F '\t' -v name="$required" '$1 == name { print $2 }')"
      case "$bucket" in
        pass|skipping) ;;
        fail|cancel)
          failed="${failed}${failed:+ }${required}"
          ;;
        *)
          missing="${missing}${missing:+ }${required}"
          ;;
      esac
    done <<< "$required_checks"

    if [ -n "$failed" ]; then
      printf 'error: required check(s) failed on PR #%s: %s\n' "$pr_number" "$failed" >&2
      printf '%s\n' "$checks" >&2
      printf 'Inspect the failure once with: gh pr checks %s\n' "$pr_number" >&2
      exit 1
    fi

    if [ -z "$missing" ]; then
      printf 'All required checks passed on PR #%s.\n' "$pr_number"
      printf '%s\n' "$checks"
      exit 0
    fi

    printf 'Waiting on: %s\n' "$missing"
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    printf 'error: timed out after %ss waiting for required checks on PR #%s\n' \
      "$timeout_seconds" "$pr_number" >&2
    printf 'Inspect the failure once with: gh pr checks %s\n' "$pr_number" >&2
    exit 1
  fi

  remaining=$((deadline - SECONDS))
  sleep_for="$poll_interval"
  if [ "$sleep_for" -gt "$remaining" ]; then
    sleep_for="$remaining"
  fi
  if [ "$sleep_for" -gt 0 ]; then
    sleep "$sleep_for"
  fi
done
