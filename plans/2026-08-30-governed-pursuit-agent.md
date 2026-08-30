# Governed Pursuit Agent implementation

## Outcome

Deliver the smallest production-shaped Governed Pursuit Agent that gives an
independent recruiter a grounded pre-call briefing from a Pursuit, survives a
worker or client interruption from durable state, and preserves the existing
evidence, Proposal, approval, effect, outcome, and iOS-local privacy owners.

The visible proof is one authenticated Pursuit workspace that can create or
discover an Agent Task, read a canonical Session projection, show a cited
non-canonical briefing or a truthful no-action result, and recover from a fresh
snapshot without treating provider memory or client state as truth.

## Boundaries

In scope:

- shared Task, Run, Artifact, public event, clarification, and decision
  correlation contracts;
- PostgreSQL lifecycle, lease/fencing, checkpoint, task-local event sequence,
  and transactional delivery outbox;
- Backend commands and canonical Session projection;
- the Web Pursuit Agent rail and complete loading, no-action, stale, failed,
  waiting, and recovery states;
- iOS server-projection DTO/store seams that do not upload or reinterpret the
  existing local Session archive;
- deterministic safety, concurrency, recovery, and contract tests plus a
  product/evidence review packet.

Out of scope unless a named authority is supplied during the work:

- external messaging, ATS, calendar, or other network effects;
- a production connector or jurisdiction-specific legal conclusion;
- Temporal, a graph database, autonomous multi-agent delegation, or candidate
  assessment;
- silent upload or semantic conversion of legacy iOS Session content.

## Current evidence and unknowns

- The worktree already contains uncommitted provider, public-web tool-host,
  evaluation, contract, and canonical-document changes. They are user-owned
  work and must be preserved.
- Current bounded Agent runs terminate as one Proposal or no-action and recover
  interrupted process state by failing it. Existing Pursuit Proposal and
  action/effect ledgers remain the domain owners.
- The exact current Web workspace composition, migration sequence, and iOS
  project inclusion rules must be inspected before editing.
- Product authority has not selected a connector or approved external effects;
  the implementation therefore keeps `external_effects` empty.

## Chosen approach

Use a PostgreSQL state machine inside the modular monolith. Introduce Task as
the durable user-intent lifecycle and extend bounded Agent Run as an immutable
attempt. Keep artifacts non-canonical, events rebuildable, and domain decisions
referential. Adapt the existing bounded runner behind the new orchestration
instead of replacing provider work already in progress.

Rejected for this slice:

- making the current one-shot run itself the cross-device Session;
- storing lifecycle truth in SSE, React, SwiftUI, Redis, or provider sessions;
- adding effect tools before a connector contract and owner exist;
- coupling the implementation to Temporal before product value is proven.

## Milestones

1. **Freeze owners and contracts.** Inspect current migrations, modules,
   frontends, and dirty diffs; define discriminated lifecycle contracts and
   non-overlapping edit seams. Proof: contract tests and this plan reflect the
   executable repository rather than the historical PRD snapshot.
2. **Durable control plane.** Add reversible migrations and an Agent Task
   application module with CAS, task-local sequence, checkpoint, lease/fencing,
   outbox, artifact/no-action projection, cancellation, clarification, and
   successor continuation semantics. Proof: database tests cover duplicate
   commands, stale revisions, stale workers, restart/readback, event ordering,
   and account isolation.
3. **Backend surface.** Add authenticated commands/queries and connect one
   bounded briefing attempt without granting new domain/effect authority.
   Proof: API tests read back the canonical projection after process-boundary
   recovery.
4. **Web experience.** Add a quiet Pursuit-scoped Agent rail led by what
   changed, what matters, and one next dependency. Proof: component tests and a
   real browser walkthrough cover long text, no action, stale evidence,
   waiting, failed, and narrow viewport states.
5. **iOS continuity seam.** Add server Task projection and pending-command
   recovery owners without touching legacy local Session retention semantics.
   Proof: Swift tests cover snapshot replacement, cursor gaps, workspace
   isolation, and local archive non-migration.
