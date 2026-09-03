# Native iOS Talent Signal Lab

## Outcome

Add the product-native Talent Signal Lab to the authenticated SwiftUI app so
an internal TestFlight tester can see the active synthetic world, replay one of
the five versioned scenarios, inspect a result through Signal Lens, compare the
candidate with its exact baseline, and record or explicitly promote a Reality
Receipt without leaving the phone.

Completion evidence is an iOS build that reads the existing authenticated Lab
contract, hides its entry point when the backend capability is disabled, shows
the compact `LAB · FAT · identity · Agent` capsule when enabled, and completes
the session → run → comparison → receipt → promotion journey while every
displayed run proves zero canonical mutations and zero external effects.

## Boundary

- The existing backend Lab objects and frozen scenario catalog remain the only
  source of truth. iOS adds no parallel fixture, mutable flag composer, or
  client-authored receipt narrative.
- A server-confirmed capability is required before the capsule appears. Release
  builds do not gain a local override, simulated login, bearer-token display,
  or production-data access.
- Signal Lens opens only for the exact persisted Lab Run it explains. It does
  not attach a synthetic explanation to a canonical relationship card.
- Receipt promotion is a separate, explicit human quality decision. It changes
  only the Eval control plane and never confirms relationship state or executes
  an external action.
- Full time travel, arbitrary flags, packet capture, raw screenshot retention,
  and a generic debug menu remain out of scope.

## Product and design read

Primary surface: a quiet capsule above Today that opens a focused native Lab
sheet. The user question is: “Which test world am I in, why did this result
appear, and can I reproduce or record it without touching canonical truth?”

Canonical objects remain `LabSession`, immutable `LabRun`, `LabComparison`,
`RealityReceipt`, and promoted `LabEvalCase` in the quality-control namespace.
The iOS screen is a projection of those objects. Observation precedes
interpretation; uncertainty and human-decision requirements remain visible;
version and Trace details use progressive disclosure.

The capsule is the only glass control because it is navigation chrome. Scenario,
evidence, comparison, and receipt content use the existing warm neutral SwiftUI
surfaces. Vermilion marks the causal seam and consequential quality decision,
never confidence or a person's value. System typography, 44-point controls,
VoiceOver labels, Dynamic Type reflow, opaque Reduce Transparency fallback, and
icon-plus-text status semantics are required.

## Chosen approach

1. Mirror the existing TypeBox contract in native value types and add one
   authenticated, idempotent Lab client that supports the repository's
   loopback-only Debug login boundary.
2. Add a main-actor store that owns manifest capability, active session, latest
   run, comparison, receipt, promotion, pending operation, retry, and error
   recovery without caching sensitive content outside the server objects.
3. Integrate a capability-gated capsule into the authenticated relationship
   workspace and present a SwiftUI Lab with named scenarios, current world,
   exact evidence, Signal Lens, baseline comparison, and receipt flow.
4. Add focused decoding, request, state-transition, capability, idempotency,
   and Release-boundary tests. Extend the iOS documentation without duplicating
   the canonical Lab architecture.
5. Exercise the actual loopback backend from Simulator, inspect light/dark and
   accessibility layouts, run the iOS suite, and review the result against
   `REVIEW.md`.

## Milestones

1. **Complete — native contract and state boundary.** Native models mirror the
   existing contract; the authenticated client rejects stale contracts,
   mismatched snapshots, and unredacted receipts; the store rejects any
   capability, Run, comparison, receipt, or promotion that cannot prove the
   zero-effect boundary.
2. **Complete — native product surface.** The Today capsule opens the four-task
   Lab, five scenario worlds, Signal Lens, identical-snapshot comparison,
   redacted Reality Receipt, and explicit human promotion. English and reviewed
   Simplified Chinese copy live in the String Catalog.
3. **Complete — real-surface verification.** A capability-enabled loopback
   backend completed the native session → candidate Run → Signal Lens →
   baseline comparison → receipt → Eval promotion journey on iPhone 17. The
   Chinese dark-mode, AX5 Dynamic Type, Reduce Motion, and Reduce Transparency
   surface also passed on iPhone SE (3rd generation).
4. **Complete — local completion review.** The final rebased revision passes
   Release compilation, the 280-test repository iOS gate, localization and
   documentation checks, the real-backend Lab quality-evidence UI journey on
   iPhone 17 Pro, and the Chinese dark-mode AX5 accessibility surface on
   iPhone SE (3rd generation). The UI journey result bundle records one pass,
   zero failures, and zero skips.
5. **Complete — integration and distribution.** PR #111 passed every required
   check and was squash-merged as `03527f62512912df4cfce5fb560fc3d066d258cd`.
   The automatic release published TestFlight version `0.1.40`, build
   `20260903174005`; its immutable receipt records `testflightState: processed`
   at `2026-09-03T17:55:41Z` and is attached to GitHub prerelease `v0.1.40`.

## Re-plan triggers

- If iOS cannot verify the exact Lab contract version, show a recoverable error
  and no capsule rather than decoding a partial world.
- If the candidate and baseline snapshot hashes differ, comparison must be
  rejected by both the backend and the iOS projection.
- If a receipt cannot be produced from a persisted run, no local screenshot or
  free-text fallback may be presented as a Reality Receipt.
- If the Simulator cannot authenticate against the real internal backend, use
  the existing loopback-only simulated login for visual proof; never add a
  Release override.
