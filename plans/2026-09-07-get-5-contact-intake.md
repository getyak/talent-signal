# GET-5 grounded contact intake

## Outcome and scope

Make one recruiter-authored message produce at most one reversible contact
draft. A readable name and stable identity clue are required. Missing real
relationship context remains empty for review; a draft never invents a generic
relationship. This slice owns the iOS intake domain, adaptive interpreter, and
their tests. Session/message metadata, UI, formal-save guards, and backend
integration are owned by the coordinating GET-5 workers.

## Implemented decisions

- Questions, third-party quotations/reporting, and unrelated calendar commands
  are excluded before either deterministic or model interpretation.
- Name-only mentions route normally; explicit name-only contact requests ask
  for clarification. Multiple active names or conflicting stable clues also
  require clarification rather than combining fields.
- Missing or unsupported relationship context is empty. Unrelated suffixes
  such as `thanks for reading` do not become relationship purpose.
- Each accepted extracted field retains its exact original-source excerpt in
  optional `fieldEvidence` metadata. The source note retains original text
  after outer whitespace trimming. Name width and email normalization preserve
  those excerpts; older drafts decode without metadata.
- Model identity values must match both the exact source and the claimed
  supported identity syntax. Calendar dates cannot supply phone identity.
- Cancellation before intake, during model execution, or immediately before a
  model result returns produces no contact or clarification.

## Verification

- `swiftc -frontend -parse` passed for the three owned Swift files.
- An isolated Swift package copied the two production intake source files and
  the production `WorkspacePerson` definition, then ran the complete production
  `ConversationContactIntakeTests.swift`: **41 tests passed, 0 failures**.
  This verifies the actual parser/interpreter and coding behavior on macOS;
  it is not iOS UI or Xcode integration evidence.
- A separate deterministic Swift harness passed 26 bilingual intake scenarios.
- `git diff --check` passed for the owned Swift files.
- `pnpm docs:check` passed, including wiki and architecture diagram checks.
- Parent-owned iOS integration/UI checks remain part of the enclosing GET-5
  completion evidence.

## Integration contract and limits

`ConversationContactDraft.fieldEvidence` is optional for backward compatibility;
its items carry `field` (`name`, `identityClue`, or `relationshipContext`) and
`exactExcerpt`. Session and source-message identity belong to proposal metadata,
not duplicated field objects. Formal save must reject an empty relationship
context and preserve user-authored corrections distinctly from extraction.

The deterministic parser intentionally leaves uncommon narrative introductions
to bounded model interpretation or a single clarification. It does not establish
that a syntactically valid contact clue belongs to a canonical person; existing
identity lookup, review, and effect authorization retain that responsibility.
