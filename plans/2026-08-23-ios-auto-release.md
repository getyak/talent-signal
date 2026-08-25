# iOS automatic TestFlight delivery

## Outcome

Make a verified `main` push that changes iOS release inputs automatically:

1. pass repository CI;
2. select the next unused semantic patch version;
3. archive with isolated signing assets;
4. upload and finish App Store Connect processing;
5. make the build available to an internal TestFlight group;
6. create the matching Git tag, GitHub prerelease, attestation, and retained IPA.

Completion is observable only after a real workflow run succeeds, the same
version and build are visible in App Store Connect, and an invited phone can
install or update it through TestFlight.

## Boundaries

- Automatic delivery targets internal TestFlight, not public App Store
  production. Public customer release still requires complete store metadata,
  App Review, account agreements, and an explicit release decision.
- Only a successful `main` CI run may publish. Pull requests and forked runs
  cannot access signing material.
- Signing assets remain encrypted by fastlane match. CI receives a dedicated
  read-only deploy key; certificate or profile creation remains an explicit
  maintainer operation.
- Existing uncommitted iOS product work in the shared worktree is user-owned.
  CI/CD changes are isolated in `/tmp/talent-signal-ios-auto-release` on
  `codex/ios-auto-release`.
- Secret values must not appear in the repository, plan, logs, or chat.

## Current evidence and unknowns

