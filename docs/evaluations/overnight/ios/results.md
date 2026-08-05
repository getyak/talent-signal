# iOS deterministic results

## Verdict

Pass for the bounded synthetic fixture/demo and read-only localhost-sync slice.
This is not proof of production OCR, identity matching, privacy lifecycle,
recruiter value, evaluator reliability, external writes, or hiring outcomes.

The final build replaces the static `VERIFIED FACTS` presentation with explicit
states for idle, importing, import cancelled, import failed, reviewing an
intentional fixture, reviewing an unbound selected image, action preview, stale
preview, and local outcome. A selected image has no fixture session and cannot
show fixture facts.

## Frozen artifact

- Base: `f66581cbf8a1b1154156fc25231a6ff82f11c61f`
- Result source: this document's containing commit
- Debug binary SHA-256:
  `83aad749c000d151337253c73de867cd0ed874dab754f3ce207feb0179d63dac`
- Fixture suite: `talent-signal-candidate-momentum-v1`
- Fixture version: `2026-08-05.1`
- Simulator: iPhone 17, iOS 26.1,
  `CE72961A-ADAE-4A37-A5EC-F23137C8511E`

## Eight-case gate

| Case | Expected disposition | Executable result | Evidence |
| --- | --- | --- | --- |
| `TS-CORE-01` | `propose_action` | Pass. Four exact-evidence proposals begin pending; each requires Confirm, Edit, or Dismiss. The separate action preview names target, owner, due window, reason, supporting evidence, and exact non-effect. The outcome is a local handoff with no external changes. | Unit: `testTSCORE01BeginsWithProposalsAndRequiresSeparateActionPreview`. UI: `testTSCORE01EvidenceFactReviewActionPreviewAndHandoff`. Screenshot/recording sequence below. |
| `TS-CORE-02` | `no_action` | Pass. No assertion or action is manufactured for friendly conversation without an actionable change. | Unit: `testNoActionAndForwardedSpeakerCasesDoNotManufactureCandidateIntent`. |
| `TS-CORE-03` | `clarify` | Pass. The relative date/timezone assertion is ambiguous, cannot be confirmed unchanged, and cannot create an action. | Unit: `testAmbiguousDateCannotBeConfirmedWithoutEditing`. |
| `TS-CORE-04` | `propose_action` | Pass. Prior remote-required state and the later conditional three-office-day statement remain distinct; supersession is explicit rather than destructive. | Unit: `testSupersessionPreservesPriorAndConditionalValues`. |
| `TS-ID-01` | `clarify` | Pass. Two same-name options remain unbound; no fact or action can be confirmed. | Unit: `testIdentityAmbiguityStaysUnbound`. |
| `TS-ID-03` | `no_action` | Pass. The hiring-manager statement remains recruiter-provided third-party evidence and never becomes candidate intent. | Unit: `testNoActionAndForwardedSpeakerCasesDoNotManufactureCandidateIntent`. |
| `TS-ACT-01` | `propose_action` | Pass. Availability remains an observed fact, not meeting consent; the only proposal is to clarify the exact date and timezone, and no calendar event is created. | Unit: `testAvailabilityDoesNotBecomeMeetingConsent`. |
| `TS-BOUND-01` | `block` | Pass. The product refuses culture-fit, quality, personality, and acceptance scoring, creates no assertions or action, and reports no external changes. | Unit: `testFitScoreRequestIsBlockedWithoutAssertionsOrAction`. UI: `testProhibitedFitRequestIsRefused`. |

The suite-level test also asserts the exact ordered IDs and dispositions for all
eight cases, preventing accidental fixture drift.

## Real-surface checks

