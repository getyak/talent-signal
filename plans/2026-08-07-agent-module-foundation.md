# Agent module foundation

Status: proposed; architecture complete, implementation not started
Owner: unassigned
Started: 2026-08-07

## Outcome

Talent Signal has one durable Agent execution shell for bounded open-ended
relationship work without weakening the existing evidence, identity, fact,
approval, effect, authorization, freshness, or deletion boundaries.

The design and current-code gap analysis are recorded in
[Talent Signal Agent module blueprint](../docs/research/talent-signal-agent-module-blueprint.md).
The editable architecture source is
[`talent-signal-agent-module-blueprint.excalidraw`](../docs/talent-signal-agent-module-blueprint.excalidraw).

## In scope

- versioned Agent Definition contracts;
- immutable Task and attempted Run lifecycle;
- typed append-only Run events and a deterministic reducer;
- Context Manifest reuse;
- checkpoints, artifacts, budgets, leases, cancellation, and stop;
- typed capability policy;
- proposal references into existing domain services;
- one read-only contradiction-investigation vertical slice;
- trajectory, grounding, recovery, privacy, and human-burden evaluations.

## Out of scope

- a general autonomous recruiter;
- candidate scoring, personality, protected-trait, culture-fit, or acceptance
  inference;
- automatic outreach or stage movement;
- generic production shell, browser, filesystem, or database access;
- multi-agent role debate;
- external Agent or channel protocols before the internal contract is stable;
- replacing PostgreSQL, the modular backend, or the existing effect service;
- automatic procedural learning.

## Current evidence

The repository already proves:

- model output can enter as a strict draft or proposal;
- facts require an independent recruiter decision;
- Wiki snapshots and Context Manifests are immutable and source linked;
- bounded public research can lease, retry, recover, and preserve partial
  results;
- exact effects require current approval and destination verification;
- unknown effects reconcile instead of retrying optimistically;
- authorization, freshness, correction, and deletion retract derived context.

The missing concepts are Definition, shared Task and Run, typed Run events,
checkpoint, artifact, capability registry, budget, cancellation, and
trajectory evaluation.

## Chosen approach

Use two runtime classes behind one proposal boundary:

1. keep known relationship transitions in the governed workflow;
2. add an event-driven runner only for unknown-step investigation;
3. let both produce artifacts and proposals;
4. keep identity, fact, action, effect, and learning authority in existing
   domain services.

Begin inside the TypeScript/Fastify/PostgreSQL modular backend. Do not add a
specialized Agent or workflow framework until measured operational pain
justifies it.

## Milestones

### 1. Contract spine

Status: pending

- add schemas for Definition, Task, Run, Event, Checkpoint, Artifact,
  Capability Decision, and Proposal Reference;
- define model-visible, surface-visible, and audit-only event classes;
- define terminal reasons and legal state transitions;
- add contract and reducer tests.

Evidence:

- invalid transitions fail deterministically;
- a Run can be reconstructed from events;
- domain state is never reconstructed from Agent events.

### 2. Durable storage and worker

Status: pending

- add PostgreSQL tables, constraints, indexes, idempotency, and leases;
- append event and update Run projection in one transaction;
- add cancellation, deadline, step, tool, token, cost, and wall-time budgets;
- add crash-before and crash-after recovery evaluations.

Evidence:

- one worker owns a Run;
- expired leases recover;
- retries do not duplicate artifacts or proposals;
- cancellation and budget stop survive process restart.

### 3. Context and capability boundary

Status: pending

- compile from one pinned gold Wiki and exact authorized evidence;
- recheck source authorization and identity freshness at capability use time;
- register only scoped reads, artifact writes, clarification, proposal, and
  abstention for the first definition;
- keep external effect execution outside the runner.

Evidence:

- cross-context and stale-source retrieval fail closed;
- prompt-like source content cannot change policy or capabilities;
- every context item has an inclusion reason and governed reference.

### 4. Shadow deterministic run

Status: pending

- represent one current relationship-brief compilation as a Task and Run;
- preserve existing Chat response, Wiki, Context Manifest, and audit behavior;
- compare new Run receipts with current behavior without changing authority.

Evidence:

- shadow Run and current deterministic output agree on scope and dependencies;
- reload exposes one durable receipt;
- no model or new effect permission is introduced.

### 5. Contradiction investigator

Status: pending

- implement one open-ended, read-only Agent Definition;
- create a structured contradiction packet and one clarification proposal or
  `no_action`;
- add abstention, deletion, authorization-race, prompt-injection, and budget
  evaluations.

Evidence:

- every material statement resolves to exact authorized evidence;
- the runner never resolves the conflict or confirms a fact;
- partial progress resumes from a checkpoint;
- insufficient evidence produces visible abstention.

### 6. Proposal and effect integration

Status: pending

- link an Agent-created action proposal to existing action services;
- preserve independent fact confirmation and action approval;
- reuse exact preview, capability grant, execution attempt, observation, and
  reconciliation.

Evidence:

- proposal creation grants no execution authority;
- stale approval requires a fresh preview;
- unknown results never retry without reconciliation.

### 7. External boundary and parallelism

Status: pending and evidence-gated

- define short-lived scoped access for read, capture, artifact, and proposal;
- add one external adapter only after the internal protocol stabilizes;
- add parallel read workers only after artifact fan-in is deterministic.

Evidence:

- external clients cannot confirm facts, bind identity, merge people, or
  execute effects;
- the parent Run remains the single synthesis and proposal writer;
- parallelism improves a fixed evaluation without unacceptable cost or risk.

## Completion evidence

The foundation is complete only when:

- the first open-ended Run survives interruption and reload;
- every event, context item, artifact, and proposal has identity, scope,
  provenance, authorization, and retention;
- a source revocation or expiry halts future use before a periodic worker runs;
- deletion retracts dependent artifacts without retaining private text in
  audit events;
- fact confirmation, action approval, and effect verification remain
  independent;
- the contradiction artifact is useful on a fixed review set;
- recovery, privacy, prohibited-inference, cost, and human-burden checks pass;
- the Agent can abstain, wait, cancel, and fail without inventing success.

## Decisions that could change the plan

- evidence that a second open-ended task needs the same runtime seam;
- a requirement for multi-hour external waits or complex compensation;
- provider data-residency constraints that change ephemeral processing;
- a user decision to expose external Agent access earlier;
- measured user demand for an external consequence class.

Without one of those signals, implementation should remain a small kernel
inside the existing backend.
