# GET-9 source-literal boundary and canonical iOS failure review

Reviewed on 2026-09-10 by independent `design_review`. Product code and Swift
were read only. Only this repository review artifact was written. Temporary
exports came from the already-copied result bundle; no Simulator operation or
full-suite restart was performed.

## Source-literal outcome

No new confirmed P0/P1 was found in the bounded source-literal and E07 tool
instruction changes. The silent reclassification of a mislabeled profile
`source_statement` is closed at code and targeted regression scope. This does
not close semantic entailment for arbitrary `inference`, E05 quality, or E07
quality; earlier failed attempts remain failed.

- `apps/backend/src/modules/screenshotContactTasks.ts:406` now rejects a
  non-`public_profile` source statement unless its value is a contiguous part
  of the cited excerpt. Existing source-reference availability and exact
  excerpt checks still run first. A real typed `ApiError` supplies the explicit
  denial rather than persisting the same invented value as an inference.
- The public-profile exception still traverses the existing canonical URL
  validation and public identity corroboration at lines 410–421 before insert.
  It is not a bypass around source availability, URL or identity validation.
  The existing LinkedIn URL normalization fixture remains valid.
- `checkpoint` at line 468 executes the entire local tool in one transaction.
  If a later field in a batch fails, earlier inserts and the in-memory task
  update are discarded. The new test checks zero persisted observations and
  empty task fields **before** its corrected retry, then separately verifies
  the final literal observation.
- The SDK rejection feedback at line 661 explains the required correction and
  preserves already-completed filing. The shared tool description in
  `apps/agent/src/contactIntakeSchemas.ts:70` supplies the same source-wording
  distinction to the legacy Zhipu path, whose error observation remains a
  code rather than the SDK's expanded instruction. Explicit supported
  paraphrases remain accepted as `inference`.
- The E07 `read_relationship_memory` description in
  `apps/agent/src/claudeChatProvider.ts:72` tells the model to answer the
  recorded recollection without turning imprecise details into a verification
  task. It changes guidance only: the snapshot's proposed status, source IDs,
  authority restrictions and read-only implementation remain intact. A new
  real quality attempt is still required; this is not proof that the fifth
  attempt's conversational regression has disappeared.

The strict literal check does not prove full semantic support: quoting an
unrelated substring, or explicitly labeling unsupported work history as
`inference`, can still require independent quality rejection. In particular,
"discussed design systems" cannot be made into demonstrated design-system
work merely by changing its epistemic label. The new instruction addresses
that distinction without claiming deterministic semantic validation.

## Independent test result

Ran the exact current suite against the dedicated synthetic database:

```sh
pnpm --filter @talent-signal/backend exec vitest run src/modules/screenshotContactTasks.integration.test.ts
```

Result: **12 passed, 3 failed of 15**. Both new literal/inference tests and the
existing public-profile URL regression passed. Three pre-existing tests hit
the unchanged 5000 ms timeout:

- line 198: create/reuse/no replay;
- line 217: invented quotation/source-revocation cleanup;
- line 232: archive/reversal/rejected-source retraction.

No semantic assertion failure was reported for these three tests. The suite
ran while the full iOS process was still active, but this observation alone
cannot prove the timeout cause. The failures are retained; no timeout was
increased and no immediate repeated suite was used to replace the result.
The independent full file is therefore **not green**. Revalidate it once the
shared machine/database load is controlled.

## Bounded iOS diagnosis

The failed test starts at `/tmp/get9-ios-full-latest.log:19676`. Its first
recorded assertion failure is
`apps/ios/UITests/CandidateSignalUITests.swift:2606`, waiting 15 seconds for
`canonical-pursuit-today`, before the Ask question is entered. Fixture
preparation at line 4087 completed; its canonical pursuits were present.
The test helper at line 5676 resets Agent sessions, not every independent
capture queue or process on the machine.

The existing result bundle `/tmp/get9-ios-canonical-failure.xcresult` was
exported read only to `/tmp/get9-review-canonical-all`. At the first failure's
snapshot time, **18:01:51.343 UTC**, attachment
`AFEED61B-8805-4791-8A2F-6644E317A14A.txt` already contains:

- a `ScrollView` identified `canonical-pursuit-today`;
- the selected Today tab and Avery Morgan due-action content;
- two concrete pursuit IDs, including
  `6397a12e-53f2-4223-b93c-e136711e542b` and
  `871255b3-c944-419e-985e-4b1490693031`.

This contradicts a diagnosis that canonical Today business state was simply
absent. The view became available at or immediately after the wait boundary.
The underlying store/service/UI startup is slow; this is not proof of a
spurious test failure that can simply be ignored.

