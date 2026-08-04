# Talent Signal agent guide

## Mission

Build an evidence-first candidate-momentum layer for independent recruiters.
Optimize for timely, trustworthy judgment rather than feature volume.

## Non-negotiables

1. Treat screenshots and candidate data as sensitive.
2. Extract explicit facts only. Label inference and ambiguity.
3. Keep exact source evidence and append-only change history.
4. Require review before contact, calendar, ATS, or message mutations.
5. Recommend one smallest useful next action with a reason and timeframe.
6. Rank work attention, never a person's worth, personality, or protected
   characteristics.
7. Keep the one-screenshot, one-candidate loop usable.

## Product and design

- The candidate page is canonical. Card, List, Timeline, and Graph are views.
- Every important fact, relationship, and state change must be traceable.
- Use quiet neutrals, one vermilion accent, scarce elevation, and restrained
  motion. Avoid generic AI aesthetics and dashboard clutter.
- Show complete proposed, edited, confirmed, dismissed, failed, expired, and
  superseded states.

## Language

Keep committed source code, identifiers, comments, tests, UI copy, repository
documentation, commits, issues, and pull requests in English. Conversation may
follow the user's language.

## Read before changing

- Product decisions: `docs/product.md`
- UI or interaction: `docs/design-system.md` and `design.md`
- Data contracts: `docs/architecture.md`
- Candidate extraction: `.agents/skills/candidate-signal-analysis/SKILL.md`
- Product design: `.agents/skills/design-talent-signal/SKILL.md`

## Verify

Test unknown, matched, ambiguous, empty, edit, dismiss, failure, expiry, and
deletion paths. Confirm dismissed or failed actions never mutate records.
