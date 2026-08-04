# Product brief

## User and job

**Primary user:** an independent recruiter or boutique-search recruiter handling high-value, relationship-led searches.

**Job to be done:** after a meaningful candidate conversation, help me retain what changes the candidate’s likelihood of moving, turn it into the right operational update, and tell me the next best step before momentum is lost.

## Problem

Candidate intent lives in fragmented, unstructured conversations. Existing ATS products record process but seldom translate a deadline, constraint, or commitment into a timely recommendation. A generic summary does not change an outcome.

## Value proposition

Never lose a strong candidate in the gaps between conversations.

## MVP scope

- Input: one screenshot, optional context, and seeded local candidate data.
- Actions: create contact, update contact, create meeting — all reviewable.
- Output: a confirmed-fact timeline, one evidence-backed insight, and one recommended next action.

## Identity and role principle

The product records people, not permanent candidate identities. A person may be
a founder of one company, a product manager at another, a candidate in one
search, a client stakeholder in another assignment, and a referrer elsewhere.
These contexts must resolve to one person without flattening them into one
universal profile.

Model the distinction explicitly:

- `Person` is the stable identity shared across authorized contexts.
- `OrganizationRole` describes a time-bounded role such as founder or product
  manager at a company.
- `AssignmentParticipation` describes a person's role in a specific search or
  assignment, such as candidate, client stakeholder, recruiter, or referrer.
- `Relationship` connects people, companies, roles, and assignments with a
  type, valid time, evidence, and history.
- `Tag` is a user-controlled discovery and grouping aid. A tag does not create,
  verify, replace, or merge an identity or role.

Role claims follow the same evidence contract as other decision-relevant facts:
they may be proposed, confirmed, edited, ambiguous, expired, or superseded and
must preserve source provenance. Assignment-sensitive facts, including the fact
that someone is considering a role, remain permission-scoped and must not leak
into founder, client, or general relationship views.

The MVP remains candidate-momentum-first. Its candidate brief is the default
assignment-scoped projection of a person, not a separate person record. Future
founder, client, product-specialist, or referrer views may change the contextual
fields and actions while preserving the same identity, evidence, and
relationship history. This flexibility must not turn the MVP into an
infinitely configurable CRM.

## MVP processing contract

The runtime order is:

`evidence episode → structured evidence state → reviewable action cards → user
decision → verified external result → semantic memory and wiki projection →
insight and next step`

The product may read previously confirmed candidate memory before proposing an
action, but a new screenshot does not enter active memory before review. Fact
confirmation and action approval are separate decisions even when the interface
presents them together. An action card is a pending tool proposal, not a fact,
and dismissing an action does not invalidate its supporting evidence.
See the
[agent execution and memory boundary](architecture.md#agent-execution-and-memory-boundary)
for the runtime contract and failure cases.

## Strategic boundary

Start as a mobile, recruiter-controlled capture loop for the interview
assignment. Evolve toward a desktop workbench with a shared person identity and
multiple task-specific relationship lenses; never compete as a full ATS or
generic CRM.
