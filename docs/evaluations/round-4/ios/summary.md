# Round 4 iOS accessibility proof

## Verdict

**Pass with changes / needs evidence for accessibility release approval.**

The frozen `TS-CORE-01` binary is current-source and its core touch journey
passes, but this run cannot truthfully resolve the prior medium VoiceOver
finding. The iPhone 17 Simulator on iOS 26.1 exposes neither VoiceOver in
Settings nor a VoiceOver control through `simctl ui`. No spoken output, real
VoiceOver focus ring, VoiceOver gesture traversal, modal focus containment, or
post-transition VoiceOver focus placement was observed.

This is not replaced by an accessibility tree claim. Computer Use directly read
the app's accessible element order once, and XCUITest directly activated the
touch journey and recovery paths. Those are supporting evidence only.

One new direct issue also remains open: the initial AX5 dark-mode accessibility
audit reported insufficient contrast for the muted instruction beginning “Each
item starts as a proposal…”. A targeted retest timed out while synthesizing a
scroll before reaching the audit, so it neither reproduces nor clears the
failure. Source changes are outside this worktree's ownership; the issue needs a
separate source-fix worktree and a successful focused and full-suite retest.

## Frozen object

- commit: `0439e58e97c8f308c4a31019c2f50814c7848e3a`
- branch: `codex/round-4-ios-voiceover`
- scenario: synthetic `TS-CORE-01`
- fixture version: `2026-08-05.1`
- device: iPhone 17 Simulator, iOS 26.1 (`23B86`)
- device UDID: `CE72961A-ADAE-4A37-A5EC-F23137C8511E`
- Xcode: 26.4 (`17E192`)
- XcodeGen: 2.45.4
- isolated DerivedData root used during the run:
  `/tmp/talent-signal-round4-ios.HZNEgI`
- Release executable SHA-256:
  `0adff2b4e117a471344a7f29b792cd642e83f587e60c2f2b673d06909a9cc9a9`
- iOS source/project input aggregate SHA-256:
  `c7ef75a356abe46797ff5040ed0a2f716f3f67f3bb9d695569473ae7c7a983a8`
- synthetic data only; zero external contact, message, calendar, ATS, CRM, or
  other write

## Gate evidence

| Gate | Result | Honest interpretation |
| --- | --- | --- |
| Project generation | Pass | XcodeGen completed with no tracked project diff. |
| Unit tests | Pass, 13/13 | Zero failures and zero skips. |
| Release simulator build | Pass | Independent isolated build with signing disabled. |
| Initial full UI suite | Fail, 10/12 | Core journey and ten tests passed; two failures are preserved below. |
| Canonical backend retest, fresh seed only | Fail, 0/1 | Backend was healthy, but the synthetic `TS-CORE-01` workspace read returned 404 because state had not been materialized. |
| Local backend evaluator | Pass | Eight fixtures and 13 failure boundaries materialized the governed synthetic state. |
| Canonical backend retest, materialized state | Pass, 1/1 | Confirms the initial backend failure was environment preparation, not an iOS binary defect. |
| Targeted AX5 retest | Fail, 0/1 | XCUITest timed out synthesizing a scroll before the contrast audit; result is inconclusive for contrast. |

The two initial full-suite failures were:

1. `testBackendCanonicalStateReadsConfirmedFactsFromLocalhost` — no backend was
   listening on `127.0.0.1:4317` in the initial run. After starting a fresh
   isolated backend, the test still correctly failed while `TS-CORE-01` state
   was absent; after the local synthetic evaluator materialized that state, the
   exact targeted test passed 1/1.
2. `testAX5DarkModeCriticalContentRemainsReachable` — the accessibility audit
   reported `Contrast failed` on a `SwiftUI.AccessibilityNode`. The exported
   element screenshot localizes the failure to the muted proposal-review
   instruction. The one targeted retest did not reach the audit.

The initial full suite independently passed:

- accessible evidence-before-fact order;
- `TS-CORE-01` evidence, fact confirmation, separate action preview, and local
  no-external-write outcome;
