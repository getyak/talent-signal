# Calendar management workspace

## Outcome

Turn the iOS Calendar from a sparse date browser into a calm relationship-time
workspace. A recruiter should be able to orient to the next commitment, inspect
the day, long-press any activity for relevant actions, and review an edit before
Talent Signal updates the exact linked Apple Calendar event.

Completion evidence:

- the rendered Calendar leads with the selected day and the next relevant
  activity rather than counts or generic dashboard chrome;
- list rows and week-grid events expose the same long-press edit, detail,
  person, and Agent preparation routes where the source permits them;
- editing shows a before/after review and names the Apple Calendar consequence
  before confirmation;
- a linked event is updated by its stored EventKit identifier, never recreated;
- pending, failed, missing, and unknown update results remain visibly distinct;
- focused model, service, UI, localization, accessibility, and documentation
  checks pass.

## Boundary

In scope: Calendar information hierarchy, row action discoverability, local
activity editing, exact-event Apple Calendar updates, permission copy, update
receipts, retry behavior, and accessibility actions.

Out of scope: importing the user's whole Apple Calendar, deleting events,
editing relationship identity from Calendar, recurring-series management,
automatic rescheduling, conflict scoring, or sending messages.

## Current evidence

- `docs/evaluations/2026-09-05-calendar-management/01-current-calendar.png`
  shows a correct but underpowered screen: date controls dominate, the next
  commitment has no visual lead, actions are hidden, and most of the viewport is
  unstructured empty space.
- The activity store persists before device writes and already keeps an EventKit
  identifier plus explicit `pending`, `syncing`, `synced`, `failed`, and
  `unknown` states.
- Device sync currently creates only. Reusing that path for an edit would create
  a duplicate, so update must be a separate identifier-bound operation.
- iOS write-only Calendar permission is sufficient for creation but exact-event
  lookup for editing requires a separately explained full-access request.

## Chosen approach

Use an agenda-first editorial composition:

1. selected-day orientation and a compact view switch remain at the top;
2. a restrained `Next` focus strip leads to the nearest activity and its
   preparation route;
3. the full agenda remains a time rail, with a visible 44-point overflow menu
   on list rows and native context menus everywhere;
4. edit is a two-step sheet: change fields, then review only the differences and
   the exact external effect;
5. confirmation first persists the changed activity as pending, then updates the
   existing EventKit event by identifier and records the observed result.

Rejected:

- an Apple Calendar clone, because it loses relationship context and preparation;
- KPI cards and schedule scores, because they create dashboard density and can
  imply judgment unsupported by evidence;
- silent one-tap editing, because it obscures an external write;
- recreating a missing linked event, because it can duplicate or target the
  wrong commitment.

## Milestones

1. **Complete — model and external write integrity.** Identifier-bound update,
   full-access permission handling, explicit missing-event failure, and focused
   routing tests are implemented.
2. **Complete — edit and long-press loop.** Reviewable editing plus matching
   list, grid, detail, accessibility, and retry actions are implemented.
3. **Complete — agenda-first visual hierarchy.** The selected day, agenda,
   empty, overlap, sync-attention, Chinese, dark, and AX5 states were rendered
   and refined.
4. **Complete — proof and review.** Ninety-four model/service tests and nine Calendar
   UI workflows pass; the same-state before/after audit is documented and the
   workflow, mobile UX, and evidence-safety verdict is `pass_with_changes`.

## Verification

- `RelationshipArchiveTests`: 94 passed, 0 failed.
- `RelationshipCalendarWorkflowUITests`: 9 passed, 0 failed.
- iOS Simulator build: succeeded on iPhone 17 Pro / iOS 26.5.
- Remaining external proof: edit and EventKit readback on a physical iPhone.

## Decisions that could change the direction

- Editing a governed relationship activity stays unavailable until its canonical
  owner exposes a versioned mutation API; Calendar must not overwrite derived
  relationship truth.
- Preview activities may demonstrate editing in memory but never request Calendar
  permission or claim an external effect.
- An unknown EventKit result blocks another update until the user checks Apple
  Calendar; retrying an uncertain write could overwrite unseen changes.
