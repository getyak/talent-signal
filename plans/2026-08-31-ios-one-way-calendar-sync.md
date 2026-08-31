# iOS one-way Calendar sync

## Outcome

Make a confirmed Talent Signal activity the canonical calendar record and
project it one way into Apple Calendar. Confirmation happens once inside
Talent Signal; the app never imports, mirrors, or reconciles Apple Calendar
events.

## Boundary

In scope:

- app-owned, account-scoped persistence before any device write;
- one concise confirmation that names the in-app save and optional Calendar
  sync effect;
- EventKit write-only authorization and direct creation in the system default
  calendar;
- stable operation identity, duplicate prevention, visible sync state, and a
  safe retry after a failed write;
- a Settings field that enables or disables outbound Calendar sync;
- removal of event readback from the relationship-calendar path and removal of
  full Calendar read descriptions from the shipped app.

Out of scope:

- importing system events, listening for EventKit changes, or treating edits
  and deletions in Apple Calendar as Talent Signal truth;
- attendee invitations, recurrence, locations, travel time, or notifications;
- editing or deleting an already-created Apple Calendar projection;
- cross-device backend calendar APIs in this slice.

## Current evidence

- The relationship calendar already has an account-scoped, protected activity
  store, but only persists records after Apple Calendar succeeds.
- Creation currently opens `EKEventEditViewController`, then reads the exact
  event identifier back and rechecks it whenever the calendar opens.
- The legacy standalone onboarding path requests full Calendar access and
  reads a bounded window; this contradicts the desired outbound-only model.
- Settings already uses device-local `AppStorage` preferences and can host the
  outbound-sync field without introducing a second configuration system.

## Chosen approach

Talent Signal owns the event lifecycle. On confirmation it first persists a
stable activity with an explicit Calendar projection state. Before EventKit is
called, `syncing` is durably recorded; a clean provider failure becomes
`failed`, success becomes `synced`, and a relaunched `syncing` operation becomes
`unknown` rather than being retried into a possible duplicate. The write-only
EventKit adapter creates a new event in the system default calendar and records
the returned identifier as a receipt. The adapter never queries events.

The system default calendar is intentionally the only destination in this
slice. Enumerating calendars would widen Calendar access and reintroduce a read
surface. Settings controls whether confirmed events are projected at all.

## Milestones

1. Add failing persistence and write-adapter tests for app-first state,
   migration, permission denial, retry, and duplicate prevention.
2. Replace EventKit editor/readback creation with app confirmation and
   write-only sync.
3. Add Calendar sync settings and remove the legacy full-read entry point and
   usage descriptions.
4. Run focused unit/UI, localization, build, and documentation checks; inspect
   the rendered settings and confirmation surfaces.

## Proof

- confirming an activity persists it even when Calendar permission is denied
  or the write fails;
- an enabled sync makes one EventKit save call and records its receipt without
  calling an event read API;
- retry reuses the same Talent Signal activity and cannot duplicate an in-flight
  or already-synced projection;
- reopening the relationship calendar restores app records without consulting
  Apple Calendar;
- Settings clearly shows outbound-only behavior and can disable it;
- the built app requests only the Calendar write usage description.

## Remaining decision

Cross-device activity continuity still needs a governed backend schedule
resource. The local protected store is the canonical implementation boundary
for this slice; it must be replaceable by that backend repository without
changing EventKit authority.

## Verification record

- Debug simulator build succeeded with the iOS 26.5 SDK.
- 123 focused relationship archive and standalone migration tests passed,
  including app-first persistence and interrupted-write recovery.
- UI tests observed the direct confirmation result, the app-only path when
  sync is disabled, and the outbound-only Settings surface.
- Source inspection found no EventKit event query, calendar enumeration,
  event observer, legacy Calendar access request, or full/read usage string.
- `pnpm ios:localization:check`, `pnpm docs:check`, JSON/plist validation, and
  `git diff --check` passed.
