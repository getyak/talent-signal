# CI/CD hardening — merge queue, scope detection, baseline alignment

- Branch: `codex/cicd-hardening`
- Base: `origin/main` at 87ee93fa (merge of PR #177, iOS-only, no CI changes)
- Date: 2026-09-11
- Owner: WorkBuddy supervises and reviews; `pi` (deepseek-flash) implements.

## Outcome

Remove the "every merge forces every PR to rebase" pain and remove the
silent iOS-scope drift between CI and Security, without weakening the
documented required settings. After landing, one tested script owns change
scope, merge queue replaces the strict-up-to-date rebase loop, and the two
aggregator contexts stay the only required branch checks.

## In scope

1. `merge_group` trigger and concurrency tuning in CI and Security.
2. A single tested `scripts/ci/compute-ios-base.sh` that owns the
   cumulative-trusted-release baseline logic, called by both CI and
   Security.
3. Range gating in CI for `web` / `backend` / `phase-one`: skip when the
   path diff does not touch that bucket; fail-safe (return true) for any
   shared or unknown path so we never silently under-test.
4. `persist-credentials: false` on every CI and Security checkout, matching
   the existing release-ios pattern that the policy test already asserts.
5. `docs/operations/ci-cd.md` updated for merge queue, scope gating, shared
   detection.
6. A `merge_queue` rule added to the existing `main protection` ruleset,
   with all current rules preserved.

## Out of scope

- macOS app CI coverage (P2; separate follow-up).
- actionlint upgrade and removal of the `macos-26` ignore (P2).
- Dependabot cooldown / grouping changes.
- Renaming or removing the `CI required` / `Security required` aggregators
  or changing the required-status-checks list.

## Evidence

- Ruleset `main protection` (id 20372192) currently lists only `deletion`,
  `non_fast_forward`, `pull_request`, and `required_status_checks` with
  `strict_required_status_checks_policy: true`. No `merge_queue` rule.
- PR #177 was `BEHIND` on main at planning time.
- `ci.yml` `changes` resolves the cumulative trusted-release baseline
  inline; `security.yml` `changes` passes `github.event.before` directly,
  with no cumulative baseline.
- `scripts/ci/has-ios-changes.sh` is invoked from both workflows with
  `--ci-files`. Its existing surface must stay stable to keep
  `scripts/ci/ios-release-policy.test.mjs` "classify" tests green.
- `scripts/ci/ios-release-policy.test.mjs` enforces structural regexes on
  the workflow files (`web` adjacency to repository's advisory step;
  `ios` adjacency to `required`; `codeql-swift` adjacency to `required`;
  the exact "Select latest trusted TestFlight release" / "No trusted
  TestFlight release receipt" strings). Every workflow edit must keep
  these green.

## Approach

Single tested baseline helper + thin workflow wiring. Detect once in the
`changes` job, gate many. Aggregators stay unchanged.

## Milestones

### M1 — Shared baseline script + tests

- New `scripts/ci/compute-ios-base.sh` (bash, `set -euo pipefail`):
  accepts `--event NAME`, `--ref NAME`, `--base SHA`, `--head SHA`,
  `--trusted-tag TAG`; prints the SHA to feed into
  `has-ios-changes.sh`. Returns `$base` for `pull_request`, `merge_group`,
  and `workflow_dispatch`; returns the trusted-tag commit for
  `push` to `main` when a trusted tag is supplied; returns empty
  otherwise (so `has-ios-changes.sh` short-circuits to "true").
- New `scripts/ci/compute-ios-base.test.mjs` covering all six cases.
- Self-verify: `bash -n scripts/ci/compute-ios-base.sh`, `node --test
  scripts/ci/compute-ios-base.test.mjs`.

### M2a — ci.yml + security.yml adopt the baseline + merge_group + persist-credentials

- Add `merge_group` trigger to both workflows. Leave the `concurrency:`
  block unchanged.
- In each `changes` job, replace the inline cumulative baseline with the
  call to `compute-ios-base.sh`, keeping the exact strings the policy
  test asserts (`Select latest trusted TestFlight release`,
  `LATEST_TESTFLIGHT_TAG`, `selectLatestTestFlightRelease`,
  `No trusted TestFlight release receipt; requiring iOS checks`).
- In security.yml, add the matching `Select latest trusted TestFlight
  release` step before the Swift scope detection.
- Add `persist-credentials: false` to every `actions/checkout` step in
  CI and Security, not to other actions.
- Self-verify: `node --test scripts/ci/ios-release-policy.test.mjs`
  stays fully green. No workflow reorder, no new jobs.

### M2b — Path-bucket gating in ci.yml

- New `scripts/ci/detect-bucket-changes.sh` (bash, `set -euo pipefail`)
  with the path map for `web`, `backend`, `phase-one`, a shared-path
  list that forces every bucket true, and a fail-safe that forces
  every bucket true when the diff contains any unknown path. Emits
  `key=value` lines consumable by `GITHUB_OUTPUT`.
- New `scripts/ci/detect-bucket-changes.test.mjs` covering: each
  bucket alone, the shared-path case, the unknown-path fail-safe, the
  no-change case.
- Extend ci.yml's `changes` job to emit `web`, `backend`, `phase-one`
  outputs via the new script, and gate the three jobs with `if:
  needs.changes.outputs.X == 'true'`. Keep `repository` unconditional
  and keep the structural adjacency (`web` after repository's advisory
  step; `ios` directly before `required`).
- Self-verify: the new node test plus the policy test.

### M3 — docs

- Update `docs/operations/ci-cd.md`: design diagram note, workflow
  inventory row for `merge_group`, required GitHub settings entry for the
  merge queue rule, failure-and-recovery entry.
- Self-verify: `node scripts/check-docs.mjs`.

### M4 — Local gate + commit + push

- `bash -n scripts/ci/compute-ios-base.sh`.
- `node --test scripts/ci/compute-ios-base.test.mjs scripts/ci/ios-release-policy.test.mjs`.
- `shellcheck scripts/ci/*.sh`.
- `./scripts/ci/check-actions-pinned.sh`.
- actionlint via `scripts/ci/install-actionlint.sh`.
- `node scripts/check-docs.mjs`.
- Commit on `codex/cicd-hardening` and push to `origin`.

### M5 — Ruleset + PR + CI green

- Read the full ruleset 20372192, add the `merge_queue` rule, PUT back,
  read again to confirm.
- Open PR from `codex/cicd-hardening` to `main`.
- Watch CI and Security to green; if red, debug and `gh run rerun --failed`.

## Completion

- `CI required` and `Security required` report success on the PR.
- Ruleset diff shows the new `merge_queue` rule with all prior rules
  preserved.
- The targeted node tests and `check-docs` pass.
- `docs/operations/ci-cd.md` reflects the new structure.

## Risks and decisions

- `pi`'s deepseek provider is the only one ready. If `pi` stalls or fails
  mid-run, WorkBuddy finishes the milestone by hand and records the
  handover in this plan and in REVIEW.md.
- The ruleset PUT replaces the full rules array. We read it first, append
  `merge_queue`, and write back, then re-read to verify, so the only
  effective diff is the new rule.
- Path gating is fail-safe: any path not in an explicit bucket forces
  every gated job to true, so a mis-bucketed path causes over-testing,
  never under-testing.
- `pi` writes only the files listed per milestone. It does not commit,
  push, or modify the ruleset. Those are WorkBuddy actions.