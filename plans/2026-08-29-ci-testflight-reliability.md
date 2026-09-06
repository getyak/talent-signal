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
- Release run `33820354814` uploaded two `0.1.43` binaries, but Fastlane's
  processing watcher obscured the terminal reason behind a later DNS failure.
  Direct read-only build-upload queries proved both exact builds failed with
  Apple code `90626`: the App Intent description contained the prohibited
  device name `iPhone`.
- Recovery run `33229455837` reached the Mac by Tailscale ping but its first
  end-to-end authentication POST never reached the healthy API. Treat that
  local-host network path as intermittently available and retry only the
  pre-signing contract probe within a short bounded window.
- A hand-created `v0.1.17` GitHub Release pointed at `ca02b25` with no IPA while
  App Store Connect still reported `0.1.16 (20260829054418)`. The automatic
  decision treated any non-draft semantic GitHub Release as TestFlight proof,
  compared `v0.1.17..ca02b25`, and skipped the upload. A semantic tag is not a
  release receipt.
- PR run `33229201916` completed the new iOS release smoke in 20 minutes 29
  seconds, versus roughly 52 minutes for the equivalent old full gate.

## Approach

1. Use the latest automation-owned TestFlight receipt as the cumulative
   baseline for both main CI scope and automatic release scope.
2. Keep the blocking iOS gate to Release compilation, full unit coverage, and
   an auditable bounded UI smoke set. Preserve all isolated UI journeys behind
   the existing CI workflow's explicit `full` dispatch mode.
3. Run Swift CodeQL after merge and on schedule/manual dispatch instead of
   duplicating the slow Swift build in every pull request.
4. Bound retries around the tailnet API contract probe before signing; never
   retry archive/upload blindly.
5. Verify policy locally, then use a real branch run to measure the new gate.
   Publish the pre-existing remote `main` only after its already-running full
   iOS verification succeeds.
6. Admit a release as the cumulative baseline only when GitHub Actions owns it
   and it carries both the uploaded IPA and a machine-readable receipt created
   after Apple processing. Treat missing proof conservatively as unreleased.
7. Archive, attest, and retain the exact IPA before upload. Upload from a
   separate retryable job that first checks whether Apple already has that exact
   version/build, then independently polls the build-upload API to `VALID`.
   Keep receipt, tag, and prerelease creation in a final idempotent job.

## Milestones

- [x] Diagnose the cancellation, classification, and duration evidence.
- [x] Implement cumulative release detection and bounded iOS smoke policy.
- [x] Move Swift CodeQL out of pull-request blocking latency.
- [x] Pass workflow, policy, documentation, and focused iOS checks.
- [x] Replace semantic-tag inference with an automation-owned TestFlight
      receipt and prove the false-Release regression locally.
- [x] Diagnose the `0.1.43` Apple rejection, correct the App Intent metadata,
      and split archive, upload, processing, and finalization into recoverable
      stages with focused policy coverage.
- [x] Prove the branch CI duration and recover current `main` to TestFlight.

## Reconsideration signals

- A smoke journey becomes flaky or starts performing an external write.
- Full regression finds defects that the smoke boundary should deterministically
  catch.
- TestFlight tags cease to represent every successful internal release.
- External TestFlight or App Store distribution replaces the internal delivery
  boundary.

## Verification evidence

- `node --test scripts/ci/ios-release-policy.test.mjs`: 14 passed, including
  manual-owner, missing-IPA, missing-receipt, and receipt-payload coverage.
- `check-actions-pinned.sh`, `actionlint`, Bash syntax checks, and
  `pnpm docs:check`: passed on 2026-08-29.
- Recovery policy on 2026-09-04: 18 focused tests passed, including exact-build
  selection, transient lookup retry, terminal Apple rejection, device-neutral
  App Intent metadata, retained-IPA ordering, and tag/release retry behavior;
  `actionlint`, Ruby/Node syntax, documentation, and whitespace checks passed.
- PR CI run `33831493658` passed the complete branch gate, including the iOS
  release smoke in 16 minutes 4 seconds. Main CI run `33832521720` passed the
  same iOS gate on merge commit `ae88dd1` in 27 minutes 49 seconds.
- Release run `33834238182` archived, attested, and retained the exact IPA before
  upload; App Store Connect then reported `0.1.43 (20260904034421)` as `VALID`
  before the workflow created `v0.1.43`, its IPA, and the matching machine
  receipt. Read-only access audit `33834991269` confirmed that exact build is
  the latest valid build in the all-builds internal group with server access
  ready and no repair or invitation resend.
- The live GitHub release inventory selected no trusted baseline: `v0.1.17`
  and `v0.1.16` have no assets, while bot-owned `v0.1.15` has an IPA but no
  post-processing receipt. This is the intended conservative recovery state.
