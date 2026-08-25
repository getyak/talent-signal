# ADR 0007: Account is the V1 workspace boundary

## Context

The existing backend scopes sessions, users, people, evidence, queues,
idempotency, audit events, and effects by `account_id`. The Pursuit design uses
the user-facing term `workspace_id`. Adding a second tenant key would create two
possible owners for the same sensitive evidence and require unsafe translation
rules across every query, cache, queue, and Agent run.

## Decision

Use the existing account as the one V1 workspace and authorization boundary.
Persist `account_id` on every canonical row and composite relationship. Expose
that same identifier as `workspace_id` in new product contracts where the user
model calls it a workspace.

This is an alias at the API boundary, not a new entity or a lossy mapping. A
session selects exactly one account/workspace. Local caches, outboxes, sync
cursors, and future Agent runs must be destroyed or changed as one bundle when
the active session changes.

## Alternatives considered

- Add workspaces below an account now: supports future multi-workspace plans but
  introduces a second scope before any V1 user needs it.
- Rename all existing account fields and tables: creates a large migration with
  no change in authority semantics.
- Keep both identifiers without an invariant: makes cross-scope leakage and
  orphaned queue entries likely.

## Consequences

- Pursuit rows, subentities, operations, and receipts use composite
  `account_id` foreign keys;
- new API responses may say `workspace_id`, but its value must equal the
  authenticated `account_id`;
- there is no cross-workspace move or shared Pursuit in V1;
- a later hierarchy requires a new ADR, migration, isolation proof, and cache /
  outbox invalidation design rather than silently changing this alias.

## Reconsider when

Revisit only when field evidence requires one authenticated account to contain
multiple independently authorized workspaces, or a customer-owned workspace
must safely outlive the current account model.
