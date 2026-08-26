# iOS Today relationship calendar

## Outcome

Give Today one quiet, compact entrance into a relationship-scoped calendar.
The expanded agenda should let a recruiter inspect linked relationship moments,
stage a new event through Apple's final editor, and continue meeting preparation
inside the relevant Agent Session with an editable, unsent objective.

## Boundary

In scope:

- one compact next-moment row inside Today;
- a full-screen, week-and-agenda relationship calendar;
- activity detail with one primary `Prepare with Agent` action;
- reuse of an existing Person/Pursuit Session when one exists, otherwise a new
  scoped Session draft;
- a user-authored activity composer that hands the exact title and time to
  `EKEventEditViewController` for final approval;
- preview fixtures, unit/UI coverage, Dynamic Type and dark-mode proof, and one
  interactive design fragment.

Out of scope:

- reading or mirroring the user's full Apple Calendar;
- treating Contacts.framework as a relationship-activity history;
- background calendar writes, invitations, attendee changes, navigation,
  location tracking, or notification automation;
- promoting a generated preparation brief to confirmed relationship state;
- introducing a canonical backend schedule schema in this slice.

## Current evidence

- Today is deliberately sparse and currently exposes attention, recovery, and
  Session continuation rather than a generic dashboard.
- Agent Sessions already retain Person/Pursuit scope and restore an editable
  draft without sending it.
- The screenshot flow already uses EventKitUI as the exact-effect approval and
  records save/cancel based on the system editor result.
- The canonical workspace does not yet expose governed meeting/activity
  records, so the initial agenda must be explicit preview data plus events saved
  during the current calendar presentation.

## Chosen approach

Treat Calendar as a projection over relationship moments, not a second system
of record. Today shows only the nearest moment. The full view uses a compact
week rail and chronological agenda. Event detail offers one useful next step:
prepare in Agent. That action resumes a matching Session and places a scoped,
unsent preparation objective in its composer. Adding an activity opens a small
Talent Signal draft first, then Apple's editor for the final external write.

The preview agenda is clearly synthetic. Canonical workspaces start empty until
a governed schedule source exists; they may still stage an Apple Calendar event
without granting broad read access.

## Milestones

1. Add pure relationship-calendar projection and Agent preparation seed tests.
2. Add the Today entrance, full agenda, event detail, and exact-effect composer.
3. Route preparation back into the matching Session with an unsent draft.
4. Add and run focused UI, accessibility, build, localization, and docs checks.
5. Produce and verify a compact interactive design fragment.

## Proof

- Today exposes the nearest relationship moment without increasing the
  attention count or replacing the focus item.
- The calendar opens, changes selected dates, displays linked context, and
  exposes a minimum 44-point add action.
- `Prepare with Agent` reopens the matching Session and preserves an editable
  preparation prompt; it does not auto-send.
- `Add activity` cannot claim success until Apple's editor returns `.saved`;
  cancel remains visibly unchanged.
- the screen remains usable at 360 points, accessibility Dynamic Type, reduced
  motion, and dark appearance.

## Important remaining decision

A later backend slice must define the canonical meeting/activity projection,
including source authority, recurrence, edits, deletion, and synchronization.
This design deliberately does not infer that model from Contacts or ambient
Calendar access.

## Completion evidence

- Debug and Release simulator builds succeeded on 2026-08-27.
- `RelationshipArchiveTests` passed: 48 tests, 0 failures.
- Three focused UI tests passed for Today-to-Session preparation, exact-effect
  EventKit cancellation, and dark-mode accessibility Dynamic Type.
- The existing editorial Today UI proof still reports the same attention count;
  the calendar entrance does not inflate work attention.
- `pnpm ios:localization:check` passed with 249 catalog keys, and the string
  catalog parses as valid JSON.
- `pnpm docs:check` passed, including canonical docs, wiki, and architecture
  diagrams.
- The interactive fragment was verified at 736-point and 360-point widths in
  light and dark appearances with no horizontal overflow or interaction errors.
