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

## Milestones

1. Preserve the current dirty worktree and identify the narrow Today and
   calendar projection seams.
2. Implement the compact reminder and inline decision stack with complete local
   interaction states.
3. Add focused domain/UI coverage for the three-choice contract and preview
   truth boundary.
4. Build and exercise the real iOS Simulator surface, including edit, dismiss,
   restore, evidence, dark mode, and accessibility text.
5. Compare the selected source and implementation in one visual artifact,
   resolve P0-P2 differences, and append a passing `design-qa.md` section.

## Proof

- The initial iPhone 17 Pro viewport shows the next calendar moment and both
  decision cards without hiding the three choices.
- `Add`, `Edit`, and `Dismiss` are all at least 44 points and have distinct
  accessibility identifiers and labels.
- Editing changes the exact visible effect before approval.
- Dismissal is reversible and never claims an external result.
- Evidence can be opened from each pending card.
- The existing canonical Today and calendar routes remain reachable.
- Focused tests and a Release simulator build pass.
- The final source/implementation comparison has no actionable P0, P1, or P2
  mismatch, and the root `design-qa.md` ends this slice with
  `final result: passed`.

## Completion evidence

- Release simulator build passed for iPhone 17 Pro, iOS 26.5.
- Three focused UI tests passed, covering the default hierarchy, every inline
  decision state, and Simplified Chinese dark AX5 with Reduce Motion.
- Two focused calendar unit tests passed.
- `pnpm docs:check` passed.
- `pnpm ios:localization:check` remains blocked by 197 pre-existing legacy
  bilingual calls against the repository allowance of 176; all new copy in
  this slice is catalog-backed and does not add to that debt.
- Visual comparison and focused receipt screenshots are stored under
  `docs/evaluations/2026-09-02-ios-today-inline-decisions/`.
