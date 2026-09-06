# iOS scroll continuity implementation

## Outcome and scope

Keep Today, People, and Sessions stable during vertical reading. Reserve real
space for the global composer, reduce scroll-driven state work, and use quiet
press feedback without card scaling. Preserve evidence, approval semantics,
native row swipes, context menus, and retrieval restoration.

The design reference is the existing warm-neutral editorial workspace plus
Apple's scroll-view and motion guidance: direct manipulation, predictable
bounds, content clearance, and brief non-ornamental feedback. This is an
interaction refinement, not a new visual identity.

## Baseline and isolation

- [Diagnosis](../docs/evaluations/2026-09-04-ios-scroll-jitter.md): missing guide
  clearance is measured; sustained frame stalls were not independently proven.
- Current main checkout has substantial concurrent work, including iOS tests
  using the existing simulator. Implement in `/tmp/talent-signal-scroll-continuity`
  on `codex/ios-scroll-continuity`, seeded with the current iOS working files.
- Own only archive layout/scroll feedback, a narrowly necessary metadata helper,
  focused scrolling tests, and this task's evidence. Merge only our delta back.

## Milestones

1. [complete] Implement shared inset ownership, content-sized bounce, semantic
   row-visibility anchors, reusable date parsing, and opacity-only press feedback.
   `onGeometryChange`'s single-value action is available on the iOS 16 target.
2. [complete] Build and run targeted regressions: eight distinct UI cases and
   one metadata/search unit case passed across the baseline and corrected AX5
   runs. Corrected AX5 uses UIKit's raw category and an enlarged-layout assertion.
3. [complete] Inspect rendered light/dark/large-text states, merge the task delta,
   record evidence and limitations, and run documentation checks. The main
   checkout compiled successfully and passed both standard-size and actual AX5
   Today regressions. Final screenshots come from that integrated build.
   Documentation checks passed. After the shared build finished, the simulator
   was restarted with the integrated app: Today now reports a 102-point bottom
   adjusted inset, up from 34 points, while its frame and content size remain
   unchanged. The additional 68 points match the guide's layout space.

## Completion evidence

Use the compiled app's real scroll geometry, end-of-list action visibility,
native swipe/UI regression results, and screenshots. Verify exact build and
source state. Do not describe simulator screenshots as measured real-device
frame pacing. Use an isolated simulator only when the active build is idle;
avoid concurrent simulator pressure on this host.

## Verification refinement

The old People restoration test swiped the `relationship-people` accessibility
marker, which is a 1-point background view. The actual List now has its own
identifier, and regression tests require a large gesture target and a changed
deep-list anchor before testing restoration. This prevents a non-scrolling
test from passing on the first row.
