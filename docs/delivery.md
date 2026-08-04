# 48-hour delivery plan

## Day 1

- Build iOS navigation and seeded candidate model.
- Implement screenshot import and optional context input.
- Implement deterministic extraction fixtures and action-card parsing.
- Build review, edit, confirm, and dismiss flows.

## Day 2

- Build candidate timeline and momentum-insight screen.
- Add a high-risk candidate and a no-action scenario.
- Add tests for card transitions and insight eligibility.
- Record a short demo and document local/cloud run instructions.

## Definition of done

The complete loop runs with fixtures without external dependencies. A live provider can be enabled without changing the UI contract.

## Next vertical slice: shared multi-surface backend

The 48-hour prototype proves the interaction contract but not cross-device
state. The next production slice implements the topology in
[`ADR 0003`](decisions/0003-shared-backend-topology.md):

1. create project-specific authentication and workspace authorization;
2. add PostgreSQL migrations for evidence episodes, evidence spans, assertions,
   fact versions, action proposals, executions, outcomes, and audit events;
3. add object storage with intentional upload, scoped access, retention, and
   derivative deletion;
4. expose one versioned API contract used by iOS, web, and later the
   browser/plugin importer;
5. add idempotent import, asynchronous processing status, optimistic review
   versions, and duplicate prevention;
6. complete one vertical path: capture on iOS, inspect and confirm on web, then
   read the same confirmed candidate state from both surfaces.

### Definition of done

- The backend, not a client database or rendered wiki page, is authoritative
  after an episode is submitted.
- An ambiguous assertion cannot enter active candidate truth without review.
- A stale client receives a conflict instead of overwriting a newer decision.
- Raw assets and their registered derivatives follow the selected retention and
  deletion contract.
- No external contact, calendar, ATS, notification, or message mutation is
  included in this slice unless its proposal, approval, idempotency, verified
  result, and audit path are implemented end to end.
