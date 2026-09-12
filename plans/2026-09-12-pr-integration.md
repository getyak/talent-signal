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
conclusively attributed. No issue filter or coverage was relaxed. Both stages then passed together (2 tests,
266.125 seconds, no failures or skips). Current-head CI still requires verification.

Local backend verification: Agent 236 passed/1 existing skipped; Backend 407
passed/130 existing skipped. Web complete suite initially passed 490 tests/1
existing skipped before the final revoked-session admission regression; that affected route suite
and typecheck subsequently passed. Account lifecycle evaluation passed all ten
checks in disposable PostgreSQL and is now included in CI. Opik proof remains
version-bound. The local backend was deployed from `9baddbbf`, read back that
exact revision and passed readiness. No new TestFlight release or unrelated Linear acceptance claimed.

A subsequent GitHub P1 identified bare telemetry fetches before the protected Ask
request. Trace create, batch and completion now use the rendered workspace guard;
a regression exercises private text/files and an effective-account switch, with
no cross-account writes and three expiry signals. The operational boundary now
explicitly includes telemetry. A bound request with missing primary claims also
fails closed rather than enabling local fixture fallback. Both P1 findings were
independently closed; the complete Web suite passed 499 tests (one existing skip),
with typecheck and focused lint passing. Fixture tests now explicitly supply
unbound request headers. The hosted iOS job allows 60 minutes because a cold
observed run reached AX5 only after about 32 minutes; audit coverage, timeout
classification and retry limits are unchanged.

The missing-scope screenshot P1 is also closed: screenshot processing and all
telemetry mutations reject absent/empty workspace headers before reading payloads.
The account-event P2 is fixed by additive migration `069_account_access_event_details`
and atomic structured target/transition details, preserving historical unknowns.
Independent review passed. Disposable PostgreSQL passed all 14 checks; Agent
236 passed (one existing skip), Backend 408 passed (130 existing skips), Web
499 passed (one existing skip), typecheck/lint and docs passed. Pi reached its
bounded turn limit; the parent inspected and completed its source patch and
corrected the explicit-session evaluation before testing. No worker-generated
dependencies or build artifacts were copied.

A final old-client audit found that an already-issued screenshot receipt could
still reach an unbound commit route. A Next.js API ingress guard now requires
rendered scope on workspace mutations, with existing login/demo/extension
boundaries preserved. The exact extension handoff retains mandatory pre-body
session-fingerprint validation. Independent review closed the compatibility P1;
full Web tests passed 518 (one existing skip), with typecheck/lint passing.
The production build and current-head gates remain required.

Standalone contact pages now share the authenticated workspace layout and test
banner. Missing or blank client scope fails before network access. API ingress
also rejects unbound task-history reads from older JavaScript, preserving the
installed extension's session-bound create/readback/keyed-recovery transports.
Native resource links and streams retain their existing route authority.
Artifact inventory and downloads carry the workspace identifier. Missing-primary
leave recovery clears the local test cookie and opens login without claiming a
remote leave; remote failures retain retry state. Independent review passed; full Web tests passed 535 with one existing skip.
Typecheck, lint and docs passed; current-head CI and production activation remain required.

During final CI, #184 advanced to `a51ab5a5`. Independent review rejected its
blanket nil-element Dynamic Type waiver: it records an unadjudicated failure as
a successful audited viewport. The original title functionality through
`4c1abe56` remains integrated; the new waiver and unrelated color adjustment are
not adopted. A newly reported title-schema P2 is fixed: optional title metadata
uses Unicode code-point bounds and invalid metadata cannot discard a valid reply.
Independent review passed; Agent 238 passed (one existing skip), Backend 408
passed (130 existing skips), and Agent typecheck/build passed.

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
