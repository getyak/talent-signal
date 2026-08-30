# iOS Calendar and Ask reliability correction

## Outcome

Make the owner-only TestFlight loop truthful and recoverable when a recruiter
saves one reviewed Apple Calendar event or sends one unscoped Ask message. A
saved event must survive closing and reopening Talent Signal on the same
device, and a text message must continue automatically after the recruiter
selects its relationship scope.

## Boundary

In scope:

- exact-event verification after Apple's editor reports a save;
- protected, account-scoped device persistence for the relationship link and
  minimal event projection;
- exact-identifier reconciliation on calendar reopen without broad Calendar
  ingestion or a new permission prompt;
- automatic continuation of a text Ask after explicit scope selection;
- deterministic rejection of calendar, meeting, and reminder commands from
  the contact-intake parser;
- visible, recoverable network failure copy and focused iOS tests;
- rebuilding and restarting the existing tailnet-only TestFlight backend.

Out of scope:

- a canonical backend meeting schema or cross-device Calendar sync;
- ambient Calendar reads, invitations, attendee changes, or background writes;
- allowing Chat or a model to execute an external Calendar effect;
- remotely enabling Tailscale on the user's iPhone.

## Current evidence

- The canonical calendar projection returns no activities and the composer
  appends a saved event only to view-local state.
- EventKitUI `.saved` is presented as success without exact-event readback.
- A recent phone session authenticated and completed canonical reads, but sent
  no `/v1/chat/tasks` request.
- Text-only unscoped input opens scope selection without setting the pending
  continuation that attachment input already uses.
- The deterministic Chinese contact-intent expression classifies
  `创建对应的日历` as a contact command and extracts `对应的日历` as a name.
- The TestFlight API and tailnet HTTPS health endpoint are healthy; the iPhone
  itself was offline in Tailscale during the final diagnostic snapshot.

## Chosen approach

Keep the external-write authority in Apple's editor. Verify only the exact
returned event identifier, then persist the minimal relationship projection in
an account-scoped, file-protected device store. On reopen, reconcile only those
known identifiers. Missing events are removed only when Calendar read authority
makes absence observable; unavailable verification remains explicitly unknown.

Reuse the existing `pendingScopedSend` continuation for text as well as media.
Keep contact intake deterministic by excluding clearly non-contact external
effect nouns before any local or Foundation Model contact classification.

## Milestones

1. Add failing parser, persistence, reconciliation, and unscoped-send coverage.
2. Implement verified Calendar completion and protected same-device restore.
3. Fix Ask continuation, intent routing, and connection recovery copy.
4. Run focused unit/UI tests, Release build, localization, and docs checks.
5. Rebuild/restart the TestFlight backend and verify tailnet health; leave the
   iPhone VPN action explicit for the user.

## Proof

- a saved exact event is observed before success and restored after view/app
  reconstruction on the same account;
- cancellation, unknown verification, deletion, and unavailable read access do
  not claim success or create a duplicate retry;
- one text Send followed by one scope selection produces the pending turn and
  backend request without a second Send tap;
- `创建对应的日历` and equivalent Calendar/meeting/reminder commands never stage
  a contact proposal;
- offline failure preserves the draft and names the safe recovery step;
- focused checks and the tailnet HTTPS health probe pass.

## Important remaining decision

Cross-device schedule continuity still requires the separately governed
backend activity model called out by the original relationship-calendar plan.
This correction does not silently turn a device receipt into canonical shared
truth.

## Verification record

- Debug and Release simulator builds succeeded.
- The focused contact-intake and relationship archive suites passed 84 tests
  with zero failures.
- The complete unit suite passed 220 tests with zero failures during the iOS
  release gate.
- Focused UI journeys passed for calendar cancellation, calendar navigation at
  accessibility text sizes, unscoped Ask continuation, canonical Ask pending
  and response states, and editable voice input.
- The localization boundary passed with all new failure and verification copy
  present in English and Simplified Chinese.
- The existing TestFlight backend image was reused to avoid incorporating
  unrelated dirty backend work; migrations, Apple authentication, remote Ask,
  remote voice, loopback binding, and tailnet HTTPS probes all passed.
- The Mac tailnet node is online. The iOS peer remains offline, so enabling
  Tailscale on the phone is still a required user-owned recovery step.
- The full 85-journey UI gate was stopped after it exposed unrelated failures
  in concurrent workspace work; those failures were not treated as evidence
  against this isolated correction.
