# GET-8 TestFlight release

## Outcome and authorization

The user explicitly requested commit, push, merge and a new TestFlight version
after the completed GET-8 implementation. Publish the reviewed native retrieval,
Today and Meetings changes through the existing main-only release workflow.
Completion requires the merged source, a valid exact App Store Connect build,
the automation-owned release receipt and internal tester access readback.
Public App Store submission and new invitations are outside this request.

## Starting evidence

- Branch: `codex/get-8-retrieval-meetings`; clean base and current remote main:
  `a2eaaeae120bf4747e45f824af3b809e550fb61a`.
- Latest existing release at intake: `v0.1.62`.
- [Implementation evidence](../docs/evaluations/2026-09-07-get-8/README.md):
  108 focused unit tests, 23 distinct native UI cases, Release Simulator
  compilation, localization and documentation checks passed. All captures use
  synthetic data. Device frame rate remains unmeasured.
- No backend or release-pipeline change is required by this native slice.

## Milestones

1. Active: commit the reviewed changes, push the branch and open a PR.
2. Pass required CI and Security on the final PR source, then merge with an
   exact-head check and verify the resulting source tree.
3. Follow successful main CI into the serialized Release iOS workflow; reuse
   its exact IPA if upload or finalization requires recovery.
4. Verify the version, build, commit, processed-build receipt and existing
   internal group access without resending invitations; preserve the receipt.

Version selection belongs to `scripts/ci/next-ios-version.sh`; do not create a
manual tag or duplicate an active release. Follow
[CI/CD operations](../docs/operations/ci-cd.md) for gates and recovery.