The parent's original API tail covers **18:06:38–18:08:09 UTC**, after this
failure. Its later unscoped 404 must not be attributed to this test's initial
wait. Read-only Docker logs from the exact owner container
`talent-signal-ios-check-97453-api-1`, bounded to 18:00–18:05 UTC, were saved as
`/tmp/get9-review-canonical-api-aligned.log`. They show:

| Request | Start UTC | Finish UTC | Result |
| --- | --- | --- | --- |
| GET `/v1/pursuits` | 18:01:38.520 | 18:01:47.325 | 200; logged 9036 ms |
| GET `/v1/pursuit-proposals` | 18:01:38.601 | 18:01:50.463 | 200; logged 12095 ms |
| Three POST `/v1/resource-captures` | 18:01:40.380–.450 | 18:01:50.936–.980 | one 201, two 500 |

The proposal read completes almost exactly at the approximately 18:01:50.3
wait deadline. The capture failures are **real PostgreSQL statement timeouts
(code 57014)**, not model failures. One log at line 103 names a tuple lock in
`harness_source_generations`; another at line 105 names the source-invalidation
`UPDATE harness_sessions ... WHERE account_id=owner` statement. Both stacks
run through `completeSourceReview` and `createResourceCaptureInTransaction`.
This is direct evidence of concurrent source-invalidation contention during
startup. It does not identify the blocking transaction or prove that the
same lock directly caused the slow read queries; those require a contemporaneous
lock/activity capture or a controlled reproduction.

The attachment named "Canonical Ask evidence-bound response"
(`784B766F-CB33-40A4-95C2-0D3E98683467.png`) was visually inspected. It actually
shows Today, a Capture sessions badge of 3, and Avery's due action, **not an
Ask response**. Subsequent log entries fail to find the composer/send control.
There is no matching chat-task request in the aligned API slice. Attachment
names and continued test execution therefore do not establish success of the
later Ask/citation steps. The failed test remains failed.

## Next diagnostic boundary

Preserve the original full-run parts and aligned failure logs. Before another
full run, isolate the failed case with the intended current backend, inspect
which capture work is resumed at startup, and record any blocking PostgreSQL
transactions on the source-generation/session invalidation path. Separate the
initial Today readiness failure from the later composer-opening failure.
Do not increase UI or database budgets on the assumption that business state
is missing, and do not claim that source-invalidation safety can be weakened
to remove contention. No Swift change or infrastructure mutation was made in
this review.

## Additional session-lock review requested during diagnosis

### P1: a live SDK transaction can block or fail source revocation

This is separate from the source-literal increment. The current continuation
holds a row lock across the remote SDK execution:

1. `apps/backend/src/modules/harnessSessions.ts:68` updates the binding expiry
   inside the caller's long product transaction. Line 79 repeats an update
   during every authority check. Both retain their write lock until that
   transaction ends, even if the expiry value does not change.
2. `apps/backend/src/database/058_claude_harness_sessions.sql:52` first updates
   the account generation inside a source mutation's transaction. Line 54 then
   synchronously updates all live harness bindings and line 55 purges entries.
   A revocation affecting a committed binding that is currently running waits
   on the SDK transaction's row lock.
3. The ordinary guards (`harnessSourceGuard.ts:19` and
   `harnessSessions.ts:82`) perform MVCC reads. They cannot see the generation
   increment in the still-blocked, uncommitted revocation transaction. The
   NOWAIT fence is requested only by `finish(true)` near the end of execution.
4. The production pool has `statement_timeout: 10_000` at
   `apps/backend/src/database/pool.ts:13`. If the remote turn outlasts the
   revocation's statement deadline, the source mutation fails and rolls back;
   the old source remains available. A final fence later in the SDK run cannot
   rescue an already-timed-out revocation transaction.

This is a confirmed liveness/availability defect in an authorization lifecycle:
a user's source withdrawal/deletion can be held behind an unrelated long model
turn and return an error. It is **not** evidence that a successfully committed
revocation was ignored or that an external write occurred. The aligned iOS
logs separately prove real statement-timeout failures on these trigger paths,
but do not identify a particular active SDK run as their blocker.

The existing concurrent test at
`apps/backend/src/modules/harnessSessions.integration.test.ts:183` explicitly
starts retraction without awaiting completion, immediately calls
`session.finish(true)`, and only then awaits and commits retraction. It proves
that the final NOWAIT fence prevents a successful checkpoint while revocation
waits. It does **not** test prompt source-write completion, heartbeat cancellation
while the model remains active, or source-write success before a database
statement timeout. The earlier final-fence closure must not be treated as
closure of this newly identified liveness boundary.

