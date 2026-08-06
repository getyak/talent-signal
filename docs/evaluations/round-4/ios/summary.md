# Round 4 iOS final accessibility proof

## Verdict

**Pass with changes / needs direct VoiceOver evidence for full accessibility
release approval.**

The source fix is frozen at
`7d19f190e512a6d3908acf47f75644f300ab4f92`. On an iPhone 17 Simulator
running iOS 26.1, the focused AX5 dark-mode audit passes 1/1 and the complete
iOS UI suite passes 12/12 with zero failures or skips. The suite includes
synthetic `TS-CORE-01`, canonical localhost state, evidence-before-decision
order, action preview, local no-external-write outcome, cancellation, stale
state, interruption, failure recovery, candidate-scoring refusal, and
unrelated-image isolation.

The earlier AX5 failure was a test-adjudication false positive. Its exported
element crop contained only the clipped top pixels of the next off-screen line.
XCUITest clamps partially clipped frames to `window.maxY`; the audit had only
excluded frames strictly beyond that value. The corrected audit excludes
elements clamped within one point of the status-bar or viewport edge while
continuing to check every fully visible element. The final screenshots show the
full proposal-review instruction, evidence, decision controls, status-bar
clearance, and viewport-edge behavior.

The remaining limitation is evidence, not a known product failure: this
Simulator image exposes neither VoiceOver in Settings nor a VoiceOver control
through `simctl ui`. No spoken output, VoiceOver focus ring, gesture traversal,
modal focus containment, or post-transition VoiceOver focus placement is
claimed. Accessibility-tree and XCUITest evidence support the implementation
but do not replace a real VoiceOver run.

## Frozen object

- source commit: `7d19f190e512a6d3908acf47f75644f300ab4f92`
- scenario: synthetic `TS-CORE-01`, fixture `2026-08-05.1`
- device: iPhone 17 Simulator, iOS 26.1 (`23B86`)
- device UDID: `CE72961A-ADAE-4A37-A5EC-F23137C8511E`
- Xcode: 26.4 (`17E192`)
- isolated DerivedData: `.tmp/ios-round4-ax5/DerivedData`
- synthetic data only; zero external contact, message, calendar, ATS, CRM, or
  other write

## Final gate evidence

| Gate | Result | Interpretation |
| --- | --- | --- |
| Focused AX5 dark audit | Pass, 1/1 | Fully visible content passes contrast, hit-region, description, Dynamic Type, status-bar, and viewport checks. |
| Canonical backend test | Pass, 1/1 | Materialized governed state reads correctly through localhost. |
| Complete iOS UI suite | Pass, 12/12 | Zero failures and zero skips in 152.038 seconds. |
| Local backend evaluator | Pass | Eight fixtures and 13 failure-boundary checks passed before UI readback. |
| VoiceOver execution | Not available | No spoken or focus behavior is promoted from supporting tree evidence. |

The canonical-state wait remains bounded at 30 seconds. This covers the directly
observed cold `/v1/workspace-review` response of 22.362 seconds while still
failing when the canonical banner never arrives.

## Evidence bundle

- [`accessibility-trace.json`](accessibility-trace.json) — direct versus
  unproven accessibility behavior
- [`command-results.json`](command-results.json) — full command and gate ledger
- [`mobile-ux-reviewer.json`](mobile-ux-reviewer.json) — specialist review
- [`panel.json`](panel.json) — product-adjudicator decision
- [`02-ax5-contrast-failure-app.png`](02-ax5-contrast-failure-app.png) and
  [`03-ax5-contrast-failure-element.png`](03-ax5-contrast-failure-element.png)
  — preserved initial failure localization
- [`06-ax5-dark-pass.png`](06-ax5-dark-pass.png) and
  [`07-ax5-status-safe-pass.png`](07-ax5-status-safe-pass.png) — passing AX5
  direct screenshots
- [`08-canonical-backend-pass.png`](08-canonical-backend-pass.png) — passing
  canonical localhost readback

## Remaining proof

Run the same frozen journey on a real iPhone or another environment that
actually exposes VoiceOver. Capture spoken labels, values, hints, linear swipe
order, edit/dismiss/confirm activation, modal containment, transition focus,
duplicate announcements, exact-effect preview, no-external-write outcome,
cancellation, failure, and retry.

The AX5 finding is resolved. The medium VoiceOver evidence gap remains open and
is not an active product-safety veto.
