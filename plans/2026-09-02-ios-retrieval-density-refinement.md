# iOS retrieval density refinement

Status: complete
Owner: Codex
Started: 2026-09-02

## Outcome

Make Sessions and People a calm, compact retrieval surface whose objects remain
visually distinct. A recruiter should be able to search People, narrow it by a
real Pursuit scope, and scan independent person cards without seeing profile
prose, relationship explanations, audit references, or repeated source metrics.

Completion is observable when the rendered iOS surface uses restrained compact
cards with deliberate inter-card rhythm, People shows identity only, Sessions
shows at most one compact supporting line, search and Pursuit filtering preserve
the original people order, all card and top-level controls remain at least 44
points, swipe and long-press actions remain unchanged, and focused unit/UI
checks pass in English and Simplified Chinese at default and accessibility text
sizes.

## Boundary

In scope:

- Sessions and People card hierarchy, density, materiality, and visible copy;
- local People search, Pursuit-scope filtering, and an explicit no-match state;
- top retrieval chrome and bottom global composer spacing;
- accessibility labels that preserve enough nonvisual context without putting
  audit detail back into the visual index;
- focused regression assertions and rendered Simulator evidence.

Out of scope:

- canonical Person, Pursuit, evidence, Session, Receipt, or retention behavior;
- changing swipe, long-press, navigation, deletion, or external-effect
  authority;
- redesigning Today, the Agent conversation, or the living person page;
- adding relationship scores, favorites, activity rankings, or decorative
  candidate states.

## Current evidence

- The supplied iPhone screenshots show every row as an isolated rounded card
  with 12-point inter-card gaps, 46–48-point initials, up to four text lines,
  and a large capsule composer.
- People repeats owner-authored headline, Pursuit role, source count, and
  confirmed-identity count even though the surface answers only “Who am I
  looking for?”
- Sessions repeats relationship context and exposes response or Receipt detail
  in addition to title, time, and unread state.
- Current source already preserves native List gestures, 44-point targets,
  scroll restoration, interruption recovery, and exact local deletion copy;
  those behaviors must not regress.

## Correction and chosen direction

The first implementation used an **editorial index**: flat hairline rows with
smaller initials and restrained copy. It solved information overload, but the
user rejected the continuous-list materiality twice: individual contacts need
to read as independent objects, with intentional space between them, and the
People surface needs first-class search and filtering.

The corrected direction is **quiet retrieval cards**: every selectable Person
and Session gets one low-contrast, bordered surface with no shadow, a modest
radius, and a six-point vertical gap. People remains identity-only; the card is
not permission to restore descriptions or counts. Sessions keeps title, time,
and one state/identity line. Search and filter sit above People as a compact
retrieval rail. Search is local and scope-preserving; filtering uses canonical
Pursuit membership only, never inferred quality, activity, fit, or value. Both
operations preserve source order instead of ranking results.

This correction stays in the active plan because it is a surface-specific
direction still under validation. The canonical design system already permits
materiality for selectable objects and rejects decorative card tiling, so a new
global rule would duplicate or overfit existing guidance. Deterministic search
and scope behavior belongs in code and tests.

## Milestones

1. **Complete — information restraint.** Removed explanatory profile, role,
   source, confirmation, response, and Receipt detail from retrieval rows.
2. **Complete — corrected materiality and retrieval.** Replaced flat rows with
   compact independent cards and added local search plus canonical
   Pursuit-scope filtering without changing native gesture ownership.
3. **Complete — interaction proof.** Verified search, clear, Pursuit filtering,
   no-match recovery, swipe, long press, and exact-confirmation deletion.
   Existing scroll-restoration ownership remains on the native Lists and was
   not changed by the retrieval rail or card backgrounds.
4. **Complete — rendered review.** Reviewed default, iPhone SE, dark,
   Simplified-Chinese, reduced-motion, and AX5 evidence; completed the focused
   build, test, documentation, catalog, and diff checks.

## Verification note

The completed card slice passed a fresh Debug `build-for-testing` and eight
focused tests: the retrieval policy unit check; default People/Sessions,
search/filter recovery, and Simplified-Chinese dark AX5 UI checks on iPhone 17
Pro; the default retrieval check on iPhone SE; and three preserved gesture and
deletion journeys. Rendered evidence confirms that the filter's active state is
an icon plus status dot rather than a truncating scope label, and that People
cards contain identity only with a six-point visual gap.

`pnpm docs:check`, the string-catalog parse, and scoped `git diff --check` pass.
The aggregate `pnpm ios:check` entry point still stops before Xcode because the
shared dirty worktree contains 199 inline bilingual calls against an existing
limit of 176. This slice adds all new retrieval copy through
`Localizable.xcstrings` and does not increase that debt.

## Replanning signals

- Stop if density requires targets below 44 points or clips identity/state at
  accessibility sizes.
- Re-plan if independent card spacing breaks native swipe-action ownership or
  scroll-position restoration.
- Keep a state label when removing it would make stale, unread, or unresolved
  work look current; density cannot erase authority.
