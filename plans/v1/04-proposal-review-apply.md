# PRD-04: Pursuit Proposal review and canonical apply

## Problem and user outcome

The current iOS sheet can display “confirmed” after changing only view-local
state. A recruiter instead needs to inspect source, identity, before value,
proposal, reason, and effect; decide every item; then see a canonical readback
receipt or an honest conflict/unknown state.

## In-scope requirements

- `V1-REV-001` through `V1-REV-005`;
- `V1-EVI-001` and `V1-EVI-002` on the Pursuit Proposal path;
- review-path contributions to `V1-AGT-005` and `V1-SEC-001`.

## Out of scope

- sending messages, creating meetings, or writing an external CRM;
- Agent confirmation authority;
- candidate scoring, fit, personality, protected traits, or acceptance
  probability.

## Personas and entrypoints

An independent recruiter opens a staged proposal from Inbox, Today, or a
Pursuit. The same review endpoint supports recruiter-authored safe actions and
Agent-staged evidence interpretations without granting the Agent a human role.

## Screen and interaction states

Required states are loading, needs review, item edit, rejected, kept unresolved,
confirming, applied with receipt, stale conflict, failed, client
`unknownLocked`, reconciled, offline, superseded, and deleted evidence.

## Canonical owner and data model

Migration `021_pursuit_proposal_review` owns Proposal, ProposalItem, item
evidence, versioned ReviewOperation, and item-level Receipt projection. The
Pursuit aggregate remains canonical. Proposal values are proposals even when
their epistemic label is `fact`; only a human review operation may apply them.

## State transitions and invariants

- staged → needs_review → confirming → applied | rejected | kept_unresolved;
- stale review records conflict and applies no item;
- each item receives exactly one confirm, edit, reject, or keep-unresolved
  decision per review command;
- one command changes the Pursuit revision at most once;
- a duplicate command returns the same result and receipt;
- external effects are database-enforced empty;
- active, authorized, reviewed evidence with confirmed attribution is required
  for evidence-supported items;
- an Agent cannot stage a `user_authored` basis.

## HTTP, event, and tool contracts

Contract `2026-08-24.4` adds:

- `POST /v1/pursuits/{id}/proposals`;
- `GET /v1/pursuit-proposals/{id}`;
- `POST /v1/pursuit-proposals/{id}/reviews`;
- expanded `GET /v1/operations/{id}` readback.

Operation readback includes the canonical Pursuit as well as the operation and
optional receipt. A recovering client must not fabricate business fields from a
receipt or present success until all three agree.

Proposal readback includes its authorized review context: canonical Pursuit,
identity-bound Person and contextual roles, Capture purpose, and every cited
fragment's exact text, source, observed time, attribution, review state, and
parser provenance. A connected client must use this context rather than a
local preview Person or fixture quote.

The review command supplies a client-generated operation ID, proposal base
revision, idempotency key, reason, and one decision per item.

## Permission and privacy boundary

Every proposal, item, evidence link, operation, receipt, and target reference is
bound to authenticated account scope. Evidence is never copied into the
receipt. Stage cannot update Pursuit rows; review requires a simulated-human
session and records actor and time.

## Failure, retry, conflict, and delete behavior

A stale base revision returns HTTP 409 with a durable conflict operation.
After an ambiguous network result the client locks the operation ID and polls
readback; it does not submit a new command. Same-key retry replays exactly.
Deleted, purged, revoked, or re-attributed evidence blocks apply and leaves the
proposal reviewable as a failed/superseded artifact.

## Deterministic tests

Fresh-PostgreSQL evaluation covers item decisions, edited values, no-change
rejection, one revision increment, readback, duplicate replay, concurrent and
stale conflict, cross-workspace access, evidence authorization, source
deletion, operation reconciliation, and empty external effects.

## Agent SDK evaluation cases

Agent output is schema validated and can call only a later typed stage tool.
Critical cases include prompt injection in evidence, unsupported fact claims,
unknown identity, invalid target, duplicate item target, and budget exhaustion.

## Simulator and full-stack journeys

Required proof is Capture → Proposal → item review → confirming → receipt →
Pursuit readback, plus stale conflict, offline, response-loss lock and reconcile,
reject-all, keep-unresolved, and relaunch recovery.

## Metrics, rollout, and rollback

Hard gates are zero false success, stale overwrite, double apply, unsupported
confirmed claim, cross-workspace access, or external effect. Rollout is
synthetic fixtures first. Routes can be disabled without deleting proposals,
operations, receipts, or audit history.

## Open decisions and falsifiers

Initial item kinds are milestone, Pursuit status, contextual role status,
evidence-backed gap, and recruiter-owned internal action. Add a new kind only
when a flagship journey cannot be expressed safely; do not introduce a generic
JSON patch authority.

## iOS evidence-to-decision completion evidence

The review surface now follows one mobile reading order: exact evidence,
compact source and time, optional audit provenance, current and proposed values,
reason and effect, evidence authority, explicit item decision, then canonical
apply. No item is preselected. At accessibility AX5 the four decisions stack as
full-width rows instead of a two-column grid, and the affected interface copy
is catalog-backed in English and Simplified Chinese. Exact evidence and
canonical authored content remain untranslated.

Focused executable proof passed on an iPhone 17 Pro Simulator against the
local canonical Proposal fixture: preview cannot apply or claim success;
connected review applies only after an explicit item decision and backend
readback; and Simplified Chinese dark AX5 keeps evidence inspectable and every
decision reachable. The result bundle is
`/tmp/talent-signal-ios-proposal-final.xcresult`; the corresponding visual
adjudication is recorded in `design-qa.md`.
