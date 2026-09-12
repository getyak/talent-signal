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
  Use a merge commit, then read back all PR states. #181 is closed as superseded.

## Verification and current state

Baseline main is `942a2d66`, including resident Web PRs #182/#183. Earlier #180
CI attempts failed an unchanged AX5 test: a nil-element Dynamic Type finding and
an Apple audit timeout. These were not waived or interpreted as product proof.
The test now isolates pre/post-confirmation stages into separate required runner
processes, preserving all 21 anchor viewports, all four audit types, long-content
segments and strict issue handling. Independent review passed; native
build-for-testing passed. A local post-confirmation run at `9baddbbf` reproduced
the nil-element Dynamic Type failure, so splitting alone did not resolve it and
auto-merge is disabled. The full post-confirmation test passed locally after moving the result audit
immediately after the real confirmation, before traversing all evidence context
(12 targets, four audit types, 176.4 seconds, no failures or skips). The preceding
successful deadline audit in the original failure also showed the complete result
label. Ordering and geometry both changed; the underlying Apple finding is not
conclusively attributed. No issue filter or coverage was relaxed. Both stages and
current-head CI still require verification.

Local backend verification: Agent 236 passed/1 existing skipped; Backend 407
passed/130 existing skipped. Web complete suite initially passed 490 tests/1
existing skipped before the final revoked-session admission regression; that affected route suite
and typecheck subsequently passed. Account lifecycle evaluation passed all ten
checks in disposable PostgreSQL and is now included in CI. Opik proof remains
version-bound. The local backend was deployed from `9baddbbf`, read back that
exact revision and passed readiness. No new TestFlight release or unrelated Linear acceptance claimed.

## Milestones

1. Complete: inventory, main refresh, integration and conflict resolution.
2. Active: close review findings, verify account isolation and exact-head CI.
3. Pending: gated merge, read back all original PRs, refresh main and deployed
   backend state, then remove temporary registered test artifacts.

## Completion evidence

Final PR head passes every applicable CI/Security gate without unresolved P0/P1;
GitHub reports merged, original useful commits are reachable from main, #181 is
closed with the curated replacement identified, primary main equals origin/main,
and the updated local backend reports ready. PR #180 owns final run/merge links.
