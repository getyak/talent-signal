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
- `getyak/talent-signal-certs` now exists as a private repository and contains
  only the encrypted distribution certificate plus the Talent Signal App Store
  profile copied from the private DayPage match repository. A new read-only
  deploy key and matching secret still need to be installed.
- The current fastlane lane uses `skip_waiting_for_build_processing: true`.
  That proves upload acceptance but, per fastlane's current contract, does not
  itself distribute a build to testers. The replacement lane waits for build
  processing and supplies release notes before returning success.
- App Store Connect contains Talent Signal under Apple ID `6797632577`.
  Versions 0.1.0 through 0.1.2 are processed, and 0.1.2 build `202608040738`
  is assigned to the `Talent Signal Internal` and `telepace` groups.
- The `Talent Signal Internal` group is configured for automatic distribution
  of Xcode builds. Its one internal tester remains `Invited`; App Store Connect
  shows no install or session evidence yet, so device delivery is not proved.
- The App Store Connect API credential can be proved only by the next upload.
  Account agreement readiness has not been established, and no legal terms
  will be accepted without the account holder's explicit decision.
- The latest `main` CI run
  [32638098113](https://github.com/getyak/talent-signal/actions/runs/32638098113)
  failed in the iOS check with Xcode exit code 65. Its actionable failure was
  the accessibility audit reporting contrast on SwiftUI elements clipped by
  the system status or bottom edge. The focused audit now ignores only those
  non-actionable system-edge contrast records and retries only Xcode's exact
  accessibility-audit infrastructure timeout; five consecutive local runs
  passed with real recorded accessibility issues still treated as failures.

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
2. **Active — Local and CI proof:** the focused regression and repository
   checks pass locally; publish the isolated branch and obtain a green pull
   request check before merge.
3. **Pending — Signing cutover:** add a dedicated read-only deploy key to
   `getyak/talent-signal-certs` and replace `MATCH_DEPLOY_KEY` and
   `MATCH_GIT_URL` in the scoped GitHub configuration.
4. **Active — App Store Connect readiness:** the app record, processed builds,
   internal group, automatic Xcode-build distribution, and invited tester are
   verified. The next authenticated upload must prove the API credential; any
   account agreement remains an explicit account-holder action.
5. **Pending — Real delivery:** merge/push, observe the CI and Release iOS runs,
   verify the App Store Connect build/version, and confirm a phone can install
   or update it through TestFlight.

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

In progress. The stalled environment reviewer has been removed, the isolated
private signing repository has been created and seeded, App Store Connect's
internal automatic-distribution path is verified, and the CI accessibility
failure has a focused passing regression. No new release or device install has
been claimed yet.
