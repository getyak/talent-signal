# Agent working agreement

## Mission

Build Talent Signal as an evidence-first candidate-momentum product. Optimize for useful recruiter judgment, not feature volume.

## Rules

1. Treat screenshots and candidate data as sensitive.
2. Never invent a candidate attribute, deadline, preference, or relationship.
3. Preserve original evidence for every extracted item.
4. Require confirmation before a contact or calendar mutation.
5. Separate facts from inferences and explain every risk assessment with evidence.
6. Keep the core loop usable with one screenshot and one existing contact.

## Language standard

- Write all source code, identifiers, comments, tests, user-interface copy, and repository documentation in English.
- Write commit messages, pull-request content, issue content, and release notes in English.
- User-facing conversation may follow the user's preferred language, but artifacts committed to this repository remain English.

## Quality bar

An insight is acceptable only if it answers: who needs attention, why now, and what single action reduces uncertainty or risk.

## Validation

- Test unknown, matched, and ambiguous candidates.
- Test screenshots with no actionable content.
- Test edit and dismiss behavior for every action-card type.
- Verify dismissed cards do not mutate records.
- Verify imported source data and derivatives can be deleted.

Read `docs/product.md` before product decisions, `design.md` before UI work, and `docs/architecture.md` before data-contract changes.
