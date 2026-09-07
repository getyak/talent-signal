# GET-8 TestFlight release

## Integrated revision

[PR #151](https://github.com/getyak/talent-signal/pull/151) merged as
`f6f6f025e0e3088167df81c76aebe5cab29f334c`. Its tree exactly matches tested
PR head `c7e24f16c0be00c89239aa08ff828e4b71078ffa`. The release includes the
native four-destination navigation, quieter Today, and Meetings-to-Session
handoff described in the [implementation evaluation](README.md).

[Required CI](https://github.com/getyak/talent-signal/actions/runs/34104735291)
and [Security](https://github.com/getyak/talent-signal/actions/runs/34104735293)
passed before merge. The iOS Release build, 516 unit tests and all nine isolated
UI smoke journeys passed, along with Web, backend and repository checks. See
the [compact CI proof](release-ci-proof.json). Simulator evidence does not
establish hardware frame rate or a device installation.

## Publication

The user explicitly authorized commit, push, merge and a new TestFlight version
after the implementation review. The main-only
[Release iOS workflow](https://github.com/getyak/talent-signal/actions/runs/34107690118)
was manually dispatched with publication enabled after the required PR gates
and merge-tree verification. It selected the merged revision above, validated
the current API contract and isolated signing access, and archived and uploaded
the exact IPA. No backend or release-policy changes were needed.

The IPA provenance attestation binds SHA-256
`ab436fed6a55f5d16f49f1ce5f15768b9e234d0917c5928333d8a815fc58201f`.
The retained release asset has the same digest. The version tag resolves to
the merged source, and the downloaded receipt matches its GitHub asset digest.
See the [publication proof](release-publication-proof.json).

## Processed build and internal access

[TestFlight 0.1.63](https://github.com/getyak/talent-signal/releases/tag/v0.1.63),
build `20260907094527`, completed Apple processing at `2026-09-07T09:56:40Z`.
The automation-owned release contains the retained IPA and
[processed-build receipt](testflight-release-receipt.json), bound to the merged
commit and successful release workflow above.

A [read-only access audit](https://github.com/getyak/talent-signal/actions/runs/34108872288)
confirmed the exact version/build is `VALID`, group membership and all-build
access are enabled, and server access is ready. No membership, build-access
relationship or invitation was changed. See the
[compact access proof](testflight-access-proof.json). The tester's existing
`INSTALLED` state does not prove installation of this new build on a phone.
Public App Store promotion remains outside this release.