The corrective boundary should let authority withdrawal commit promptly and
become observable without waiting for a long-lived mutable checkpoint lock.
Preserve the single-writer lease and atomic accepted checkpoint, but separate
that lease/staging work from early updates to a retained binding. Account for
configuration replacement, expiry shrink, entries and physical purge as well
as the normal resume path. A heartbeat lock probe could detect a waiting
withdrawal, but must not itself retain a generation share lock across the
long transaction and merely reverse the blocking direction. Do not fix this
by weakening source admission or increasing the statement timeout.

Required regression: keep an existing resumed SDK run suspended (without
calling `finish`), issue a real source withdrawal on another connection, and
prove its bounded completion plus prompt run cancellation. Assert no continued
tool/result exposure, no committed checkpoint, and eventual removal of main
and subagent copies. Keep a case where source withdrawal arrives near the final
commit fence.

### Account-wide serialization also exists without SDK sessions

The trigger unconditionally writes the single generation row for every
qualifying row change, even if there are no harness sessions to purge.
`resourceIntake.ts:957` increments a person's version during new intake;
`sourceRetention.ts:1031` sets review-completion metadata. Both enter the broad
UPDATE triggers, so the comment in migration 058 lines 45–46 that new unrelated
sources do not invalidate sessions is not generally true. Parallel source
transactions for different people in the same account serialize on that one
generation row and hold it through the rest of each product transaction.

That shared lock is established by code even for an empty harness-session
account. However, a zero-row `UPDATE harness_sessions` should not itself wait
for a harness row, so the second aligned timeout cannot be attributed to an
SDK owner merely from the statement text. The exported error has no blocking
backend PID or transaction identity, and the container has since been removed;
the exact historical blocker cannot be reconstructed from these logs.

Narrow metadata-only trigger changes where authority/context meaning truly
has not changed, or use an invalidation representation that does not require
every source writer to take the same long-held row lock. Do not simply skip
generation changes when no SDK session exists: the standalone source guard
also protects nonpersistent runs. A new design must preserve that admission
boundary and test concurrent new-source intake without any SDK sessions.

## Heartbeat savepoint fix re-review: P1 remains open

The next revision adds `FOR SHARE OF g,s NOWAIT` during ordinary authority
checks, wrapping each probe in a savepoint that is rolled back and released.
It serializes `checkAuthority` calls through `authorityChecks`, while keeping
the final fence until commit. The parent-run log
`/tmp/get9-revocation-heartbeat-tests.log` reports 13/13 tests passing.
This does improve the previously seeded/resumed-binding case, but two concrete
P1 cases prevent closure.

### P1: heartbeat rollback silently discards a successful append

`authorityChecks` serializes only authority probes. `store.append` awaits its
probe and then performs entry INSERTs and size queries outside that lane.
A different heartbeat can create its savepoint while those operations are
in progress. Because both use the same PostgreSQL connection/transaction, the
heartbeat rollback also undoes an append INSERT that ran inside its savepoint.
The append has already returned success; an older retained main entry allows
`finish(true)` to commit successfully with the new entry missing.

An independent deterministic probe used the actual current
`createHarnessContinuationFactory` and PostgreSQL, with a query wrapper that
paused the append immediately before INSERT and paused a heartbeat immediately
after its savepoint was created. It then allowed the real INSERT to complete
before releasing the heartbeat. No SQL result or domain implementation was
mocked. `/tmp/get9-review-heartbeat-probes.log` records:

```json
{"case":"append_inside_heartbeat_savepoint","appendResolvedSuccessfully":true,"entryBeforeHeartbeatRollback":1,"entryAfterHeartbeatRollback":0,"finishTrueCommitted":true}
```

The new concurrent test only combines `assertCurrent`, `store.load` and another
check. It establishes that read fences are released, but cannot detect lost
writes because no append occurs inside the probe window.

Serialize the entire relevant connection operation sequence, not just checks,
or place the transient lock probe on a separate short-lived transaction. Any
host tool using the same product connection must also be considered; a lane
private to continuation methods does not protect unrelated product SQL from
the savepoint rollback. Add an append/heartbeat interleaving regression that
checks the exact newly appended UUID after successful final commit.

### P1: the first uncommitted generation row defeats the lock probe

For an account with no generation row, factory startup inserts it at
`harnessSessions.ts:54` inside the long SDK transaction. A source mutation's
trigger UPSERT waits for that uncommitted insert. The SDK's probe can read and
lock its own row, so it cannot detect the waiting writer in this configuration.
The parent regression first seeds a completed Session and thus bypasses this
first-binding boundary.

The same independent probe created a fresh synthetic account and product
Session, confirmed there were zero generation rows, started its first binding,
then issued the **actual** `agent_session_retracted_tasks` trigger from a second
connection with a 1200 ms statement deadline. `pg_stat_activity` confirmed
that writer was waiting on a lock. Three ordinary authority checks all passed;
the source mutation timed out:

