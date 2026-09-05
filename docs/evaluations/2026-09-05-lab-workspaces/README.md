# Lab test-workspace backend evaluation

Date: 2026-09-05. Scope: migration 045 and the authenticated backend lifecycle
for an isolated, empty Lab account. This evaluation uses synthetic records in a
disposable loopback PostgreSQL 18 database and local media directory. It does
not establish native Keychain behavior, a TestFlight rollout, or S3 permissions
in a deployed account.

## Outcome

The backend now creates a server-owned account and `lab_human` identity without
copying the owner's business data. The owner creates a short-lived entry using
a client-generated secret whose raw value is never returned or stored. Replaying
the same entry intent recovers the same session; changing its secret conflicts.
Child logout atomically records entry revocation and releases the bounded slot.
Revoking the parent session invalidates that child session. A newly authenticated
owner can return and issue another entry without restoring the expired authority.

Stop first closes the workspace, revokes every child session, and waits for an
already-started governed write. Database triggers reject a new write after that
transition. Cleanup then deletes every exact media key with provider readback,
uses one constraint-preserving statement to remove the account-scoped graph,
and verifies zero business rows and zero sessions. The synthetic parent record
remained present. Automatic expiry follows the same path.

Every current account-scoped table is registered by migration 045 and has the
write guard; the disposable schema contained 99 such tables. A temporary
unclassified table made creation fail with `LAB_WORKSPACE_SCHEMA_CHANGED`, so a
future migration cannot silently escape cleanup coverage. The SQL retains the
normal foreign-key constraints described by the
[PostgreSQL constraint documentation](https://www.postgresql.org/docs/18/ddl-constraints.html);
it never disables them.

An unresolved remote object PUT is not treated as deleted. A durable pre-PUT
marker left the workspace in `deleting` with `media_unsettled`, one pending
write, and no success receipt. After a synthetic reconciliation changed that
marker to settled, the same cleanup completed. This state needs an operator or
provider-specific reconciliation path when an actual S3 request is ambiguous.

## Evidence

- [Review result](review.json) records the end-to-end observations, including
  original-scope preservation, physical local-media deletion, late-write
  rejection, and zero model or external business calls.
- [Source proof](source-proof.json) fixes the hashes of the backend, contract,
  migration, test, and documentation sources reviewed for this milestone.
- `pnpm --filter @talent-signal/backend test` passed 42 files and 302 tests,
  including exact-key S3 version deletion behavior and local deletion readback.
- `pnpm --filter @talent-signal/backend typecheck` and `build` passed.
- `pnpm docs:check` passed after the evidence and decision updates.

The S3 check uses the real AWS command construction with a mocked SDK transport;
it proves exact-key version selection, not bucket credentials or live deletion.
The end-to-end local test exercises actual files. No raw entry token is present
in these artifacts.

## Remaining boundary

The iOS app still needs the protected original-session journey, pending-entry
secret journal, generation-safe adoption, persistent test-workspace banner,
return and stop recovery. Until that native path is implemented and exercised,
this is a backend milestone rather than the complete empty-workspace feature.