- Historical jobs [v0.1.1](https://github.com/getyak/talent-signal/actions/runs/30874253106)
  and [v0.1.2](https://github.com/getyak/talent-signal/actions/runs/30887750363)
  completed their `Upload to TestFlight` jobs successfully.
- The replacement workflow added a required `testflight` environment reviewer.
  Run [31017477756](https://github.com/getyak/talent-signal/actions/runs/31017477756)
  waited for approval from 2026-08-05 until it was cancelled on 2026-08-23;
  later runs were coalesced behind the same global concurrency group.
- The stale waiting run was cancelled and the required reviewer was removed on
  2026-08-23. The environment still allows only `main` deployments.
- All eight required Actions secret names exist at repository scope, but their
  present values cannot be read back from GitHub.
- `getyak/talent-signal-certs` is private and contains only the encrypted
  distribution certificate plus the Talent Signal App Store profile copied
  from the private DayPage match repository. GitHub's `testflight` environment
  now targets it with a dedicated read-only v2 deploy key. The retired key was
  revoked and both local key copies were removed after the real release proof.
  The temporary `master` compatibility ref was removed after the pinned `main`
  configuration completed a fresh automatic release.
- The former fastlane lane used `skip_waiting_for_build_processing: true`,
  which proved upload acceptance but not tester availability. The merged lane
  now waits for build processing and supplies release notes before returning
  success.
- App Store Connect contains Talent Signal under Apple ID `6797632577`.
  Version 0.1.4 build `20260823181851` is processed and assigned to the
  `Talent Signal Internal` and `telepace` groups.
- The `Talent Signal Internal` group is configured for automatic distribution
  of Xcode builds. Access run
  [32680106925](https://github.com/getyak/talent-signal/actions/runs/32680106925)
  proved that its one tester is an active App Store Connect user with no pending
  team invitation, belongs to the internal group, and can access valid 0.1.5
  build `20260823190119`. The tester remains `Invited` with zero known devices;
  the invitation was resent through Apple's API on 2026-08-24. App Store
  Connect still shows no install or session evidence, so device delivery is not
  proved.
- App Store Connect has four active team keys. Release iOS run
  [32657034237](https://github.com/getyak/talent-signal/actions/runs/32657034237)
  authenticated, uploaded, waited for processing, and completed successfully,
  proving the stored App Manager credential.
- The Free Apps Agreement is active through 2026-11-24, so the current free
  internal-TestFlight path has no observed agreement blocker. The Paid Apps
  Agreement is `Pending User Info`; paid public distribution is not ready, and
  no tax, banking, compliance, or legal submission will be made automatically.
- The post-merge `main` CI run
  [32655384792](https://github.com/getyak/talent-signal/actions/runs/32655384792)
  passed. The earlier Xcode exit-code 65 was an accessibility audit reporting
  contrast on SwiftUI elements clipped by the system status or bottom edge;
  the focused audit ignores only those non-actionable system-edge records and
  retries only Xcode's exact accessibility-audit infrastructure timeout, while
  real recorded accessibility issues remain failures.
- Later `main` runs
  [32793005972](https://github.com/getyak/talent-signal/actions/runs/32793005972)
  and [32777282841](https://github.com/getyak/talent-signal/actions/runs/32777282841)
  completed their relevant iOS build and test work but failed the aggregate CI
  gate when unrelated third-party documentation sites reset or rejected Lychee
  requests. Their `Release iOS` runs correctly declined to publish because the
  full CI conclusion was not successful. This exposed external reachability as
  an invalid release authority rather than a signing or App Store Connect fault.
- The dependency update merged in pull request 50 introduced
  `unrs-resolver@1.12.2`, whose native-package verification is an install script.
  Main CI run
  [32797237652](https://github.com/getyak/talent-signal/actions/runs/32797237652)
  then failed both JavaScript jobs because the repository's explicit pnpm build
  allowlist had not been updated. The recovery explicitly authorizes that named
  package rather than weakening the install-script policy.
- That update also moved Next.js to 16.3.2. Its build verifies the standard
  TypeScript API file, while the Web package's `typescript` name pointed at a
  compatibility CLI-only package. Pull request 56's first Web run therefore
  passed lint, typecheck, and 185 tests before failing `next build`. Registry
  metadata also showed that the declared 16.3.2 Linux-musl SWC binary was not
  published, which made installation platform-dependent. The recovery uses the
  complete Next.js and ESLint-config 16.3.1 release and restores the standard
  `typescript@6.0.3` API while retaining the separately named TypeScript 7
  native compiler.

## Approach

1. Keep DayPage's useful patch-version and encrypted-match pattern, but isolate
   Talent Signal signing in its own private repository and deploy key.
2. Retain the `testflight` environment and its `main` branch restriction while
   removing the reviewer that contradicted automatic delivery.
3. Make fastlane wait for App Store Connect build processing and publish a
   release tag only after that stronger acceptance point.
4. Diagnose the current iOS CI failure and add the narrowest deterministic
   prevention needed for a green release gate.
5. Verify or create an App Store Connect internal testing group with automatic
   build distribution, then confirm the app record, agreements, tester access,
   and existing API key status.
6. Rotate the match deploy key and URL to the isolated repository, merge the
   verified workflow, and observe one real automated TestFlight delivery.

## Rejected alternatives

- Do not keep Talent Signal indefinitely in `daypage-certs`; sharing one
  signing store broadens access and rotation impact across products.
- Do not auto-submit every push to public App Review or automatic customer
  release. TestFlight is reversible and appropriate for continuous internal
  delivery; production release has legal, metadata, review, and customer-impact
  gates.
- Do not mark a release successful immediately after transport upload. Build
  processing and tester availability are distinct states.
- Do not place signing assets or API keys in repository files or GitHub
  variables.

## Milestones

1. **Complete — Repository implementation:** update fastlane, workflow policy,
   operational documentation, dated project-health outcome, and focused checks.
2. **Complete — Local and CI proof:** the focused regression and repository
   checks passed locally and pull request 48 merged after all checks passed.
3. **Complete — Signing cutover:** the `testflight` environment now contains
   the isolated repository URL and a dedicated read-only v2 deploy key. The
   first cutover attempt exposed Fastlane's implicit `master` branch default;
   release configuration now pins `main` explicitly, a subsequent automatic
   release proved that path, and the temporary equivalent `master` ref was
   removed.
4. **Complete — App Store Connect readiness:** the app record, processed build,
   internal automatic group assignment, active API key, and active Free Apps
   Agreement are verified. Paid-app account information remains an explicit
   account-holder action.
5. **Active — Real delivery:** merging the pinned signing configuration to
   `main` produced green CI run
   [32659479684](https://github.com/getyak/talent-signal/actions/runs/32659479684),
   which automatically triggered successful release run
   [32659877251](https://github.com/getyak/talent-signal/actions/runs/32659877251).
   It processed 0.1.5 build `20260823190119`, tag `v0.1.5`,
   [prerelease](https://github.com/getyak/talent-signal/releases/tag/v0.1.5),
   [attestation](https://github.com/getyak/talent-signal/attestations/42449085),
   retained IPA, and artifact `TalentSignal-0.1.5`. The invited phone must still
   accept TestFlight and install or update before this outcome is complete.
6. **Complete — Tester access diagnosis:** the environment-scoped access run
   proved the active user, internal group membership, all-build access, valid
   0.1.5 build, and absence of a pending team invitation. No relationship repair
   was needed. It resent the invitation and isolated the remaining state as
   `TESTFLIGHT_INVITATION_NOT_ACCEPTED`, with zero known devices.
7. **Active — Release-gate recovery:** make external HTTP reachability advisory,
   keep repository-owned documentation integrity required, unify CI and release
   iOS change classification, and prove the correction through a new automatic
   `main`-to-TestFlight delivery.

## Verification

- Repository: actionlint/pinning/secret hygiene, `ruby -c fastlane/Fastfile`,
  fastlane lane discovery, focused version-script scenarios, and
  `pnpm docs:check`.
- iOS: `./scripts/ios/check.sh` against the release branch revision.
- GitHub: environment policy, secret names/scopes, private repository
  visibility, read-only deploy key, successful CI and Release iOS runs, tag,
  prerelease, attestation, and artifact.
- Apple: app/build/version and processed TestFlight state on the real App Store
  Connect surface; automatic internal group assignment; invited-device install
  or update.

## Status

In progress. The isolated signing cutover and automatically triggered 0.1.5
TestFlight delivery are proved end to end through App Store Connect processing
and internal group distribution. The active reliability correction must produce
a new automatic processed build after the external-link false failures. The
remaining device-level evidence is still an invited physical phone accepting
the invitation and installing or updating the build; no physical device is
currently connected to this Mac, and App Store Connect has not yet recorded an
install or session.
