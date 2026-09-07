# Native paging observation

Two XCTest metric cases use the same synthetic long Session and People lists,
five measured round trips and one warm-up on the same iPhone 17 Pro Simulator
(402 × 874 pt, iOS 26.5). The implementation was measured first; the baseline
was then built in a disposable worktree at `a2eaaeae` with only the identical
[benchmark](benchmark.swift) added. The disposable worktree was removed.

| Native scroll/deceleration signpost duration | Baseline mean | GET-8 mean |
| --- | ---: | ---: |
| Today ↔ Sessions | 0.243884 s | 0.503208 s |
| Sessions ↔ People | 0.516595 s | 0.502976 s |

These are XCTest's duration aggregates for a measured round trip, not a
per-frame trace. The observed timings are much closer between the two page
pairs after the change. This supports consistent reported motion duration in
this run; it does not establish causality, fewer hitches or faster rendering.
The shorter baseline Today result is not evidence of better smoothness.

The returned metrics contain duration and wall-clock time only, with no frame
count or hitch ratio. Wall-clock means were 1.044344/1.369165 s before and
1.285808/1.365898 s after (Today–Sessions/Sessions–People); these include XCTest
lookup, gesture dispatch and idle waiting. There is no approved performance
baseline or pass/fail threshold. Both cases assert navigation outcomes.

- Raw observations: [baseline](baseline.json), [GET-8](current.json).
- Local result bundles: `/tmp/get8-motion-baseline.xcresult` and
  `/tmp/get8-regression-and-metrics.xcresult`.
- API: [XCTOSSignpostMetric](https://developer.apple.com/documentation/xctest/xctossignpostmetric),
  verified against the installed XCTest header's
  `scrollingAndDecelerationMetric` declaration.

Physical-device frame traces and actual recruiter use remain unmeasured.
