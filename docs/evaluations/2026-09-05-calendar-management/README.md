# Calendar management workspace evaluation

Date: 2026-09-05
Surface: iOS relationship Calendar
Mode: combined UX, accessibility, workflow, and external-write review
Evidence: synthetic preview data only

## User goal and accessibility target

A recruiter opens Calendar in one of three practical states of mind:

1. **Orient:** understand what is next, whether anything still needs attention,
   and which relationship the time belongs to.
2. **Adjust:** correct a title, type, start time, or duration without losing the
   Person and relationship context.
3. **Reconcile:** know whether Apple Calendar reflects the confirmed change and
   recover safely when permission, lookup, or save fails.

The critical path must remain understandable with Dynamic Type, VoiceOver,
reduced motion, and without interpreting color.

## Captured flow

1. **Comparable original Calendar — needs structural improvement.**
   [`00-comparable-before.png`](00-comparable-before.png) uses the same five
   preview activities as the new build. The date controls dominate; the
   selected day, current temporal status, and useful next action have no visual
   lead. Activity actions are not discoverable from the row.
2. **Comparable agenda-first Calendar — healthy.**
   [`01-comparable-after.png`](01-comparable-after.png) gives the
   selected day the dominant heading, keeps date navigation compact, turns the
   schedule into a continuous time rail, and exposes one 44-point action menu on
   every list item. Overlap remains textual as well as colored.
3. **Activity actions — healthy.**
   [`03-activity-actions.png`](03-activity-actions.png) shows a short native menu:
   edit, open, prepare, and view the governed person record. The same commands
   remain available through long press and accessibility custom actions; failed
   sync adds retry without adding a destructive command.
4. **Edit review — healthy for the captured preview path.**
   [`04-edit-review.png`](04-edit-review.png) keeps Person and relationship scope
   fixed, shows only changed fields as before/after values, states the external
   effect, and places one final update action after the consequence. Preview
   explicitly requests no permission and performs no external write.
5. **Simplified Chinese week view — healthy.**
   [`05-chinese-week.png`](05-chinese-week.png) preserves the selected horizon,
   count, preview boundary, swipe instruction, time rail, and readable event
   geometry without falling back to English interface copy.
6. **Dark AX5 week list — healthy with a named evidence limit.**
   [`06-dark-ax5-week-list.png`](06-dark-ax5-week-list.png) confirms the
   accessibility fallback becomes a vertical agenda and keeps the row action
   targets reachable. The captured frame is intentionally mid-scroll and does
   not assess the initial top-of-page composition at AX5.

## Structural findings addressed

- The screen now answers “which day and what belongs to it?” before exposing
  secondary filters or metadata.
- The visible overflow control makes long-press capability learnable without
  assigning horizontal swipe to both paging and row actions.
- Calendar edits cannot change Person identity or relationship context.
- A linked activity routes to an EventKit update by its saved identifier. A
  missing linked event becomes a distinct state and never falls back to create.
- Update permission is requested at confirmation time. Creation keeps the
  narrower write-only permission.
- Local pending state is persisted before the device write; success is shown
  only after EventKit save and readback. Failure, missing, and unknown results
  remain distinct.
- Editing and review use the activity's recorded time zone, so a device time-zone
  change cannot silently shift the commitment between the two steps.
- A reviewed linked-event update remains an explicit write even when the default
  setting for creating new Calendar events is off; that preference still blocks
  unlinked creation.
- Permission, missing-default-calendar, and unsupported-OS failures keep a
  controlled reason across relaunch so the detail screen preserves the right
  recovery guidance and does not offer an impossible retry on an unsupported OS.
- Every reviewed edit appends an operation receipt with the reviewer scope,
  before/after values, intended device effect, and observed outcome. An
  interrupted write restores as unknown rather than being mistaken for success
  or retried automatically.

## Accessibility observations

Confirmed from the captured UI and accessibility tree:

- all date navigation, row action, edit, and confirmation controls use at least
  a 44-point target;
- the selected date, preview boundary, overlap, and Calendar state have text,
  not color-only meaning;
- each activity exposes open, edit where safe, person, and Agent preparation as
  named accessibility actions;
- the edit review reads relationship, changed fields, effect, then confirmation
  in consequence order;
- Simplified Chinese week layout and the dark AX5 agenda fallback complete their
  automated UI paths without clipping the required actions.

Still requires real-device verification:

- VoiceOver rotor order after EventKit's system permission sheet;
- Calendar permission changes while the app is backgrounded;
- Dynamic Type AX5 and Simplified Chinese on the linked-event review path;
- EventKit recurring-event identifiers and destination readback on a physical
  iPhone;
- reduce-transparency rendering of iOS system glass controls.

## Review verdicts

- Recruiter workflow: `pass_with_changes`; preview/edit/confirm and duplicate
  prevention are covered, while real-device reconciliation remains required.
- Mobile UX: `pass_with_changes`; task hierarchy, native interaction, state
  language, and recovery are present, while the full device and appearance
  matrix is not yet complete.
- Evidence safety: `pass_with_changes`; exact target, explicit authorization,
  idempotent routing, and unknown-state handling are implemented, while an
  actual Apple Calendar readback cannot be claimed from Simulator evidence.

Independent review findings covering sync-off intent, editor/review time zone,
full-access disclosure, unlinked retry promises, and relaunch recovery guidance
were corrected and covered by 94 focused model/service tests. The final audit
also added persistent edit receipts so a newer current value cannot erase the
review and readback trail. A missing linked event intentionally remains blocked
instead of offering an implicit replacement; recovery design requires a
separate, auditable unlink or recreate decision.

No claim of complete accessibility conformance or production EventKit
reconciliation is made from screenshots alone.
