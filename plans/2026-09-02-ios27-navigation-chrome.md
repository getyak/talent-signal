# iOS 27 navigation chrome

Status: implementation complete; Xcode 27 runtime verification pending
Owner: Codex
Started: 2026-09-02

## Outcome

Make the iOS Today, Sessions, and People shell gain reading space during deep
scroll while keeping primary retrieval familiar and reachable. The top chrome
should use system navigation behavior, minimize on scroll when built with the
iOS 27 SDK, and inherit the system Liquid Glass transparency preference. The
bottom Agent intent rail should remain one restrained, adaptive glass object.

Completion is observable when the existing destination, gesture, restoration,
and accessibility checks still pass on the available iOS 26.5 SDK; the rendered
shell has one navigation material rather than stacked glass; Reduce
Transparency gives the custom rail an opaque fallback; and an Xcode 27 build
confirms native navigation-bar minimization plus the full transparency-slider
range.

## Boundary

In scope:

- the Today / Sessions / People top navigation container;
- native scroll-edge material and iOS 27 navigation-bar minimization;
- the bottom global Agent intent rail's system glass, restrained vermilion
  tint, and opaque accessibility fallback;
- light, dark, Reduce Motion, Reduce Transparency, Dynamic Type, and compact
  width behavior relevant to this chrome.

Out of scope:

- changing the canonical Person, Pursuit, Session, evidence, Proposal, Action,
  or Receipt models;
- changing row gestures, search/filter behavior, scroll restoration, or any
  external-effect authority;
- applying Liquid Glass to relationship content cards;
- adding an app-owned transparency slider or numerical blur controls that the
  native Liquid Glass API does not expose.

## Current evidence and unknowns

- The current shell uses a custom opaque top safe-area inset, so it cannot gain
  standard iOS 27 toolbar diffusion, system personalization, or native
  minimization.
- The bottom intent rail is a custom capsule over an almost-opaque strip; it is
  navigation chrome and is eligible for one Liquid Glass surface.
- Existing UI tests address the top controls by stable accessibility IDs and
  assert their status-bar safety, destination ownership, reduced-motion
  behavior, row gestures, and scroll continuity.
- This host has Xcode 26.6 with the iOS 26.5 SDK. It can verify standard Liquid
  Glass and all existing behavior, but it cannot compile or render the beta
  iOS 27 toolbar-minimization API unless the project activates the SDK-specific
  compilation path under Xcode 27.

## Chosen approach

Use a real `NavigationStack` and system toolbar placements for the brand/menu,
stable destination selector, and calendar. Let the standard toolbar own its
scroll-edge material so iOS 27 can apply the revised diffusion and the user's
system transparency preference automatically. Activate
`toolbarMinimizationBehavior(.onScrollDown, for: .navigationBar)` only for iOS
27 SDK builds, retaining the standard fixed navigation bar on earlier systems.

Render the bottom intent rail as one custom regular-glass capsule on iOS 26+
with a quiet vermilion tint. When Reduce Transparency is enabled, replace that
custom glass with an opaque Talent Signal surface. Earlier systems use one
standard material fallback. Never stack glass inside the rail or apply it to
content cards.

Rejected:

- a custom scroll-offset collapse engine, because it would duplicate native
  iOS 27 behavior and add gesture, accessibility, safe-area, and restoration
  ownership;
- an app transparency slider, because the platform preference is system-owned
  and native Liquid Glass exposes variants and tint rather than numerical
  opacity or blur;
- separate glass capsules for each top control, because the selected Museum
  Glass direction calls for one navigation threshold and quiet content.

## Milestones

1. **Complete — native chrome.** Replaced the custom top inset with system toolbar
   content and add the SDK-gated iOS 27 minimization behavior.
2. **Complete — adaptive glass.** Gave the bottom intent rail one Liquid Glass
   surface with an opaque Reduce Transparency fallback.
3. **Complete for the available SDK — deterministic proof.** Ran a full Debug
   Simulator build on Xcode 26.6 / iOS 26.5, followed by the existing
   retrieval navigation, gesture, continuity, compact-width, dark, Simplified
   Chinese, AX5, and reduced-motion checks that are practical on this host.
   The focused iPhone 17 Pro set passed four tests; the final English-label
   refinement passed again under Reduce Motion; and two Today/navigation tests
   passed on iPhone SE. `pnpm docs:check` and targeted `git diff --check` pass.
4. **Complete for current visual review — future-SDK gate remains.** Reviewed
   the standard light surface, Simplified Chinese dark AX5 surface, English
   Reduce Motion surface, compact iPhone SE surface, and the Debug-only opaque
   fallback. Full labels and 44-point controls remain reachable; glass stays in
   navigation chrome and the content cards remain solid. Exact minimize motion,
   scroll-edge diffusion, and both ends of the system transparency slider still
   require Xcode 27 plus an iOS 27 Simulator or device.

## Verification result

- Build: Xcode 26.6, iOS 26.5 Simulator SDK, Debug, unsigned — passed.
- iPhone 17 Pro focused UI tests: default Today, explicit top-control
  navigation, Reduce Motion navigation, and Simplified Chinese dark AX5
  retrieval — 4 passed, 0 failed.
- Final label/tint regression: English Reduce Motion navigation — 1 passed,
  0 failed.
- Compact-width regression on iPhone SE (3rd generation): default Today and
  explicit top-control navigation — 2 passed, 0 failed.
- Visual review: `Today`, `Sessions`, and `People` remain fully visible on the
  compact surface; the custom rail uses one restrained glass capsule; the
  opaque fallback removes tint and blur without changing layout.
- Documentation and diff checks — passed.

The implementation is ready for an Xcode 27 validation pass. This plan remains
open because the host has no iOS 27 SDK, so it would be false to claim the beta
minimization API or the new system transparency slider was rendered here.

## Replanning signals

- Revert to the custom header if system toolbar layout cannot keep all three
  named destinations and both global controls reachable at compact width or
  accessibility sizes.
- Do not ship minimization if it breaks the explicit top-control ownership that
  prevents row swipes from changing destinations.
- Remove custom tint before lowering text contrast or obscuring the selected
  destination at either end of the iOS 27 transparency range.
