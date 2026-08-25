# PRD-07: Evidence and identity integrity

## Problem and user outcome

A recruiter must be able to trust that a current Proposal, Gap, contextual role,
and Today projection still has the evidence and identity authority it claims.
Same-name ambiguity must remain review work, and deleting a source must remove
its authority from every downstream Pursuit projection without silently erasing
the durable audit fact that deletion occurred.

## In-scope requirements

- `V1-EVI-001`, `V1-EVI-002`, `V1-EVI-003`, and `V1-EVI-004`;
- evidence availability on Pursuit role, Gap, Proposal, and Today projections;
- same-name and historical-identity review on the Pursuit path;
- source deletion supersession, projection invalidation, lineage readback,
  relaunch recovery, and account isolation;
- workspace-scoped local outbox and capture recovery boundaries.

## Canonical and epistemic rules

Confirmed canonical changes require reviewed evidence or explicit user-authored
attribution. Fact, inference, unknown, disputed, and superseded remain distinct.
Deleted, expired, attribution-unknown, or identity-unbound sources cannot support
a new confirmation. A derived object may remain visible for audit and recovery,
but its projection must label evidence as partial or unavailable and must not
present it as evidence-backed attention.

## Deletion propagation

Source deletion marks open source-bound Proposals superseded, makes affected
Pursuit evidence availability explicit, removes deleted evidence from authority
counts, recompiles Today, and keeps a structured deletion lineage receipt. A Gap
or role is not silently reassigned or rewritten as user-authored. Any further
canonical change requires a new reviewed source or an explicit human operation.

## Deterministic and runtime proof

Tests cover active, partial, unavailable, no-evidence-required, same-name,
historical-owner, source-deleted, stale Proposal, cross-account, retry, response
loss, and relaunch cases. Full-stack proof freezes pre-delete and post-delete
Pursuit, Proposal, Today, and lineage readbacks from one synthetic source.

## Checkpoint — complete

Contract `2026-08-24.6` and migration `022_pursuit_evidence_integrity` now make
evidence authority and authored display order explicit. A fresh PostgreSQL run
proves reviewed-source requirements, two distinct same-name People, ambiguous
identity review, available/partial/unavailable/not-required transitions,
source-deletion supersession, non-reviewability, idempotent deletion, Proposal
and item lineage, Today copy degradation, and cross-workspace hiding.

The iOS workspace renders the same authority state and refuses Proposal submit
when evidence is no longer available even if old text remains. Typed-signal
outbox files are workspace-partitioned and remain undisclosed until
authenticated workspace and canonical Pursuit readback agree. Focused iPhone
17 Pro Simulator tests cover the Proposal/Today projections and local recovery
boundary. Runtime evidence is frozen in
`docs/evaluations/2026-08-24-v1-prd-07/`.

Physical-device account switching and real candidate privacy operations remain
explicitly unproven and are not release claims.

## Falsifiers

The slice fails on silent identity merge, deleted evidence counted as reviewed,
an open Proposal remaining confirmable after source deletion, cross-account
lineage access, a Today label that says evidence-backed when authority is gone,
or local recovery that reveals a different workspace's payload.
