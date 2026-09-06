# Local work preservation and remote synchronization

Status: verified; remote preservation pending
Owner: Codex
Started: 2026-09-07

## Outcome and boundary

Preserve useful unpublished source, tests, prompt assets, operational knowledge,
and curated synthetic evidence on a reviewable remote branch. Exclude dependency
caches, machine-local configuration, raw runner output, and superseded copies.
Do not replace newer shipped behavior with an older local implementation.
No production deployment or direct update to `main` is part of this task.

## Evidence and approach

- Initial checkout: `codex/add-ios-action-button-capture` at `c7c5495`; its remote
  branch has been deleted. Remote main is `773979a` after fetching.
- Initial status: 151 modified tracked files and 750 untracked files (about
  93 MB). Most untracked bytes are evaluation images; size alone does not decide
  whether evidence is useful.
- Many local changes have already shipped through later squash merges. Compare
  file contents with remote main before selecting changes.
- Inspect other registered worktrees and stashes for distinct unpublished work.
  Preserve other working directories in place.
- Keep reusable evidence and source inputs in their existing knowledge layers;
  ignore only clearly reproducible or transient material.

## Milestones

1. Complete: audit current files, other worktrees, and remote equivalence.
2. Complete: preserve useful changes and integrate remote main without reverting
   shipped behavior.
3. Complete: verify source, documentation, secret boundaries, and ignored output.
4. Active: commit, push, and independently verify the remote branch tip.

## Preservation decisions

- `c15da09` preserves the original useful working state before integration.
- The integrated branch is `codex/preserve-local-work-20260907`. The actual new
  product slice is bundled prompt source, immutable task/experiment snapshots,
  prompt import/mirroring tooling, and their tests and operational evidence.
- Newer main owns all iOS code, CI/release configuration, readiness migration
  checks, proposed extracted-text authority, and tightened resource schemas.
  The final iOS, CI, and release-script diff against main is empty.
- Retain the two new source records, prompt ADR/playbook, and synthetic MX-01
  design review. The review's previously machine-local prototype now has 54
  preserved source/asset files and a manifest; all six primary V8 hashes match.
  Its deployment identity and local npm configuration are excluded. This does
  not upgrade the historical review to a release or real-human result.
- Stop tracking 235 raw log, xcresult, and superseded binary-archive files
  (7,202,243 bytes), retaining every original file locally. Keep the historical
  frozen source archive and decisive verifier log because other records depend
  on them. Existing curated manifests, screenshots, and review records remain.
- Ignore pnpm stores and Playwright result/report directories. Existing Next
  output rules remain. The Infisical source inventory now excludes `.next-*`
  output just as it excludes `.next`, avoiding third-party bundle false positives.
- Other registered worktrees were inspected without modification. The only
  additional dirty tree, `/private/tmp/talent-signal-scroll-continuity`, contains
  earlier Lab/scroll integration drafts (39 tracked changes, 40 untracked files)
  and introduces no file absent from the current source tree. Its existing local
  state remains available; historical squash-merged topic branches were not
  republished. There is no stash.

## Verification

- Backend CI passed: Agent 57 tests; backend 338 tests, with nine database tests
  separately verified against a disposable PostgreSQL 18 container (9/9).
  The test database and its container were removed afterward.
- Agent Host typecheck, 34 tests, and build passed.
- Web lint, typecheck, 328 tests, and production build passed. One existing Web
  test remains skipped. The initial production build lacked `AUTH_SECRET`; the
  successful rerun used the same build-only placeholder as repository CI.
- Evaluation library 22 tests and evaluation runner 48 tests passed.
- Prompt CLI/Wiki tests passed 13/13; secret contract tests passed 18/18 after
  the generated-directory correction. The repository credential scan passed.
- Documentation, Wiki consistency, and architecture diagrams passed both in
  the working tree and in a fresh export containing only staged Git files.
- Preserved prototype runtime hashes, study evidence logic, TypeScript/Vite
  compilation, and three static-worker behavior tests passed. The separate
  Sites packaging test requires excluded hosting configuration; its initial
  missing-package-output failure is not presented as a passing deployment test.
- iOS source is identical to remote main, so no new native execution claim is
  made for this preservation task.

## Local service limitation

The backend directory's `AGENTS.md` requires local TestFlight redeployment after
backend changes. The standard deployment script was attempted, but Infisical
reported no valid login and exited before building or changing services.
This does not block source preservation. Local service redeployment remains
unverified until the owner restores the normal Infisical login session.

## Completion evidence

Record selected and excluded categories, actual checks and limitations, the
remote branch, and destination readback. A backup commit does not certify a
feature release. Re-plan if an artifact contains private evidence or a local
change conflicts with newer remote behavior.
