# PRD-00: Foundation and account scope

## Problem and user outcome

Sensitive relationship evidence must have one unambiguous owner across API,
database, cache, queue, sync, and future Agent runs. A signed-in user should see
and mutate only the workspace selected by that session, with no second tenant
key to reconcile.

## In-scope requirements

- `V1-SEC-001`: account/workspace scope on every read and write;
- foundation for `V1-TST-003`: Release must exclude test authority;
- identity, provenance, idempotency, audit, and receipt primitives required by
  the remaining V1 requirements.

## Out of scope

- multiple workspaces inside one account;
- cross-workspace Pursuit sharing or moving;
- production identity-provider setup, billing, or organization administration;
- any external message, calendar, contact, ATS, or CRM effect.

## Personas and entrypoints

The primary persona is an independent recruiter or boutique-search owner. A
minimal reviewer role may share the same workspace later. Entry begins with an
authenticated iOS/API session; extensions must carry the same scoped envelope.

## Screen and interaction states

There is no standalone foundation screen. Product surfaces must represent
signed out, restoring session, ready, wrong/expired session, offline cache,
scope changed, and destructive sign-out. Scope change destroys repositories,
cache, drafts, outbox, subscriptions, and sync cursor as one bundle.

## Canonical owner and data model

PostgreSQL is canonical. `account_id` is the stored authorization boundary and
is exposed as `workspace_id` in Pursuit contracts. The decision and alternatives
are recorded in
[`ADR 0007`](../../docs/decisions/0007-account-is-v1-workspace-boundary.md).

## State transitions and invariants

- one session selects exactly one active account/workspace;
- every dependent row uses account-scoped lookup and composite foreign keys;
- an idempotency key is scoped by account, actor, and operation;
- audit and receipt rows never grant execution authority;
- changing or revoking scope invalidates every client-owned scoped resource.

## HTTP, event, and tool contracts

Bearer authentication resolves `AuthContext.accountId`; handlers never accept a
caller-supplied workspace override. Events carry account scope and monotonic
audit sequence. Future Agent tools receive an immutable scope from the backend,
not from imported content.

## Permission and privacy boundary

All content is sensitive, purpose-bound evidence. Cross-workspace references
return not found or a bounded validation error without disclosing existence.
Real candidate content is forbidden in deterministic evaluation fixtures.

## Failure, retry, conflict, and delete behavior

Duplicate requests replay one stored response. Conflicting payload reuse is
rejected. Authentication or scope failure cannot fall back to a global cache.
Deletion and sign-out must revoke access before asynchronous cleanup and retain
only the minimum audit lineage.

## Deterministic tests

- cross-workspace entity and operation lookup returns not found;
- cross-workspace action owner is rejected;
- duplicate create and revision replay one entity and receipt;
- schema tests verify composite account relationships;
- a release audit must prove no test token, mock endpoint, or automation bridge.

## Agent SDK evaluation cases

Before Agent runtime release: imported instructions cannot alter workspace,
tool allowlist, or budget; a snapshot from another workspace is rejected; run
and checkpoint reconstruction preserve the immutable scope.

## Simulator and full-stack journeys

Full-stack Pursuit scope is directly covered by the PRD-01 runtime artifact.
iOS scope change, relaunch, offline outbox, and extension handoff remain PRD-02,
PRD-05, and PRD-06 release journeys.

## Metrics, rollout, and rollback

Release gates are zero cross-workspace reads/writes and zero orphaned scoped
queues. Rollout remains synthetic/local until those gates pass under concurrent
load. Contract rollback may disable new routes, but must not reinterpret stored
scope or remove audit/receipt records.

## Open decisions and falsifiers

The user has not decided whether V1 launches as owner-only or supports 2–5
members; the current schema permits scoped users but does not invent an admin
product. Reconsider the single boundary only if field evidence requires
independently authorized workspaces inside one account.