| Requirement | Result | Direct proof |
| --- | --- | --- |
| Intentional `TS-CORE-01` review | Pass | UI test confirms all four facts, opens a distinct action preview, completes a local handoff, and preserves three screenshots. |
| Unrelated selected image | Pass | UI test and direct screenshot show `Unrelated image selected`, zero fact cards, and no `Alex Chen`. |
| Exact Edit / Confirm / Dismiss controls | Pass | Each proposed-fact component exposes all three controls; the full UI path uses Confirm while unit tests exercise Edit and stale invalidation. |
| Stale action | Pass | Editing after preview clears the preview; stale launch state removes completion and offers refresh. |
| Idle / importing / cancelled / recovery | Pass | UI launches idle, starts a two-second synthetic import, cancels it, proves no session/facts, and returns to idle. |
| Import failure / recovery | Pass | Synthetic failure and a real unreachable loopback endpoint both report `Nothing was changed`, reveal no fixture facts, and recover to idle. |
| Read-only localhost success | Pass | Current-code UI test loads the frozen JSON from `127.0.0.1:8787`; the server records one `GET`; the surface preserves `Read-only localhost sync` provenance. |
| Background interruption | Pass | After one local fact confirmation, Home then app activation preserves the review decision and fixture provenance. |
| AX5 Dynamic Type and dark mode | Pass | The critical path remains reachable at Accessibility XXXL in dark mode; automated dynamic-type, contrast, hit-region, and description audits pass. |
| VoiceOver traversal order | Pass with bounded evidence | The accessibility tree places exact observed evidence before the first proposed-fact decision. Spoken VoiceOver comprehension with an assistive-technology user remains untested. |
| Action/outcome layout | Pass | UI tests assert action-preview and outcome titles begin below the status bar; final screenshots were visually inspected. |
| External effects | Not attempted | The app has no message, calendar, contact, ATS, reminder, or production-data write path and never claims one succeeded. |

## Final commands and results

All builds and tests used a unique DerivedData path.

- Full suite:
  `xcodebuild test -project TalentSignal.xcodeproj -scheme TalentSignal -destination 'platform=iOS Simulator,id=CE72961A-ADAE-4A37-A5EC-F23137C8511E' -derivedDataPath /tmp/talent-signal-ios-final-full2 CODE_SIGNING_ALLOWED=NO`
  — 13 unit tests and 11 UI tests, zero failures. The optional localhost-success
  test skipped because the local server was not running during this aggregate
  run.
- Current-code localhost success:
  `xcodebuild test ... -derivedDataPath /tmp/talent-signal-ios-final-localhost ... -only-testing:TalentSignalUITests/CandidateSignalUITests/testLocalhostSyncSuccess`
  — one UI test, zero failures; the server logged exactly one read-only fixture
  request.
- Release Simulator build:
  `xcodebuild build ... -configuration Release ... -derivedDataPath /tmp/talent-signal-ios-final-release`
  — succeeded.

Test result bundles:

- `/tmp/talent-signal-ios-final-full2/Logs/Test/Test-TalentSignal-2026.08.05_03-01-25-+0800.xcresult`
- `/tmp/talent-signal-ios-final-localhost/Logs/Test/Test-TalentSignal-2026.08.05_03-05-55-+0800.xcresult`

## Durable direct evidence

- `evidence/final-xctest/ts-core-01-evidence-and-proposals.png`
  (`0766d4b237b7d601e62ba26748d74cb841322390e5a68758fcb698a5652eeebd`)
- `evidence/final-xctest/ts-core-01-action-preview.png`
  (`a6f669ea3e87500a4183d0c54b2772a62f791d891aab9fc3f816862c37923b67`)
- `evidence/final-xctest/ts-core-01-local-outcome.png`
  (`01ba5f2d6027516e00d42ca9f0103af2317724ef5bc6bb55e342ad7273eac351`)
- `evidence/final-xctest/localhost-fixture-provenance.png`
  (`b415776257101157cde6dcfb7eb60011083200740114ea10332276e7797e7fac`)
- `evidence/final-ts-core-launch.mp4`
  (`4362073080fe56fadb00b9c5de1aa3d7bc52dd730897c3a16e8e8594d42cd9a7`)
- `evidence/final-unrelated-image.png`
- `evidence/final-ax5-dark-review.png`
- XCTest attachment provenance:
  `evidence/final-xctest/ts-core-manifest.json` and
  `evidence/final-xctest/localhost-manifest.json`

## Untested behavior

- Real screenshot OCR, speaker-side inference, and real candidate identity
  binding.
- Persistence through process termination, device restart, or cross-day return.
- Real-data access control, retention, export, deletion, backup, and log
  redaction.
- External write idempotency, reconciliation, permission revocation, undo, and
  destination observation; no external write exists in this slice.
- Assistive-technology user testing, spoken VoiceOver comprehension,
  localization, right-to-left layout, and older-device performance.
- Recruiter or candidate field outcomes.
