# Integrate useful pull requests

## Outcome and boundary

Update the primary checkout to main; assess every open PR, merge valuable changes
through repository gates, and close superseded or unsuitable proposals. Preserve
original commits, unrelated worktrees and `.workbuddy/`. Do not bypass checks.

## Decisions

- #176: retain protected test-workspace return recovery and visible navigation.
- #164 and #162: retain pinned pnpm action and Fastlane maintenance updates.
- #169: retain account settings and isolated Web test workspaces; resolve conflicts
  without removing newer Harness behavior or blocking global navigation on Lab or
  account-settings requests. Review found scope and readiness gaps; regression
  tests cover stale tabs, revoked sessions, stale actors and missing migrations.
- #184: retain Session title strategy. Address frozen legacy prompt transport and
  invalid optional metadata findings while preserving body and citation checks.
- #181: superseded by compatible updates carried in #180: Claude SDK 0.3.266,
  Node types 26.5, S3 and jose. Hold Opik at the tested SDK/server version 2.2.45;
  its proposed upgrade lacks matching runtime proof. Historical proof is unchanged.
- #180: one integration PR with original #176/#164/#162/#169/#184 histories.
  Use a merge commit, then read back all PR states and close #181 as superseded.

## Verification and current state

Baseline main is `942a2d66`, including resident Web PRs #182/#183. Earlier #180
CI attempts failed an unchanged AX5 test: a nil-element Dynamic Type finding and
an Apple audit timeout. These were not waived or interpreted as product proof.
The test now isolates pre/post-confirmation stages into separate required runner
processes, preserving all 21 anchor viewports, all four audit types, long-content
segments and strict issue handling. Independent review passed; native
build-for-testing passed. Runtime success still requires current-head CI.

Local backend verification: Agent 236 passed/1 existing skipped; Backend 407
passed/130 existing skipped. Web complete suite initially passed 490 tests/1
existing skipped before the final revoked-session admission regression; that affected route suite
and typecheck subsequently passed. Account lifecycle evaluation passed all ten
checks in disposable PostgreSQL and is now included in CI. Opik proof remains
version-bound. No new TestFlight release or unrelated Linear acceptance claimed.

## Milestones

1. Complete: inventory, main refresh, integration and conflict resolution.
2. Active: close review findings, verify account isolation and exact-head CI.
3. Pending: gated merge, close superseded PR, refresh main, redeploy the local
   backend as required by its AGENTS.md, read back final state and remove temporary
   registered test artifacts.

## Completion evidence

Final PR head passes every applicable CI/Security gate without unresolved P0/P1;
GitHub reports merged, original useful commits are reachable from main, #181 is
closed with the curated replacement identified, primary main equals origin/main,
and the updated local backend reports ready. PR #180 owns final run/merge links.
