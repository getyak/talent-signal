# GET-6 TestFlight release

## Integrated revision

[PR #142](https://github.com/getyak/talent-signal/pull/142) merged as
`2f96e4944dd546024b34d00ca2afecf5dfe32e0a`. Its tree exactly matches tested
PR head `7ca8a24a5a90092734ef0559d3ece7d46a20d25a`. The isolated port preserves
current-main lifecycle routing, Calendar permission copy, migration history,
localizations, and secret ownership. The original dirty development workspace
was preserved.

[Required CI](https://github.com/getyak/talent-signal/actions/runs/34033277341)
and [Security](https://github.com/getyak/talent-signal/actions/runs/34033277439)
passed before merge. The iOS Release build, 461 unit tests, and all nine isolated
UI smoke journeys passed. Backend/Web quality, database authority, secret
ownership, and repository documentation gates also passed. The focused local
checks additionally exercised the upward swipe, replay, authentication recovery,
and static Reduced Motion rendering. See the [compact CI proof](release-ci-proof.json)
and [design evaluation](README.md).

## Deployed backend

The API and Agent Host run
`talent-signal-backend-local:get6-release-a86eb45`. Seven deployed file hashes
match the release source, including the retained proposed-extracted-text
migration. Health, migrations, Apple authentication, voice/chat contracts, and
Tailscale HTTPS checks passed, followed by a new Google challenge returning
HTTP 201. See the [deployment proof](release-deployment-proof.json).

Docker Hub returned EOF. The disposable image uses the prior verified release
runtime, whose dependency lockfile SHA-256 exactly matches this release, with
fresh compiled backend/contracts/agent/evaluation/Agent Host output and migration
sources. The repository Dockerfile was unchanged.

## Publication

The user explicitly authorized commit, PR, merge, and a new version after the
implementation review. The main-only [Release iOS workflow](https://github.com/getyak/talent-signal/actions/runs/34034598963)
was dispatched with publication enabled after the required PR checks passed and
merge-tree equality was verified. The workflow preserves signing, exact-IPA
upload, independent Apple processing validation, attestation, and the processed
build receipt.

Google OAuth remains External / Testing. The verified real-account callback
and account-scoped backend readback are Web evidence. Native authorization entry
and cancellation were verified; a complete native Google account round trip was
not claimed. Public App Store promotion and Google consent-screen production
publication are outside this release.

## Processed build and internal access

[TestFlight 0.1.60](https://github.com/getyak/talent-signal/releases/tag/v0.1.60),
build `20260906125812`, completed Apple processing at `2026-09-06T13:08:31Z`.
The automation-owned release contains the retained IPA and
[processed-build receipt](testflight-release-receipt.json), bound to the merged
commit and successful release workflow above.

A [read-only access audit](https://github.com/getyak/talent-signal/actions/runs/34035216258)
confirmed the exact version/build is `VALID`, belongs to the internal group,
and has server access ready. The group covers all builds. No membership,
build-access relationship, or invitation was changed. See the
[compact access proof](testflight-access-proof.json). This proves availability
for the configured internal tester, not installation of this build on a phone.
