# Native retrieval release

Status: release complete; v0.1.58 / build 20260906032423 is processed and available to the existing internal TestFlight group.

## Outcome and authorization

The user explicitly requested committing, pushing, merging, a new version and
TestFlight publication after the Sessions/People craft iteration. Complete only
when the merged source has a processed App Store Connect build, trusted release
receipt, and verified internal TestFlight group access. An invited-device
installation remains separate from server-side distribution proof.

## Scope

Publish the session search/filter controls, directory/row typography, independent
unread elevation and label, AX5 adaptation, localized role query, and visible-row
restoration fix. Preserve newer main-branch calendar, full-screen Ask/voice,
identity/persistence and capture-inbox behavior. Leave unrelated dirty workspace
changes untouched. Worktree: /tmp/talent-signal-retrieval-release-20260906.
Branch: codex/refine-session-people-retrieval. Base: e7c62d4.

The design workspace was behind main, so whole-file copying was rejected.
Transplant owned retrieval sections and style-only shell changes onto main.
Prior 97/95 reviews remain frozen historical design evidence; new integration
screenshots and tests verify the actual publication source.

## Milestones

1. Complete: validate the scoped port with Release compilation, focused native
   retrieval/navigation/voice checks, localization, documentation and diff review.
2. Complete: PR #138 passed required CI/Security and merged as 640c2b9.
3. Complete: main CI and Release iOS passed; Apple processing and receipt verified.
4. Complete: exact build/group access audited without resending invitations;
   version, build, commit and delivery evidence recorded below.

## Known evidence

Latest trusted release at intake: v0.1.57. Main CI 34003447950 failed one
pre-existing AX5 screenshot-review contrast audit. No build failure occurred.
Reproduce that named test before deciding whether a fix is needed; do not
weaken its checks or bypass required gates. Release version is selected by the
existing next-ios-version policy after successful CI; do not hand-create a tag.

## Integration evidence

- Commit 761b89e opened https://github.com/getyak/talent-signal/pull/138.
- Release simulator build, localization, docs and secret hygiene pass.
- release-integration.xcresult passed 13 checks, including the pre-existing
  AX5 contrast audit, search/filter/reset, long-list restoration and RTL targets.
  Its one failure was the AX5 global voice hold after adding a large-content
  viewer to the same control. Removing that conflicting viewer preserved the
  original hold gesture; both Chinese AX5 and English voice-hold tests pass in
  release-voice-recovery.xcresult. Fifteen distinct checks now have passing
  evidence across these two runs. No test was disabled or weakened.
- Native artifacts: /tmp/talent-signal-retrieval-v2/release-*.log and xcresult.
  CI/Security are required on the final PR head before merge.

## Remote merge evidence

- Final PR source: 24da545a11741e29e4f5f88e5b2676401472647d.
- Merge: 640c2b9735b0bfe81d045ded6270344b94e56e33 at 2026-09-06T03:03:26Z; its entire tree matches the verified PR source.
- CI 34006803543 passed Release compilation, all 458 unit tests, all 9 isolated UI smoke journeys, repository/docs, Web and backend checks. Security 34006803468 passed.
- Main CI: https://github.com/getyak/talent-signal/actions/runs/34008030416.
- Publication integration captures and hashes: docs/evaluations/2026-09-06-ios-retrieval-craft/release-integration/.

## Distribution preflight

Read-only TestFlight Access run 34008149967 passed on 2026-09-06. The configured tester is an internal-group member, the group includes all builds, and server access is ready. Version 0.1.57 / build 20260906001520 was VALID at preflight. No invitation was resent and no repair was requested. Recheck the exact new build after publication; this preflight is not delivery proof for the new version.

## Main release gate

Main CI 34008030416 passed Release compilation, 458 unit tests and all 9 isolated UI smoke journeys, with zero failures or skipped UI journeys. Automatic Release iOS run 34008858161 selected merge 640c2b9 and entered archive after API reachability and signing setup passed.

## Completed delivery

- Release: https://github.com/getyak/talent-signal/releases/tag/v0.1.58.
- Version 0.1.58; build 20260906032423; source 640c2b9735b0bfe81d045ded6270344b94e56e33.
- Release iOS 34008858161 passed archive, upload, exact Apple processing and finalization. App Store Connect processing was confirmed at 2026-09-06T03:33:29Z; the GitHub prerelease was published at 03:33:35Z.
- The bot-owned release receipt, published asset SHA-256 and annotated tag target were checked against the exact version/build/source.
- TestFlight Access 34009323684 passed at 03:34:54Z: latest version/build match, BUILD_STATE=VALID, GROUP_MEMBER=true, GROUP_ALL_BUILDS=true, SERVER_ACCESS_READY=true. No group/build repair was needed and no invitation was resent. This proves server-side availability, not installation of this specific build on a device.
- Receipt and sanitized access proof are retained beside the publication integration captures. All published records and captures use synthetic preview data.