```json
{"case":"new_account_baseline","generationRows":0}
{"case":"fresh_binding_revocation","writerWaitingOnLock":true,"regularAuthorityChecks":["passed","passed","passed"],"withdrawal":{"ok":false,"code":"57014"},"elapsedMs":1204}
```

The shorter deadline makes this deterministic test quick; the blocking
mechanism does not disappear at the production 10-second deadline while the
SDK transaction remains open. Establish the required generation baseline in
a committed boundary before long execution, and retain coverage for first
bindings as well as resumed bindings. Do not condition invalidation on having
retained SDK sessions, because nonpersistent source guards still need it.

Probe source: `/tmp/get9-review-heartbeat-probes.mts`. It used two independent
synthetic accounts and ended all transactions/connections. It did not run the
SDK, mutate production source files, control Simulator, or replace the retained
failing evaluation attempts. Both the original revocation-liveness P1 and the
new successful-append data-loss P1 remain open. Zero-session account-wide
metadata serialization remains a separate unresolved concern.

## Independent autocommit probe re-review — P1 closure

The subsequent patch replaces the transient same-client savepoint with an
independent autocommit `Pool.query` at `harnessSessions.ts:82–93`. Its
`FOR SHARE OF g,s NOWAIT` detects pending generation/product-Session writers
without rolling back any product or mirror SQL. The one-second wait fails
closed if the pool cannot provide timely authority. The final source/Session
fence remains in the product transaction through its commit.

Migration `061_harness_generation_baseline.sql` establishes generation rows
on account insertion and backfills existing accounts. The factory now requires
that committed baseline (`harnessSessions.ts:53–55`) instead of inserting it
inside the SDK transaction. Both production callers explicitly pass the original
Pool rather than the transaction client.

Independent verification used the migrated synthetic native PostgreSQL database
on port 32774. The previously supplied database on port 32773 lacked migration
061; its expected missing-baseline rejection was not counted as a product test
failure or a passing concurrency test. No migration was applied by this reviewer.

The updated deterministic probe, using the actual factory and actual SQL,
interleaves a successful append with an independently blocked heartbeat return,
then checks the exact new entry UUID after final commit. It also obtains a
separate `FOR UPDATE NOWAIT` lock while the heartbeat result is paused, proving
that the autocommit probe already released its read locks. A query wrapper
controls only scheduling; it does not fabricate SQL results.

`/tmp/get9-review-heartbeat-fixed.log` records:

```json
{"case":"concurrent_append_independent_probe","appendResolvedSuccessfully":true,"entryAfterCommit":1,"probeSavepoints":0,"probeReadLocksReleased":true}
{"case":"revocation_after_fix","resume":false,"committedGenerationRows":1,"writerWaitingOnLock":false,"regularAuthorityCheck":"HARNESS_SESSION_UNAVAILABLE","withdrawalCommitted":true,"remainingEntries":0,"elapsedMs":5}
{"case":"revocation_after_fix","resume":true,"committedGenerationRows":1,"writerWaitingOnLock":true,"regularAuthorityCheck":"HARNESS_SESSION_UNAVAILABLE","withdrawalCommitted":true,"remainingEntries":0,"elapsedMs":7}
```

The first-binding case commits revocation immediately because the new mirror
row is not yet visible to the writer; the next ordinary check sees the changed
generation and rejects the run. The resumed case deliberately observes the
actual trigger waiting on the existing mirror row; the independent NOWAIT
probe rejects the run, rollback releases the row, and revocation commits.
Both leave zero retained transcript entries. Probe timings describe this
controlled check/release interval, not the production heartbeat schedule or
an end-to-end latency claim.

The reviewer also independently ran the exact `harnessSessions.integration.test.ts`
suite against that migrated database: **14/14 passed**, process exit 0,
6.41 seconds; log `/tmp/get9-review-independent-harness-tests.log`.
The independent probe process exited 0 and cleaned up only its own synthetic
accounts. Source: `/tmp/get9-review-heartbeat-fixed.mts`.

**Closed:** the successful-append data-loss P1 and the original/first-binding
revocation-liveness P1 are resolved by code inspection plus the independent
interleaving and real-trigger evidence above. Previous failing probes remain
recorded. No new P0/P1 was confirmed in this bounded patch.

**Still separate:** account-wide generation/metadata serialization, including
zero-SDK-session traffic, has not been fixed or exonerated by these tests.
Neither the interrupted full iOS run nor overall GET-9 acceptance is claimed
complete. Pool saturation intentionally makes the run unavailable; these checks
do not establish its production throughput or quantify that failure rate.
