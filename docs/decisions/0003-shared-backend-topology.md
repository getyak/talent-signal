# ADR 0003: Shared backend for multi-surface state

## Status

Accepted for the first production vertical slice.

## Context

Capture, review, relationship continuity, and future Agent access span mobile,
web, browser, and channel surfaces.

If each surface interprets and stores candidate state independently, the
product cannot preserve identity, provenance, approval, deletion, or a
consistent outcome history.

The repository currently contains prototype-local behavior. A shared authority
becomes necessary when one real source or review must appear on more than one
surface.

## Decision

Use one account-scoped shared backend as the authority for submitted evidence,
reviewed relationship state, action decisions, observed outcomes, and audit
history.

Clients may own local drafts, device permissions, upload queues, and caches.
After submission, they synchronize through the backend rather than directly
with one another.

Begin as a managed modular system:

- one transactional source of truth;
- separate storage for intentionally uploaded private assets;
- a durable boundary for work that waits, retries, or resumes;
- one authorization and effect boundary across clients;
- rebuildable read and knowledge projections.

Do not begin with microservices, a graph database, a dedicated vector database,
Kubernetes, or self-hosted infrastructure.

## Consequences

### Benefits

- capture can begin on one surface and review can finish on another;
- identity, evidence, approval, deletion, and external effects follow one
  contract;
- generated views remain replaceable;
- model and connector providers can change without changing truth;
- the system can start small while preserving future separation.

### Costs

- authentication, migrations, backup, recovery, retention, and operations
  become product responsibilities;
- offline clients need explicit conflict and retry behavior;
- private assets and derived representations need lifecycle testing;
- shared contracts must remain coherent across surfaces.

## Boundaries

- Shared person identity does not imply shared evidence visibility.
- New model output remains proposed until reviewed.
- Fact confirmation and action approval remain separate.
- External success requires destination evidence.
- Deleting a source propagates to governed derivatives.
- Clients never receive unrestricted datastore or connector authority.

## Reconsider when

Revisit the managed modular shape when a customer contract, data location,
reliability target, sustained scale, or measured query pattern cannot be met
without a different operational boundary.

Self-hosting changes operational ownership; it does not relax authorization,
provenance, retention, deletion, encryption, or audit requirements.

## Canonical source

Current architecture truth lives in [Architecture](../architecture.md). This ADR
preserves the rationale for choosing it.
