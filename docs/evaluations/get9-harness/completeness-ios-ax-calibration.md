# GET-9 Dynamic Type audit calibration

Decision: **supported** for the narrow question below, not for product acceptance.
All inputs are synthetic discovery cases; human expectation review remains
unreviewed. No case is promoted to regression or Gold by this probe.

## Decision contract

Can the visible scope-label Dynamic Type finding reproduce in an isolated
SwiftUI app without product state, data or network? Both an isolated recurrence
and a product-only failure were plausible. The smallest discriminating failure
is a standard dynamic label reporting unsupported scaling in that isolated app.
The stop rule was two batches within 20 minutes. Both batches completed; no third
batch was added. The source shell remains at `/tmp/get9-ax-calibration`.

## Observed evidence

The [raw case receipt](completeness-ios-ax-calibration.json) retains nine XCTest
outcomes and exact bundles. The tiny app uses a standard caption name and a
caption2 relationship in a Button with an explicit label/value. A UIKit view
and SwiftUI environment probe report actual size before every audit; all AX5
cases read `accessibility5|UICTContentSizeCategoryAccessibilityXXXL`.

- Standard caption at Large and AX5 passed; a caption under an inherited
  `dynamicTypeSize` override also passed.
- The two-label scope Button reported partial support with limited or unlimited
  lines, explicit `ScaledMetric` or semantic caption2, and with or without the
  inherited environment override. The named finding was the synthetic
  `Current client relationship` text.
- The fixed 12 point negative control reported unsupported Dynamic Type. Its raw
  XCTest outcome is failed, as expected for a deliberately non-scaling view;
  it is not counted as a passed product test.

The API usage follows Apple's [Text and attributed runs](https://developer.apple.com/documentation/swiftui/text)
and [ScaledMetric](https://developer.apple.com/documentation/swiftui/scaledmetric).
The product-sized figures are not evidence of all-size behavior by themselves.

## Interpretation and next evidence

The recurrence rejects a product-only explanation for this minimal pattern.
It does not identify an Apple root cause, establish that every product finding
is false, or authorize an audit exception. The experimental explicit-scaling
change to the product name failed to repair its finding and was reverted.
The single attributed Text product trial also retained the finding. The next
product trial uses natural Button labels while preserving dynamic fonts, colors,
name/context order and the selection hint. Only fresh product audits and complete
viewport/interaction proof can establish that change's result. Original-text coverage and native lifecycle recovery are
separate unresolved questions. VoiceOver focus was not exercised.

## Later product results and tool context

Product trials28 and30 retain the same partial Dynamic Type finding with natural
Button semantics and then one ordinary caption Text. Stop changing text
representations without new evidence. Trial30's settled pre-audit screenshot
and geometry show navigation restored after keyboard dismissal, but the audit
still fails; a blank audit-generated core screenshot has no resolved element.
These are separate unresolved observations.

Apple's [audit contract](https://developer.apple.com/documentation/accessibility/performing-accessibility-audits-for-your-app)
requires actual Dynamic Type support. In an [April2026 forum reply](https://developer.apple.com/forums/thread/823968),
an Apple engineer called a report of visually scaling UIKit fonts with Inspector
warnings a possible tool bug and requested Feedback Assistant evidence. That
report concerns another UIKit implementation; it neither confirms our SwiftUI
root cause nor grants an exception. No external report was submitted.
