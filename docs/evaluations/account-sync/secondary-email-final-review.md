# Independent secondary-email ownership review — final integration

Final integration status: no confirmed unresolved P0/P1; the no-op claim P2
is closed by the parent fix and final source-bound review recorded below.

Scope: `reserveVerifiedEmail`, explicit provider linking, ordinary known-subject
Google/Apple sign-in, reconciliation claim snapshots/recheck/transfer, migration
084, and the corresponding backend integration tests. Read-only source review;
no database, provider, test execution, or implementation edits were performed.
Pi remained the implementation owner. Native and timestamp work was excluded.

## Initial repair16 snapshot

No unresolved P0/P1 established against the final reviewed source snapshot.
One concrete P2 remains: same-owner reservation reassertion always increments
the claim revision, so an otherwise unchanged ordinary provider sign-in can
invalidate a prepared reconciliation. A deterministic JSONB key-order P1 was
found in the initial snapshot and fixed by Pi during this review; its source
closure is recorded below. This is not a statement that runtime acceptance is
complete or that source stayed unchanged throughout the entire review.

## Initially open P2 — same-owner no-op invalidates a fresh prepared reconciliation

[accountIdentity.ts:71–81](../../../apps/backend/src/modules/accountIdentity.ts#L71)
unconditionally updates `revision = revision + 1` and `updated_at` before
returning `idempotent`. If verification provenance is already present, both
COALESCE expressions retain exactly the same source/time and no ownership,
claim kind, or verification evidence changes.

Concrete sequence:

1. An account already owns a verified secondary address B with provenance.
2. Prepare an authorized reconciliation involving that account; B/revision N is
   part of its frozen owned-claim list.
3. Complete ordinary Google or Apple login with that same established subject
   and unchanged verified email B on another device. The sign-in call invokes
   `reserveVerifiedEmail` at [googleAuth.ts:148–159](../../../apps/backend/src/modules/googleAuth.ts#L148)
   or [auth.ts:406–420](../../../apps/backend/src/modules/auth.ts#L406).
4. B becomes revision N+1 without a semantic claim change. Confirm reports
   `RECONCILIATION_PROOF_STALE` when comparing the frozen claims at
   [accountReconciliation.ts:611–625](../../../apps/backend/src/modules/accountReconciliation.ts#L611).

This is a recoverable completion regression, not a cross-account authorization
bypass. It conflicts with the ADR's idempotent same-owner claim requirement.
Increment the revision only when persisted ownership/provenance actually
changes; already populated same-owner claims should perform no write.

The new test at
[accountIdentity.integration.test.ts:2282](../../../apps/backend/src/modules/accountIdentity.integration.test.ts#L2282)
currently treats this no-op reassertion as a real changed-claim fixture. Replace
that fixture with a genuine change and separately test that no-op reassertion
preserves the revision and permits the still-fresh confirmation.

## Closed initial P1 — raw JSON equality rejected unchanged claim snapshots

Initial `accountReconciliation.ts` SHA256:
`22bb6a2d11f5a97fa1280d26917da0836950ab068b6cd721c1a205e968c1a52e`.

The initial code froze SQL row objects in the `frozen_state jsonb` column, then
compared fresh query rows and the JSONB readback with `JSON.stringify`. JSONB
does not preserve object key order. Nonempty owned-claim lists could therefore
fail equality despite identical fields; empty arrays masked it in older
same-email conflict fixtures. Prepare/confirm with one owned source alias was
the minimal regression sequence.

Final SHA256:
`160b496413880632b47539eeb5c619c341556528deb1406366496e570505525d`.

Pi added recursive object-key canonicalization at
[accountReconciliation.ts:540](../../../apps/backend/src/modules/accountReconciliation.ts#L540)
and uses it for the comparison at line 623. Arrays retain their order, and both
queries sort by normalized email. The key-order P1 is closed by source review.
Both sides cast `verified_at` to SQL text, so there is no JS Date versus JSON
string mismatch under the same PostgreSQL session formatting. Different
connection TimeZone/DateStyle settings were not established or tested here;
this review does not claim that formatting variability was exercised.

## Other checked boundaries

- Verified emails enter the shared `account-email:<normalized>` advisory-lock
  and unique reservation arbitration before any explicit-link hint/credential
  update. The existing-subject branch follows it as well. Email/subject
  conflicts throw and the outer transaction rolls back any preceding claim.
  Missing/unverified email does not call the claim helper.
- Explicit linking rejects foreign/conflict claims. Ordinary known-subject
  login retains subject authority across email collision. The expected
  `EmailClaimConflict` is a JavaScript exception following successful SQL, so
  catching that business collision does not leave PostgreSQL aborted.
- Ordinary-login catches are broad and have no savepoint. If actual SQL fails,
  the next SQL in that aborted transaction also fails and the outer handler
  rolls it back; this is not silent successful login or partial claim commit.
  Narrowing the catch to the expected business conflict would be clearer, but
  no independent P0/P1 was established from that catch alone.
- Unlink does not delete claims. Password login still looks up primary email
  or username and requires the existing password credential; reservations do
  not become password identifiers.
- Migration 084 adds provenance fields/constraints without upgrading historical
  hints or inventing verified history. Secondary rows require verification
  source/time together.
- Reconciliation freezes owned claims for the source and canonical owner,
  including address, owner, state, revision, kind and verification provenance.
  Changes to those owned lists are compared before transfer under the existing
  exclusive account locks. The account-retirement write fence prevents a
  governed alias mutation from committing past those account locks unchecked.
- Transfer updates **all** owned claims belonging to the exact source
  account/user, preserving source/time metadata. It does not grab rows owned
  by another user. The inventory checks reservation `user_id` against the sole
  expected source user, so a foreign user's row in that account blocks empty
  transfer. The primary historical conflict row is handled separately by the
  existing conditional resolution query; it is not included in the owned-list
  snapshot when its owner is NULL. No new claim is inferred from historical
  `email_hint` values.

## Tests read; no tests run

The new integration block contains real entrypoint coverage for split
prevention, same-subject email changes, unlink retention, source alias transfer,
and stale claims. Its two signup/link labels do not deterministically force
the stated order: both loop iterations start the signup promise before the
link promise and await them concurrently (lines 2049–2098). The parent's
`linked-email-boundaries.mts` instead uses actual COMMIT gates and blocking
readback to prove both orderings; that is the stronger acceptance evidence.

Pending parent verification should include the new nonempty-claim
prepare/confirm case after canonical JSON repair and the no-op provider-login
case above. This source review does not replace the parent's PostgreSQL runs.

## Final source hashes

The following values were re-read after the reconciliation file changed; all
other implementation values matched their initial reads. The integration test
changed during review from `c0f35bc0...` to `032439d5...`; its affected secondary-
email block was re-read at the final hash, including shifted stale-claim lines.

```text
accountIdentity.ts
02f1ae9340aef16be5dba1b19c920a1ec167d543ba4596007c0a5799d6040f1d
accountLoginMethods.ts
e73cd3423e4ca5242f38e47ff66bb2d8e2557604353bdaaaf7d21a116fb54572
auth.ts
196ccaf8a1c8d356e8b4715dd3c0125451cdf02180ba575a173dca0d96d8761c
googleAuth.ts
bccd7e607e4481ce7ae9514391f34dc0dd872383558f813118e7d972b3b62cc4
accountReconciliation.ts
160b496413880632b47539eeb5c619c341556528deb1406366496e570505525d
084_secondary_email_ownership.sql
e18169a97a774296acd7fc88a54712512f474f8b53eaee4179306113824818f9
accountIdentity.integration.test.ts
032439d54d18eaecd4d3937ec3ee885a32ca92ab8a180cb8dfffd270824c30f9
```

## Parent integration closure — no-op claim P2

The remaining no-op revision P2 is **closed by read-only review** in the parent
worktree `/Users/cubxxw/data/talent-signal-account-sync`. This is a later parent
snapshot, not a retroactive change to the frozen worker review above.

`accountIdentity.ts:65–83` retains the locked exact account/user ownership check.
The UPDATE now matches only rows missing `verification_source` or `verified_at`.
An already verified same-owner claim therefore changes neither provenance nor
revision/updated_at, even when a later login supplies a fresh verification time.
A real missing-provenance upgrade still changes the row once and advances its
revision. The advisory lock and reservation row lock remain in place. No new
P0/P1 was found in this bounded delta.

`accountIdentity.integration.test.ts:2253–2296` calls the real reservation helper
inside transactions, prepares a transfer using both password proofs, reasserts
the same verified alias, checks exact equality of revision/updated_at/source/time,
then calls real confirmation and verifies the alias moved to the canonical
account. The stale-claim regression at lines 2302–2355 now creates a genuinely
new alias after prepare and asserts stale-proof rejection with source ownership
and retirement state unchanged. These cases exercise actual consumers rather
than substituting an assertion on implementation text.

Read back the parent-run log `account-identity-integrated-r17.log`: **2 files,
43 tests passed**. This reviewer did not execute database tests. The two source
hashes below were unchanged on the final read:

```text
apps/backend/src/modules/accountIdentity.ts
73e75f47225e20c6c1b4bb75dce9be2b8c8703dd434104d43c5f42a58984524d
apps/backend/src/modules/accountIdentity.integration.test.ts
4014f13f5a06e2b66ef517dc9dd46e0ed3f465fb986591c08149321924341d62
```
