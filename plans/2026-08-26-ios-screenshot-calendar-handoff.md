# iOS screenshot to Calendar handoff

## Outcome

Turn an explicitly reviewed screenshot statement about an interview or meeting
into one compact Agent proposal with two immediate choices: open the exact event
in Apple's Calendar editor or dismiss the proposal. Calendar success and cancel
states must come from EventKitUI rather than an optimistic in-app toast.

## Boundary

In scope:

- candidate-speaker-confirmed screenshot text with both meeting semantics and a
  locally parseable date;
- a concise proposal that leads with person, event type, and time;
- one `Add to Calendar` action and one reversible `Dismiss` action;
- EventKitUI as the final editable approval surface;
- saved, cancelled, dismissed, and restored states;
- focused model tests, iOS build/tests, and rendered design proof.

Out of scope:

- treating availability alone as meeting consent;
- inviting attendees, sending messages, copying screenshot text into Calendar,
  or reading the broader calendar database;
- silently resolving an ambiguous speaker, identity, date, or timezone;
- background location, contact-directory ingestion, or an autonomous Agent
  calendar write.

## Current evidence

- Screenshot capture already has local OCR, editable text, explicit speaker
  review, temporal identity review, relationship binding, Wiki compilation,
  and a ContactsUI handoff.
- The deterministic candidate-momentum fixture already distinguishes explicit
  meetings from availability, but approved meeting cards remain local-only.
- The capture completion surface has the confirmed Person and exact reviewed
  source text needed to stage a device-owned Calendar proposal.

## Chosen approach

Use a deterministic local detector only as a proposal gate. It requires
candidate attribution, meeting language, and a Foundation date match. The
proposal copies only a minimal title and start/end time into a new `EKEvent`.
`EKEventEditViewController` owns final editing and save/cancel; no event-store
read or direct background save is requested.

## Milestones

1. Add the pure proposal model and adversarial tests.
2. Add the compact Calendar handoff and integrate it after screenshot review.
3. Reduce the design mockup to the same two-choice hierarchy.
4. Build, test, render, and audit saved/cancelled/dismissed behavior.

## Proof

- tests show explicit candidate meeting evidence produces one proposal;
- availability-only, recruiter-attributed, past, and date-free text abstain;
- the app builds with EventKitUI and contains the required calendar usage copy;
- the proposal UI presents only two primary choices before the system editor;
- the saved receipt is driven by `.saved`, while cancel creates no success;
- the mockup is readable at 360 px and in dark appearance.

## Completion evidence

- `RelationshipCaptureTests` passed 17 tests, including English and Chinese
  meeting proposals, editable default duration, availability-only abstention,
  wrong-speaker abstention, past/date-free abstention, and receipt deduplication.
- The focused UI test passed on iPhone 17 Pro Simulator: it rendered the compact
  proposal, opened the real Apple `New Event` editor, cancelled through Apple's
  discard confirmation, observed `Calendar unchanged`, then dismissed and
  restored the proposal without a write.
- A separately gated UI test saved the synthetic event through Apple's `Done`
  control and observed the app's `.saved` receipt. It ran only on a disposable
  Simulator, which was deleted with the test calendar immediately afterward.
- The ordinary Debug matrix passed 18 focused tests; the gated save proof was
  correctly skipped there, for 19 total with zero failures. The Release
  simulator build completed successfully. The compiled app contains the
  localized Calendar usage description, and the handoff source makes no
  calendar-read or direct-permission request.
- Localization, JSON, whitespace, and `pnpm docs:check` checks passed.
- The interactive design fragment passed 360 px and 736 px overflow checks in
  light and dark appearance. Evidence, editor, cancel, dismiss, restore, saved,
  and optional-framework states all responded to real controls.
