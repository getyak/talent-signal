# Native retrieval release

Status: PR #138 is open; native integration checks pass and final visual readback is active.

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

1. Active: validate the scoped port with Release compilation, focused native
   retrieval/navigation/voice checks, localization, documentation and diff review.
2. Push a pull request, pass required CI/Security, and merge its verified head.
3. Follow main CI and automatic Release iOS through Apple processing and receipt.
4. Audit existing internal group/build access without resending invitations;
   record release version, build, commit and exact delivery evidence.

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
