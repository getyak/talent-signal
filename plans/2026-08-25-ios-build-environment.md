# iOS build environment injection

## Outcome

Make every iOS archive carry an explicitly selected, validated Talent Signal
API base URL so a missing build setting cannot reach TestFlight. Keep the same
configuration contract usable from a developer-owned `.env` file and from the
`testflight` GitHub Environment without committing environment-specific values.

Completion is observable when a Release app built from the ordinary local and
GitHub Actions paths contains the intended HTTPS origin, the app reaches a live
Apple authentication challenge on that origin, required checks pass, and the
merged build can enter the authenticated iOS workspace.

## Boundaries

In scope:

- one public, non-secret `TALENT_SIGNAL_API_BASE_URL` contract;
- local `.env` loading, Xcode build-setting generation, and generated-file
  hygiene;
- Debug loopback and Release HTTPS validation;
- Fastlane and GitHub Actions integration with fail-closed release checks;
- tests that inspect the compiled app configuration rather than only source;
- iOS login-entry verification, review, pull request, merge, and post-merge
  release observation.

Out of scope without a separate authorized deployment decision:

- placing provider, Apple, database, signing, or session credentials in the app
  bundle;
- inventing a production backend URL or treating the public marketing site as
  an API;
- deploying the current local shared backend to an unselected cloud, database,
  region, or retention posture;
- bypassing Sign in with Apple or replacing account scope with a Release demo.

## Initial evidence and remaining unknowns

- The app reads `TalentSignalAPIBaseURL` from its generated Info.plist and
  displays `Set TalentSignalAPIBaseURL for this build.` when it is absent.
- `project.yml` maps that key to `$(TALENT_SIGNAL_API_BASE_URL)`, but neither the
  Fastlane archive nor `release-ios.yml` assigns the build setting.
- The repository and `testflight` GitHub Environment currently have no Actions
  variable for an API URL.
- The repository contains no local `.env`, only examples; the iOS project has no
  local build-configuration include.
- Repository architecture currently classifies the shared backend as local,
  not a deployed production candidate-data service.
- Live checks on 2026-08-25 found that `POST
  https://gettalentsignal.com/v1/auth/apple/challenges` and its `/api` variant
  return 404; `api.gettalentsignal.com` has no DNS record.
- A real production HTTPS backend, database/retention posture, Apple audience
  configuration, and stable public origin remain unknown. This is a runtime
  prerequisite, not a value that code generation can infer safely.

## Chosen approach

Use `TALENT_SIGNAL_API_BASE_URL` as the human-facing contract. A deterministic
repository script will read a selected `.env` file or the process environment,
validate the URL for the requested build configuration, encode it so `.xcconfig`
syntax cannot truncate `https://`, and write one ignored local include. The
committed Xcode configuration contains no environment value and includes that
generated file optionally.

The app will decode the generated Info.plist value and retain the existing
Debug-only launch-argument override. Release accepts HTTPS only. Local Debug may
use HTTP only for an exact loopback host.

CI will generate a non-routable HTTPS build-test value and inspect the produced
app bundle. TestFlight will instead require the `testflight` Environment variable
and probe its authentication challenge before signing or uploading. Fastlane
will independently reject a missing build configuration so a manual invocation
cannot bypass the workflow gate.

The API origin is public app metadata, so it belongs in a GitHub Actions
Environment variable, not a secret. All actual credentials remain server-side
or in the existing scoped signing secrets.

## Rejected alternatives

- Do not commit a production URL into `project.yml`; that couples source to one
  deployment and makes environment promotion a code change.
- Do not source `.env` as shell code; configuration data must not gain command
  execution authority.
- Do not write a raw `https://` value directly into `.xcconfig`; `//` has comment
  semantics and can silently truncate the setting.
- Do not silently fall back to the marketing site, localhost, or a fixture in
  Release. A plausible but wrong origin is harder to diagnose than a blocked
  archive.
- Do not store the API origin as a GitHub secret; it is embedded in the client
  and cannot remain confidential.

## Milestones

1. **Completed — configuration core:** add the deterministic generator, ignored
   local include, Xcode mapping, runtime decoder, and focused tests.
2. **Completed — delivery integration:** make local checks, CI, and Fastlane use
   the same contract; require and probe the `testflight` Environment variable.
3. **Completed — compiled proof:** build Debug and Release variants, inspect their
   Info.plists, and prove missing/invalid/loopback/HTTPS cases.
4. **Blocked on deployment choice — runtime proof:** launch the app against an
   authorized production backend and observe the login surface plus a successful
   authentication challenge.
5. **Active — review and merge:** complete the repository review standard,
   open a pull request, wait for required checks, resolve findings, and merge.
6. **Pending — release proof:** observe the automatic main release and verify
   the resulting TestFlight build reaches the authenticated workspace.

## Verification

- focused generator and release-policy tests;
- `pnpm ios:generate` followed by a clean generated-project diff check;
- Release build with signing disabled and exact Info.plist readback;
- targeted AppSession and Release-boundary tests, then `pnpm ios:check` when the
  focused slice is green;
- actionlint, Actions pinning, secret hygiene, Fastlane syntax/lane discovery,
  and `pnpm docs:check`;
- live authentication challenge probe before archive;
- simulator or physical-device observation of the authenticated entry path;
- green required PR checks and post-merge TestFlight run.

Verification completed on 2026-08-25:

- deterministic generated-project regeneration and exact Release Info.plist
  readback passed;
- focused configuration, backend-probe, workflow-policy, and Release-boundary
  tests passed;
- `pnpm check`, `pnpm docs:check`, actionlint, Actions pinning, secret hygiene,
  shell/Ruby syntax checks, and Xcode generation passed;
- the merged iOS result bundle reports 141 passed, 0 failed, and 1 expected
  authorized-fixture skip across 142 tests on an iPhone 17 Pro simulator;
- the isolated Docker backend and fixture processes terminated cleanly after
  the suite.

## Decisions that can change direction

Selecting the production backend host, operator, region, database, retention
posture, and Apple Sign in configuration is a consequential deployment decision.
If no already-authorized service exists, that deployment needs an explicit owner
and evidence before the final runtime, merge, and release milestones can be
claimed complete.
