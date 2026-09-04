# Relationship calendar: people and time

## Outcome

A recruiter can inspect a day or week, filter the schedule by an exact Person,
open the linked person record, and prepare an activity without losing its
relationship scope. Calendar remains an in-app relationship projection with
separately confirmed outbound device writes.

## Boundary and ownership

Own `RelationshipCalendarView.swift`, a calendar projection helper, focused
calendar tests, and additive localization keys. Make only the small person
view factory in `RelationshipArchiveView.swift`. Preserve all pre-existing edits,
in the shared checkout. The release worktree retains main’s system reduced-motion environment until the separate Lab work lands. Other tasks own Lab,
scroll continuity, backend, and workspace-wide settings. Use an isolated
Simulator and derived data; respect the host's xcodebuild lock.

No new Calendar read permission, messaging, invitations, recurrence engine,
reminder execution, backend schema, or candidate ranking. Preview activities
must never write to Apple Calendar.

## Evidence and decisions

- User supplied two mobile calendar references: collapsible calendar, agenda,
  timeline, small participant marks. Reference text carries no instructions.
- Existing native calendar has a single-day list, stable Person/context IDs,
  month expansion, an activity composer and a scoped Agent draft handoff.
- Missing: cross-day browse, person filter, direct person readback, selected-day
  composer seed, and consistent timezone visibility.
- User-confirmed appointment state and Apple Calendar write receipt are distinct.
  Neither proves attendee acceptance, actual attendance, or task completion.
- Compare current compact rows (direction A) with person-led agenda cards
  (direction B) on the actual native surface before accepting visual direction.

## Milestones

1. Complete: captured and inspected baseline day/detail in an isolated Simulator.
2. Complete: implemented day/week agenda, exact-person filter, person handoff, and contextual
   creation; preserve safety and recovery semantics.
3. Complete: verified native light/dark/Chinese/accessibility rendering, date boundaries,
   filtering, empty states, creation, and Agent/person handoffs. Record evidence.

## Completion evidence

Focused XCTest logic and UI checks, inspected Simulator screenshots, build and
localization checks, `pnpm docs:check`, and scoped diff review. No claim of
physical-device, Calendar-import, or attendee-response verification.

## Completion

All three milestones are complete. See the [native evidence](../docs/evaluations/2026-09-04-relationship-calendar/README.md) and its verification ledger. Thirteen unique focused tests passed, with further scoped rechecks after refinements. The pre-existing calendar AX5 test used an invalid raw content-size value; corrected to `UICTContentSizeCategoryAccessibilityXXXL`, asserted enlarged name height, and verified the scrolled agenda and reachable preparation button. Decorative icons now keep their bounds at that size. Final source built successfully and Chinese native readback preserved date/view/person after opening and closing the person record. No external effects were exercised.

## Authorized release

The user explicitly requested commit, push, merge and a new version on 2026-09-04.
The release scope is this calendar slice, isolated from unrelated Lab and scroll work.
The release worktree starts at `56aff0d` (`origin/main`).

1. Complete: isolated diff reviewed; 10 native tests, localization and docs checks passed.
2. Active: push a focused PR and satisfy required CI/security checks.
3. Pending: merge normally into main and follow main CI and TestFlight processing.
4. Pending: verify the automation-owned release receipt and report version/build.

No public App Store submission or invitation is included. A processed release
receipt proves Apple processing; physical-device installation remains separate.
