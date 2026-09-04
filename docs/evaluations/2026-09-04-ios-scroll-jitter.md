# iOS scroll jitter investigation

Reviewer: `mobile-ux-reviewer`
Lens: scrolling continuity, layout, and recovery
Status: diagnosis with runtime measurements; continuous jitter not independently reproduced

## Result

The running preview has a confirmed bottom-content clearance defect and a
short scroll range. People/Sessions also contain geometry-observation and
pressed-animation paths that deserve focused performance verification. These
are distinct findings; they do not prove a single cause for every reported
up/down jitter.

No production source was changed. No proposal was approved and no external
contact/calendar write was performed.

## Evidence and limitations

- iPhone 17 Pro simulator, iOS 26.5, portrait, English, synthetic preview;
  the displayed workspace includes the Lab capsule and two preview people.
- Inspected Today, People, and the initially presented Calendar surface.
- Used read-only LLDB inspection of the running app's UIKit scroll views;
  the debugger detached after inspection and the process resumed.
- Current source has concurrent uncommitted changes and is newer than the
  installed executable. Relevant structure is consistent with the rendered
  UI, but this is not a freshly rebuilt source-to-binary verification.
- Automated drag/wheel attempts did not produce a useful continuous scrolling
  recording. The recording shows resting states and navigation, not proof of
  animation smoothness or frame stalls. No FPS, hitch rate, or real-device
  performance claim is made.
- A host process snapshot included active Swift compilation and WindowServer
  activity. This is a measurement confounder, not proof of CPU saturation or
  the app's root cause.

Local scratch evidence is under `/tmp/talent-signal-scroll-jitter-20260904/`:
`today-runtime.txt`, `people-runtime.txt`, and `today.mp4`. It is temporary,
contains synthetic preview UI, and is not a release-performance artifact.

## Runtime measurements

All geometry is in iOS points. Measurements were made while stationary.

| Property | Today | People |
| --- | --- | --- |
| UIKit backing view | `SwiftUI.HostingScrollView` | `SwiftUI.UpdateCoalescingCollectionView` |
| Scroll view height | 874 | 652 |
| Content height | 784 | 223.33 |
| Adjusted top inset | 166 | 0 |
| Adjusted bottom inset | 34 | 34 |
| Content offset Y | -166 | 0 |
| Bounces / alwaysBounceVertical | true / true | true / true |

Today's scrollable range is `784 + 166 + 34 - 874 = 110` points. People's
preview content fits within its viewport, but vertical bounce is enabled.
Elastic movement at these boundaries must be distinguished from repeated
layout jumps or dropped frames during an interior scroll.

## Findings

### 1. Bottom guide space is absent from the scroll view's usable clearance

Confidence: confirmed runtime layout defect; contribution to perceived jitter
is a supported inference.

The [archive shell](../../apps/ios/Sources/Features/RelationshipArchiveView.swift)
applies its top inset inside `NavigationStack`, but its bottom guide inset
outside that stack. `RelationshipGuideRail` has a 44-point control height,
12 points of inner vertical padding, and 12 points of outer vertical padding:
68 points in this configuration. The running scroll view has only the
34-point system bottom inset. At the lower Today resting position, the final
row is behind the translucent guide.

Impact: the user reaches the end after approximately 110 points and can
encounter elastic return while trying to uncover content hidden by the guide.
That can feel like a jump, but it is not evidence of a render-performance hitch.

Correction candidate: give the scroll content and both fixed insets the same
layout owner inside the navigation container. Verify actual inset propagation;
do not assume that moving a modifier is sufficient, or hard-code 68 points
for all accessibility/text configurations.

Verification: repeat runtime measurements and show the final row fully above
the guide at the lower resting position, then test both scroll directions,
larger text, and keyboard presentation on relevant pages.

### 2. People/Sessions observe every row's global geometry during scrolling

Confidence: confirmed implementation; performance impact unmeasured.

In `peopleListContent` and `sessionListContent`, each row emits its global Y
through `GeometryReader` and a dictionary `PreferenceKey`. Each preference
change filters/scans positions and assigns an anchor through a parent binding.
Both use a fixed global Y threshold of 120 instead of the actual viewport.
The currently displayed Lab/search/header region makes that threshold an
unreliable definition of visibility.

Impact: geometry reduction runs during scrolling; anchor changes can propagate
state work beyond the list. People row construction additionally recomputes
relationship metadata and allocates two ISO date formatters in
[WorkspacePeopleRetrievalPolicy](../../apps/ios/Sources/Features/RelationshipArchiveModels.swift).
This is a plausible long-list hitch amplifier. It is incorrect to claim every
identical `@State` assignment necessarily redraws the entire app.

Correction candidate: isolate the restoration bookmark from unrelated UI,
publish only meaningful anchor changes or settled scroll state, derive
visibility from the actual viewport, and precompute/reuse metadata parsing.
Choose APIs compatible with the deployment target and actual `List` support.

Verification: profile the existing long-list preview fixtures, compare view
updates and hitch intervals with observation disabled in an isolated build,
and retain existing restoration/swipe/context-menu behavior.

### 3. Row press feedback can look like a small shake when a drag begins

Confidence: confirmed implementation; matching the reported symptom unverified.

`RelationshipRetrievalButtonStyle` animates scale `1 -> 0.992 -> 1` and opacity
`1 -> 0.82 -> 1` over 0.14 seconds as `isPressed` changes. Starting a drag on
a row can enter then cancel the pressed state. This is relevant to People and
Sessions; Today's cards do not use this style.

Correction candidate: compare native/opacity-only feedback with the current
scale effect before changing interaction behavior.

Verification: start repeated slow drags on a card and in a gutter. If only
card-origin gestures show the effect and removing scale eliminates it, the
press animation explains that symptom. It cannot explain sustained interior
scroll stalls by itself.

## Other hypotheses and existing coverage

- The bottom guide uses iOS 26 glass, so moving content changes its background
  appearance. GPU cost or perceived flicker remains unmeasured; compare the
  existing reduced-transparency preview path before blaming glass.
- Today has a non-lazy `VStack`, but only a small preview payload. It has no
  per-row scroll-position preference loop. Replacing it with a lazy container
  is not supported as the first correction by current evidence.
- Programmatic `scrollTo` is in restoration `onAppear` paths, not an explicit
  every-scroll callback. Page `.id(retrievalIntentGeneration)` resets occur
  on retrieval-intent changes, not on each ordinary scroll event.
- The iOS 27 navigation minimization branch does not execute on iOS 26.5.
- Existing [long-list UI tests](../../apps/ios/UITests/CandidateSignalUITests.swift)
  check anchor recovery after navigation/reset. Their tolerance is one row
  height plus 8 points. They do not measure continuous frame pacing or small
  jitter, and no scrolling performance metric was found in the iOS tests.

## Basis for the diagnostic approach

Apple recommends minimizing the scope/frequency of updates driven by scroll
geometry and using performance evidence to identify excessive view updates.
See [scroll geometry observation](https://developer.apple.com/documentation/swiftui/view/onscrollgeometrychange(for:of:action:))
and [SwiftUI performance](https://developer.apple.com/documentation/xcode/understanding-and-improving-swiftui-performance).
These support the investigation method, not a claim that this app has already
been profiled or that every `GeometryReader` is inherently defective.