6. **Evaluation and handoff.** Run narrow checks, full affected suites,
   `pnpm docs:check`, the required TestFlight backend redeploy, and a frozen
   multi-lens review. Route stable architecture learning without duplicating
   canonical docs.

## Re-plan signals

- Existing uncommitted work already introduces an equivalent Task or event
  owner.
- A migration or module boundary would require rewriting user-owned changes.
- The current Provider output cannot produce a truthful briefing artifact
  without broadening private-data exposure.
- A named product authority chooses post-call Capture instead of pre-call
  Briefing as the first slice.

## Completion evidence

- focused contract/backend/Web/iOS tests pass;
- restart, stale revision, cursor gap, duplicate command, no-action, and account
  isolation cases have executable proof;
- no external effect capability or candidate-ranking path is introduced;
- the visible Web surface is verified from a running build;
- related documentation checks and deployment verification pass;
- remaining product or legal decisions are named as unimplemented gates, not
  presented as completed work.

## Implemented state — 2026-08-30

Completed:

- shared Task, semantic snapshot, briefing artifact, clarification correlation,
  Decision Bundle, public event, cancellation, and exact decision-resolution
  contracts;
- migration `036_governed_agent_tasks` with account-scoped Task, attempt,
  checkpoint, artifact/evidence, request, bundle/item, event, and outbox owners;
- lease/fencing claim, startup scheduling, idempotent Task creation, canonical
  projection, cancellation, non-canonical artifact readback, and source
  staleness propagation;
- an operational-only Proposal adapter that normalizes enumerated gaps/tasks
  and denies milestone, status, role, fit, advance, reject, and free-form
  evaluative writes before Proposal persistence;
- atomic Decision Bundle correlation through the existing Pursuit Proposal
  review transaction, with a domain receipt reference, a suspended waiting Run,
  no direct-review bypass, and no second decision ledger;
- authenticated Backend and Web routes, Pursuit Agent rail, exact Proposal
  review UI, and canonical receipt rendering;
- an iOS `AgentTaskProjectionStore` seam that keeps the existing local
  `AgentSessionStore` archive and drafts untouched;
- synthetic PostgreSQL runtime proof for Task recovery, event sequence,
  account isolation, deletion propagation, operational normalization,
  decision receipt correlation, and employment-boundary denial;
- desktop and 390 px browser walkthroughs with no console errors, plus an iOS
  Simulator build;
- local TestFlight Backend rebuild and tailnet readback, including migration,
  readiness, Apple authentication, voice, and Relationship Ask provider probes;
- a contract-valid recruiter, evidence-safety, and mobile product panel at
  `docs/evaluations/2026-08-30-governed-agent-task/product-panel.json`.

Intentionally incomplete:

- the runtime does not yet generate or answer `ClarificationRequest` objects;
- a resolved domain decision completes the current Task instead of creating a
  successor deliberation attempt;
- ordered events are pull/readback delivery, not production SSE or push;
- the iOS projection seam is not yet wired into the shipping Session UI;
- no `AgentDelegation`, CommitWitness, production connector, external effect,
  Temporal adapter, or legal release authority was added.

## Verification record

| Surface | Evidence |
|---|---|
| Agent | 6 files, 37 tests passed |
| Backend | 27 files, 196 tests passed |
| Governed runtime | idempotency, recovery, suspended wait, direct-review denial, source deletion, account isolation, exact domain receipt, employment-boundary denial passed |
| Web | typecheck, lint, production build, authenticated desktop and 390×844 walkthrough passed |
| iOS | generic Simulator build and 3 focused projection-store tests passed |
| Documentation | `pnpm docs:check` passed before the final review artifact; rerun at handoff |
| Deployment | `scripts/deploy/testflight-local.sh` passed and the tailnet-only API read back healthy |
| Product review | panel contract validated; verdict `pass_with_changes`, release gate `needs_evidence`, no active veto |

The implemented release boundary is an internal Phase 1A Web briefing plus one
exact operational Decision slice. It is not yet the complete cross-device,
mixed-initiative, effect-capable target described in the proposed PRD.
