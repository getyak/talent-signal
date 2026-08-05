# iOS overnight run manifest

## Outcome

Replace the static verified-facts illusion with an executable Simulator flow
that keeps selected images unbound, uses the eight synthetic fixtures
intentionally, separates fact review from action choice, and ends in an honest
local handoff or no-action outcome.

Status: **complete for the bounded local synthetic fixture/demo and read-only
localhost-sync slice**. Production ingestion and external effects are not part
of the accepted artifact.

## Boundary

- Owned: `apps/ios/Sources/**`, `apps/ios/Tests/**`,
  `apps/ios/UITests/**`, `apps/ios/project.yml`,
  `apps/ios/TalentSignal.xcodeproj/**`, and this evaluation folder.
- Untouched: obsolete `apps/ios/TalentSignal/**` and
  `apps/ios/TalentSignalTests/**`, root wiring, Web, backend, plugin, fixture
  source, canonical docs, and other evaluation folders.
- No real candidate data, external writes, production deployment, push, or PR.

## Frozen inputs and artifact

- Base commit: `f66581cbf8a1b1154156fc25231a6ff82f11c61f`
- Result source: this manifest's containing commit
- Debug binary SHA-256:
  `83aad749c000d151337253c73de867cd0ed874dab754f3ce207feb0179d63dac`
- Fixture suite: `talent-signal-candidate-momentum-v1`
- Fixture version: `2026-08-05.1`
- Release standard:
  `docs/evaluations/overnight-cross-surface-standard-2026-08-05.md`

## Environment

- macOS host, Asia/Singapore
- Xcode 26.4 (`17E192`)
- XcodeGen 2.45.4
- Simulator: iPhone 17, iOS 26.1,
  `CE72961A-ADAE-4A37-A5EC-F23137C8511E`

## Milestones

| Milestone | State | Evidence |
| --- | --- | --- |
| Baseline | complete | Clean detached worktree at the frozen base; build and 3 unit tests passed |
| Truthful state model | complete | Idle, importing, cancelled, failed, fixture review, unbound image, action preview, stale preview, and outcome are explicit |
| Eight-case deterministic gate | complete | 13 unit tests pass and assert all exact case IDs/dispositions plus case-specific boundaries |
| Direct `TS-CORE-01` surface path | complete | Final UI test, three XCTest screenshots, and launch recording |
| Accessibility/failure/recovery audit | complete within stated limits | AX5/dark audit, accessibility-tree order, cancellation, failure, offline recovery, localhost success, and background interruption pass |
| Specialist review | complete | Five-lens review and contract-valid panel packet |
| Release Simulator build | complete | `/tmp/talent-signal-ios-final-release`, `BUILD SUCCEEDED` |
| Bounded commit | complete | This manifest's containing local commit; no push, PR, or deployment |

## Baseline artifacts

- Build DerivedData:
  `/tmp/talent-signal-ios-baseline-build.X8tTTS`
- Test DerivedData:
  `/tmp/talent-signal-ios-baseline-test.gQI0ik`
- Test result:
  `/tmp/talent-signal-ios-baseline-test.gQI0ik/Logs/Test/Test-TalentSignal-2026.08.05_01-51-03-+0800.xcresult`

Every later build or test used a different DerivedData path.

## Correction loops

### Loop 1 — make the truthful flow executable

Evidence exposed actor-isolation build errors and parent accessibility
identifiers that masked fact decision buttons. The implementation was corrected
and rebuilt. The 13 unit tests and direct `TS-CORE-01` UI path then passed.

### Loop 2 — accessibility and recovery defects

The full UI suite found insufficient dark-mode button contrast and fragile
cancellation/refusal queries. The primary fill color, import cancellation
window, and stable accessibility identifiers were corrected. AX5 dark-mode
audit, cancellation, refusal, and offline recovery then passed. Preserved
failure artifacts:

- `evidence/loop-2-ax5-dark-app.png`
- `evidence/loop-2-ax5-dark-contrast-element.png`
- `evidence/loop-2-ax5-dark-recording.mp4`

### Loop 3 — provenance and cross-stage layout

A real localhost run exposed loss of the read-only provenance label when the
fixture review opened. After preserving the source notice, XCTest screenshots
then exposed inherited scroll position that placed a later-stage title beneath
the status bar. The shared scroll container now returns to the top for every
stage transition, and UI tests assert both action and outcome headings begin
below the status bar. Pre-correction artifacts remain in
`evidence/loop-3-pre-scroll-xctest/`; final artifacts are in
`evidence/final-xctest/`.

No fourth correction loop was used.

## Final executable verification

- Full suite DerivedData: `/tmp/talent-signal-ios-final-full2`
- Full suite result:
  `/tmp/talent-signal-ios-final-full2/Logs/Test/Test-TalentSignal-2026.08.05_03-01-25-+0800.xcresult`
- Full suite outcome: 13 unit tests and 11 UI tests, zero failures. The
  optional localhost-success test skipped because the local server was not
  running during that aggregate execution.
- Current-code localhost DerivedData:
  `/tmp/talent-signal-ios-final-localhost`
- Current-code localhost result:
  `/tmp/talent-signal-ios-final-localhost/Logs/Test/Test-TalentSignal-2026.08.05_03-05-55-+0800.xcresult`
- Current-code localhost outcome: one UI test, zero failures; the temporary
  loopback server logged one `GET` for
  `/evals/candidate-momentum-v1.json`.
- Release DerivedData: `/tmp/talent-signal-ios-final-release`
- Release outcome: `BUILD SUCCEEDED`.

## Artifact locators

- Deterministic results: `results.md`
- Specialist review: `review.md`
- Contract-valid panel: `panel.json`
- Final XCTest screenshots and attachment manifests:
  `evidence/final-xctest/`
- Direct screenshots and recording: `evidence/final-*.png` and
  `evidence/final-ts-core-launch.mp4`
- Correction evidence: `evidence/loop-2-*` and
  `evidence/loop-3-pre-scroll-xctest/`

## Known limits

- The fixture catalog is synthetic and does not establish OCR accuracy,
  recruiter value, privacy compliance, evaluator reliability, fairness, or
  safe live integration.
- An arbitrary selected image is deliberately unbound; production OCR and
  identity matching do not exist in this slice.
- The localhost path is read-only and accepts only loopback hosts.
- The app offers a local handoff, not message, calendar, contact, ATS, or
  reminder execution.
- Accessibility-tree order, AX5, contrast, labels, and hit regions are checked,
  but spoken VoiceOver comprehension with an assistive-technology user is not.
- Background interruption is tested; process termination and cross-day
  restoration are not.
