# Multi-image TestFlight release

## Integrated revision

[PR #140](https://github.com/getyak/talent-signal/pull/140) merged as
`0a390325fef3435f0f7d32babf53ecc8caa8ad33`. Its tree exactly matches the tested
PR head `4336191ca0deb49d9745b6dca3701dd5a70ad3fe`. The port preserves the
newer fullscreen Session, retrieval behavior, independent prompt work, and
`proposed_extracted_text` source authority. The original dirty development
workspace was preserved.

[Required CI](https://github.com/getyak/talent-signal/actions/runs/34015142129)
and [Security](https://github.com/getyak/talent-signal/actions/runs/34015142130)
passed before merge. The Release build, 459 iOS unit tests, and all nine isolated
UI smoke journeys passed. Web/backend checks, database authority checks,
secret ownership, and repository documentation gates also passed; local focused
storage, batch/recovery, and PostgreSQL validation passed 17 tests.
[Compact CI proof](release-ci-proof.json) retains the exact revision and results.

## Deployed backend

The normal local TestFlight deployment script activated
`talent-signal-backend-local:multi-image-release-4336191` for both API and
Agent Host. Health, authentication, voice/chat contract, and tailnet HTTPS
checks passed. Migrations `047_proposed_extracted_text` and
`049_contact_task_images` are applied. Seven deployed source/migration hashes
match the tested revision; see [deployment proof](release-deployment-proof.json).

Docker Hub metadata returned EOF. The disposable build used the verified local
Node 24.19.0/pnpm 11.18.0 image and the release branch's frozen lockfile, removed
inherited source/build directories inside the disposable container, copied the
current source, and compiled offline. The repository Dockerfile was unchanged.

Storage is private local storage. S3 configuration and exact-version purge
support are integrated, but no live S3 bucket has been configured or exercised.

## Publication

The follow-up user request explicitly authorized PR merge and TestFlight
publication. After the required PR gates passed and merged-tree equality was
verified, the main-only [Release iOS workflow](https://github.com/getyak/talent-signal/actions/runs/34016327774)
was dispatched with publication enabled. It retains signing, exact-IPA upload,
independent App Store Connect processing checks, attestation, and the
processed-build receipt. The main push CI continues independently.


## Processed build and internal access

[TestFlight 0.1.59](https://github.com/getyak/talent-signal/releases/tag/v0.1.59),
build `20260906062355`, completed Apple processing. The automation-owned release
contains the IPA and [processed-build receipt](testflight-release-receipt.json),
bound to the merged commit and successful release workflow above.

A [read-only access audit](https://github.com/getyak/talent-signal/actions/runs/34016849074)
confirmed the exact version/build is `VALID`, belongs to the internal group,
and has server access ready. The group covers all builds. No membership,
build-access relationship, or invitation was changed. See the
[compact access proof](testflight-access-proof.json). This proves availability
for the configured internal tester, not installation of this build on a phone.
