# CI and TestFlight reliability

## Outcome

Make iOS pull requests and `main` delivery complete predictably without losing
unreleased iOS changes when a newer non-iOS commit cancels an older CI run.
Completion is observable when the policy tests, workflow validation,
documentation checks, and a real GitHub run prove the bounded gate and the
cumulative release decision.

## Boundary

In scope: GitHub Actions policy, iOS test selection, release classification,
operational documentation, and recovery of the already verified remote `main`
revision into internal TestFlight. Out of scope: changing signing ownership,
weakening the TestFlight environment, exposing the backend publicly, or
publishing local uncommitted iOS work.

## Evidence and diagnosis

- `main` CI run `33227610125` tested iOS commit `75ff39b` but was cancelled
  after 16 minutes by non-iOS commit `7981df7`.
- Replacement CI run `33228248774` passed in 2 minutes 54 seconds and skipped
  iOS because it compared only `75ff39b..7981df7`.
- Release run `33228377934` then compared only the latest commit with its
  parent and skipped publication. The latest successful release remains
  `v0.1.14` at `dbc2152`; `v0.1.14..main` contains iOS product changes.
- Successful iOS run `33176082888` spent about 45 minutes in the iOS job. Its
  script started a fresh XCTest process for 61 UI journeys; the current suite
  contains 80 journeys.
- Swift CodeQL run `33176082824` spent about 33 minutes on its macOS job,
  including about 30 minutes in another clean Swift build.
- A successful TestFlight run itself (`33179753593`) took about 9 minutes. The
  archive, upload, and Apple processing step took about 7 minutes, so TestFlight
  transport is not the dominant delay.

## Approach

1. Use the latest successful semantic release as the cumulative baseline for
   both main CI scope and automatic release scope.
2. Keep the blocking iOS gate to Release compilation, full unit coverage, and
   an auditable bounded UI smoke set. Preserve all isolated UI journeys behind
   the existing CI workflow's explicit `full` dispatch mode.
3. Run Swift CodeQL after merge and on schedule/manual dispatch instead of
   duplicating the slow Swift build in every pull request.
4. Verify policy locally, then use a real branch run to measure the new gate.
   Publish the pre-existing remote `main` only after its already-running full
   iOS verification succeeds.

## Milestones

- [x] Diagnose the cancellation, classification, and duration evidence.
- [x] Implement cumulative release detection and bounded iOS smoke policy.
- [x] Move Swift CodeQL out of pull-request blocking latency.
- [x] Pass workflow, policy, documentation, and focused iOS checks.
- [ ] Prove the branch CI duration and recover current `main` to TestFlight.

## Reconsideration signals

- A smoke journey becomes flaky or starts performing an external write.
- Full regression finds defects that the smoke boundary should deterministically
  catch.
- TestFlight tags cease to represent every successful internal release.
- External TestFlight or App Store distribution replaces the internal delivery
  boundary.
