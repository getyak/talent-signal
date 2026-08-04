# Shared authority backend implementation plan

## Outcome

Provide one localhost, account-scoped authority path for intentional evidence,
reviewed temporal state, independently approved simulated effects, observed
outcomes, and cross-client synchronization.

Completion evidence is:

- PostgreSQL, migration, seed, and API services become healthy through
  `compose.yaml`;
- the versioned HTTP contract is exported from `packages/contracts`;
- all eight synthetic fixture cases preserve their expected disposition and
  safety boundaries;
- `TS-CORE-01` completes through login, evidence, proposal, decisions,
  approval, simulated execution, destination readback, and a verified outcome;
- duplicate, retry, timeout, revocation, deletion, stale approval,
  synchronization, and cross-account isolation checks pass;
- sanitized direct evidence and the final commit are recorded in the run
  manifest.

## Scope

Owned implementation surfaces:

- `apps/backend/**`
- `packages/contracts/**`
- `compose.yaml`
- `.env.example`
- root `package.json` and `pnpm-lock.yaml`
- `docs/evaluations/overnight/backend/**`

No Web, iOS, browser-extension, plugin, fixture, canonical-document, or other
evaluation artifact is edited.

## Current evidence and unknowns

- Baseline commit is `f66581cbf8a1b1154156fc25231a6ff82f11c61f`.
- ADR 0003 requires one account-scoped transactional authority and client
  synchronization through that backend.
- Docker is available locally. The check will use an isolated Compose project
  and synthetic accounts only.
- No backend or shared TypeScript contract package exists at the baseline.
- This slice can prove local control-plane semantics, not production
  authentication, backup, encryption, OCR quality, privacy compliance, or a
  live connector.

## Chosen approach

Use a modular Fastify application and PostgreSQL transaction boundary. Shared
TypeBox schemas provide runtime validation and TypeScript types. Composite
account-scoped foreign keys prevent cross-account relationships in the data
model. A deterministic local adapter is the only executable capability.

The persisted lifecycle keeps these records distinct:

1. capture and source evidence;
2. model or fixture-produced assertion proposals;
3. user fact decisions;
4. confirmed temporal state;
5. action proposals;
6. exact, version-bound approvals;
7. effect attempts;
8. destination observations and outcomes;
9. append-only audit events and deletion lineage.

The adapter reports a verified outcome only after reading the simulated
destination and matching the approved change. Timeout-after-write remains
unknown until reconciliation. Proposal revision or authorization revocation
invalidates prior execution authority.

## Rejected alternatives

- Client-local persistence cannot prove shared authority or cross-client
  consistency.
- A model-driven workflow engine would blur proposal and authorization in the
  first slice.
- A generic connector or arbitrary tool interface would exceed the bounded
  localhost authorization.
- Microservices or a specialized workflow engine add operational shape without
  improving the required proof.

## Milestones

1. Contract and schema: migrations, account scoping, contract package, health
   and readiness.
2. Governed flow: simulated login, capture, proposal, decisions, action,
   approval, execution, observation, outcome, audit, and sync.
3. Recovery and lifecycle: idempotency, conflict/supersession, stale and
   revoked authorization, timeout reconciliation, deletion propagation.
4. Evaluation: all fixtures and adversarial cases, direct `TS-CORE-01`
   transcript, Docker evidence, safety review, and local commit.

## Correction loops

Run at most three loops. Each loop records the failing observable behavior,
the narrow correction, and the rerun evidence in `run-manifest.json`. Stop and
re-plan if evidence contradicts the authority model rather than layering
patches.
