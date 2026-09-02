# iOS Today inline decisions

Status: completed

## Outcome

Make the iOS Today surface a compact decision desk: show the nearest confirmed
relationship moment as a quiet time anchor, then let the recruiter judge a
small number of typed Contact or Calendar proposals through three explicit
choices without first navigating into a generic review page.

The selected source visual is Product Design option 2, `Compact Action Stack`,
preserved at
`docs/evaluations/2026-09-02-ios-today-inline-decisions/selected-direction-2.png`.

## Boundary

In scope:

- a compact Today date/title treatment;
- the next confirmed relationship-calendar activity as an elegant reminder;
- up to two typed, compact inline decision cards in the preview workspace;
- visible `Add`, `Edit`, and `Dismiss` choices with evidence one tap away;
- truthful preview decisions, edits, dismissal, and undo without external
  writes;
- preservation of the existing canonical attention, recovery, and no-action
  paths when no typed inline decision contract is available;
- accessibility, dark appearance, Dynamic Type, focused tests, simulator
  capture, and visual comparison with the selected source.

Out of scope:

- inventing a canonical Contact or Calendar proposal schema not returned by the
  backend;
- silently treating a generic Proposal as authority for an external write;
- writing sample data to Contacts or Apple Calendar;
- replacing Sessions, People, the global composer, or the full relationship
  calendar;
- candidate scoring, fit, personality, or acceptance prediction.

## Meaning and authority

- The confirmed calendar activity is a read-only projection and does not enter
  the decision count.
- An inline card is a proposal, not confirmed state or an observed outcome.
- `Add` in the synthetic preview records only the preview decision and states
  that no external write occurred.
- Evidence remains one tap from the decision.
- Canonical external effects continue to require exact target/effect preview,
  execution-time permission checks, duplicate protection, and destination
  readback in their governed flow.

## Completion evidence

- Release simulator build passed for iPhone 17 Pro, iOS 26.5.
- Three focused UI tests passed, covering the default hierarchy, every inline
  decision state, and Simplified Chinese dark AX5 with Reduce Motion.
- Two focused calendar unit tests passed.
- The documentation and localization boundaries passed.
- Visual comparison and focused receipt screenshots are stored under
  `docs/evaluations/2026-09-02-ios-today-inline-decisions/`.
- The root `design-qa.md` ends this slice with `final result: passed`.
