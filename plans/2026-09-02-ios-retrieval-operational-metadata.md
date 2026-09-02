# iOS retrieval operational metadata

Status: complete
Owner: Codex
Started: 2026-09-02

## Outcome

Make People and Sessions informative enough for a boutique recruiter to scan
without reopening every object, while preserving the independent-card rhythm
and avoiding explanatory summaries. People should show stable professional and
assignment context. Sessions should show resumable intent, recency, unread
state, involved Person, and any current recruiter-decision dependency.

Completion is observable when the rendered list shows representative metadata
without clipping or decorative tag density, People search covers the metadata
that is visible, Session attention is derived from the latest governed state
rather than invented urgency, original ordering and row gestures remain
unchanged, and focused default, unread, small-device, dark, and accessibility
checks pass.

## Boundary

In scope:

- one recruiter-authored professional headline when available;
- one canonical role and Pursuit assignment plus last-activity recency;
- name, headline, role, assignment, and relationship-context search terms;
- Session unread state, latest decision dependency, relationship context,
  involved Person, and relative update time;
- compact trailing initials as the Session participant treatment;
- accessible labels and focused policy/UI regression checks.

Out of scope:

- parsing job title or company from unstructured text;
- inventing missing professional metadata;
- candidate quality, fit, responsiveness, relationship-health, or acceptance
  scores;
- restoring profile summaries, source counts, confirmation counts, or response
  excerpts to retrieval cards;
- changing Session persistence, proposal authority, Person/Pursuit state,
  gestures, deletion, or external effects.

## Chosen information order

People cards use `identity → recruiter-authored headline → canonical
role/Pursuit → activity`. A missing headline collapses cleanly; the Pursuit
title is never relabeled as a person's job title.

Session cards use `resumable title → recency/unread → relationship context →
current attention state → involved Person`. `Needs judgment` appears only when
the latest current Agent block explicitly requires a user decision or the
Session owns an identity review. A stale response says `Refresh needed`
instead. The state ranks work attention, never the Person.

This borrows the resumable-thread grammar of Claude Code and Codex—stable
session title, continuity, and visible intervention state—without borrowing
code-task vocabulary or treating Agent output as canonical relationship truth.

## Knowledge routing

The stable product/design documents already say metadata must remain legible,
People is searched across role/company/assignment, and Sessions retrieves
recent intent. This correction therefore belongs in this active plan plus code
and deterministic tests; adding another canonical paragraph would duplicate
existing guidance. The repeated failure class is captured by the tests: visual
restraint must not erase stable professional context or current work state.

## Milestones

1. **Complete — deterministic metadata.** People retrieval metadata/search and
   Session attention derivation cover present, missing, stale, identity-review,
   pending-objective, and explicit-decision states without changing canonical
   state.
2. **Complete — card composition.** People cards render professional headline,
   role/Pursuit, and activity; Session cards render participant/context,
   recency/unread, current attention, and a trailing initials avatar. Both keep
   independent low-contrast card materiality and collapse absent metadata.
3. **Complete — interaction proof.** Focused tests cover metadata search and
   scope order, unread transitions, attention labels, Session left/right swipe,
   Person swipe/long-press, and exact Session deletion while People persist.
4. **Complete — rendered review.** The final cards were inspected on iPhone 16
   Pro and iPhone SE (3rd generation), plus dark Simplified Chinese at AX5 with
   reduced motion. Long People metadata wraps without ellipsis; Session title,
   state, participant, and avatar remain distinct.

## Completion evidence

- Debug build-for-testing succeeded and nine distinct focused unit/UI tests
  passed, including the large/small device matrix and dark Chinese AX5 path.
- Final rendered artifacts cover People, Sessions, unread state, swipe actions,
  iPhone SE, and iPhone 16 Pro.
- `pnpm docs:check`, localization-catalog JSON validation, and scoped
  `git diff --check` passed.
- `pnpm ios:check` remains blocked by unrelated shared-worktree localization
  debt: 197 inline bilingual calls versus the allowed baseline of 176. This
  slice adds its new copy to `Localizable.xcstrings` and does not introduce a
  new inline bilingual call.

## Replanning signals

- Re-plan if metadata needs a new canonical Person field rather than an
  existing recruiter-authored headline or Pursuit role.
- Remove a line before shrinking metadata below a legible size or clipping
  names, state, or assignment at accessibility sizes.
- Do not show `Needs judgment` if current state cannot distinguish an open
  decision from a historical or stale response.