- localhost fixture sync;
- truthful backend/offline failure and recovery;
- import cancellation and recovery;
- background interruption preservation;
- stale preview blocking;
- prohibited candidate-scoring refusal; and
- unrelated-image isolation.

## Accessibility observations

Directly observed through Computer Use before the Simulator stopped exposing
app descendants:

1. brand/header;
2. synthetic source and `TS-CORE-01` identity;
3. review disposition, candidate, assignment, capture time, and timezone;
4. “Observed evidence” and one combined message element whose description
   includes message ID, candidate speaker, and exact text;
5. “Proposed facts” and the review instruction;
6. for each fact: label, proposed status, value, exact evidence, Confirm, Edit,
   Dismiss, and current decision;
7. review-decision explanation; and
8. cancel-review control.

This supports evidence-first accessibility order and confirms that the
consequential controls are exposed as buttons. It does **not** prove the spoken
label/value/hint output, rotor order, swipe order, focus ring, activation by a
VoiceOver gesture, duplicate announcements, contextual sufficiency of repeated
“Confirm / Edit / Dismiss” labels, or focus placement after a state change.

The current XCUITest directly activated fact confirmations, the separate action
preview, the local handoff outcome, cancellation, failure recovery, background
re-entry, stale-preview blocking, and prohibited-scoring refusal. It did not
perform a current VoiceOver edit or dismiss traversal. Round 3's direct edit and
dismiss screenshots remain tied to this unchanged baseline, but they are not
recast as Round 4 VoiceOver proof.

The action preview visibly states target, owner, due time, reason, supporting
evidence, and exact effect. Its primary button carries the accessibility hint
that it records only a local demo outcome and performs no external action. The
outcome visibly says “No external changes.” Spoken delivery of either statement
remains unproven.

## Score movement

The app implementation did not change; the score moved because stronger current
evidence disclosed an unresolved contrast failure.

| Measure | Before Round 4 | After Round 4 | Behavior anchor |
| --- | ---: | ---: | --- |
| Mobile UX reviewer | 3/4 | 2/4 | Core touch/recovery journey remains direct, but the current full UI gate is not green and true VoiceOver remains unavailable. |
| Accessibility dimension | 3/4 | 2/4 | Evidence order and action exposure are direct; AX5 dark contrast has one unresolved failure and no assistive-technology user or spoken traversal exists. |

This score is not averaged with Web, extension, or other product scores.

## Evidence bundle

- [`accessibility-trace.json`](accessibility-trace.json) — direct versus
  unproven accessibility behavior
- [`command-results.json`](command-results.json) — concise command ledger and
  cleanup record
- [`mobile-ux-reviewer.json`](mobile-ux-reviewer.json) — contract-valid
  specialist packet
- [`panel.json`](panel.json) — product-adjudicator decision packet
- [`01-core-review.png`](01-core-review.png) — verified Release build at the
  top of the frozen review
- [`02-ax5-contrast-failure-app.png`](02-ax5-contrast-failure-app.png) —
  exported full audit screenshot
- [`03-ax5-contrast-failure-element.png`](03-ax5-contrast-failure-element.png)
  — exported failing element crop
- [`04-action-preview.png`](04-action-preview.png) — separate exact-effect
  action preview from the passing current UI journey
- [`05-no-external-write-outcome.png`](05-no-external-write-outcome.png) —
  local outcome with explicit no-external-change language

## Required next proof

1. In a separate source-fix worktree, correct the muted AX5 dark-mode contrast
   and pass both the focused audit and the full 12-test UI suite against a
   materialized isolated backend.
2. Run the same frozen journey on a real iPhone or another environment that
   actually exposes VoiceOver. Capture spoken labels, values, hints, linear
   swipe order, edit/dismiss/confirm activation, modal containment, transition
   focus, duplicate announcements, exact-effect preview, no-external-write
   outcome, cancellation, failure, and retry.

Until both pass, the prior medium VoiceOver finding is **not resolved**.
