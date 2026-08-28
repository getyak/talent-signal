# iOS standalone onboarding golden journey

## Outcome

Let a first-time recruiter complete one recoverable, local-first journey from a
new Pursuit and one explicit source through an evidence-backed Proposal, human
review, verified progress, an optional system-capture practice, and the real
Today destination. The journey proves that activation is a reviewed change or
accepted next action, not a permission grant, import, or model response.

## Boundary

In scope:

- one standalone onboarding adapter in the existing iOS application;
- durable local session, Pursuit, source, Signal, Proposal, review, progress,
  and capability state with stable identifiers and safe retry behavior;
- real EventKit authorization/readback and bounded meeting selection, with an
  explicitly labeled Debug demo meeting path;
- voice and text capture with a draft saved before permission or processing;
- an on-device intelligence adapter where available and a visible,
  versioned deterministic Demo engine only for the showcase fixture;
- review that distinguishes source facts, inference, and unknowns and supports
  confirm, edit, unresolved, wrong-Pursuit, and discard outcomes;
- optional App Shortcut / Action Button practice without claiming the app can
  configure or inspect the hardware mapping;
- a privacy-safe Live Activity feedback surface for foreground recording,
  organizing, and ready-to-review state, with an explicit stop request bridge;
- an App Group Share Extension inbox for append-only image, text, and URL
  CaptureEnvelopes, imported idempotently into the same capture/review flow;
- a local Today projection that opens the resulting Pursuit, Source, Signal,
  and Proposal and survives relaunch;
- focused unit/UI tests, build proof, accessibility checks, and run guidance.

Out of scope:

- replacing the existing authenticated canonical workspace or widening any
  backend authority;
- background or ambient recording, candidate-facing sends, Calendar writes,
  Contacts import, Gmail, ATS/CRM effects, or Action Button auto-configuration;
- treating a simulator gesture, deterministic fixture, or local account as a
  production Apple, hardware, Calendar, or AI result;
- background or ambient recording merely to keep a Live Activity alive; the
  activity remains feedback rather than recording authority.

## Current evidence and unknowns

- The existing app already has Pursuit-first Today, text/screenshot/foreground
  audio capture, App Shortcuts, EventKitUI write handoff, protected local
  outboxes, and deterministic UI launch routing.
- Release authentication and canonical workspace behavior are production-shaped
  and must remain intact. The standalone flow therefore uses an explicit adapter
  and cannot silently substitute local fixture facts after a backend failure.
- The current deployment target is iOS 16. System APIs introduced later must be
  availability-gated so the existing app keeps building; the intended showcase
  surface is iOS 26+.
- Physical-device Calendar, microphone, Speech, Foundation Models, and Action
  Button proof may remain environment-dependent. Simulator paths must name that
  limitation instead of converting it into a pass.

## Chosen approach

Add a narrow `StandaloneOnboarding` feature with a pure reducer-like domain
state and an atomically persisted JSON document in Application Support. Keep
system authority in adapters: EventKit authorization is recomputed on entry and
foreground return, capture writes the draft before requesting permission, and
the proposal engine reports whether it is on-device or deterministic Demo.
Route into the feature only through the explicit standalone environment (and
its deterministic UI-test arguments), leaving the authenticated Release and
existing fixture routes unchanged.

The review composition follows the repository's quiet evidence instrument:
source first, a restrained causal redline, proposed facts, inference, unknown,
and one consequence-named action. Today is a projection of the persisted
review result, not a second record.

Rejected alternatives:

- Replacing `RelationshipArchiveView` with local onboarding would regress the
  canonical account boundary.
- Static mock screens would not prove persistence, recovery, permissions, or
  activation invariants.
- Reusing EventKitUI's create-event flow would test a Calendar write, while
  onboarding requires bounded read access and selection.
- A hidden fixed model response for arbitrary private text would misrepresent
  the deterministic fixture as intelligence.

## Milestones

1. Add durable domain/state, atomic storage, invariants, and tests.
2. Implement Welcome through source choice and recoverable checkpoints.
3. Add real Calendar authorization/read adapter and deterministic labeled demo.
4. Add text/voice draft capture and proposal engine availability/fallback.
5. Add evidence review, edit/unresolved/discard behavior, verified progress,
   optional system-capture practice, and Today readback.
6. Add UI automation and verify build, tests, relaunch, small-device, dark,
   Dynamic Type, denied/empty/fallback, and reduced-motion states.
7. Review against `REVIEW.md`, update iOS run instructions and completion
   evidence, and leave any device-only uncertainty explicit.
8. Add the required Live Activity and Share Extension targets only after the
   core journey is proven; verify their shared-state boundaries and embedding.

## Completion proof

- A deterministic UI journey reaches Today through the same reducer and store
  used by the interactive feature, with visible Demo labels where applicable.
- Unit tests prove invalid/stale/duplicate transitions are safe, drafts precede
  permission/processing, Unknown alone does not activate, and confirm/edit or
  an explicitly accepted next action creates exactly one verified progress.
- Relaunch restores the last valid route and the resulting Today projection.
- EventKit denied, restricted/write-only, empty, and meeting states each have a
  truthful continuation; system status is never replaced by a local boolean.
- Text completes the journey when voice, Speech, or Foundation Models are not
  available.
- Existing focused iOS tests and a Release build remain green, plus
  localization and documentation checks.

## Completion evidence — 2026-08-27

- Pre-freeze verification passed the Release generic build plus 19
  `StandaloneOnboardingTests`, three `ReleaseBoundaryTests`, and both
  `StandaloneOnboardingUITests`. The end-to-end test reaches real Today through
  create Pursuit, Demo experience, Calendar purpose screen, meeting selection,
  text Signal, Proposal review, explicit Fact selection, confirmation, verified
  progress, and visibly simulated Action Button practice.
- Delivery remediation closed three pre-freeze release blockers: the standalone
  deep link now compiles inert outside Debug; relaunch converts interrupted
  permission, recording, transcription, and Proposal processing phases into a
  preserved recoverable Draft; and model-proposed facts require a source-locatable
  evidence excerpt while all Proposal facts begin unselected.
- The app, Live Activity extension, and Share extension install and register on
  the iOS 26.5 simulator. Their signed entitlements share only
  `group.com.talentsignal.app`; extension property lists and activation rules
  validate, and shared-inbox tests prove atomic image/text/URL enqueue plus
  idempotent import.
- Unit tests additionally prove draft-before-permission, Unknown-only no-action,
  stale generation rejection, idempotent confirmation, edit-before-confirm,
  wrong-Pursuit preservation, discard/reset recovery, one-time unassigned App
  Intent routing, and draft-scoped Live Activity stop requests.
- The standalone Today surface was visually reviewed in the simulator in light
  mode and dark mode at accessibility Dynamic Type. The source/fact/inference/
  unknown hierarchy, adaptive action layout, and provenance remain readable.
- `pnpm ios:localization:check`, `pnpm docs:check`, property-list validation,
  entitlement inspection, and `git diff --check` pass.

Device-only uncertainty remains explicit: a physical-device pass is still
required to observe the real EventKit, microphone, and Speech permission sheets;
download/use on-device Speech and Foundation Models assets; exercise the
hardware Action Button; and interact with the Live Activity and system Share
Sheet. The adapters and extension boundaries compile and are simulator-tested,
but that is not presented as hardware or account proof.

## Replanning signals

Re-plan if Xcode availability prevents the required iOS 26 APIs from compiling,
the existing target cannot isolate standalone state from authenticated state,
or real device entitlement/capability evidence requires a product decision.
