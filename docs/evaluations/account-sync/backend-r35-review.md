# Backend r35 independent clock review

**Verdict: one confirmed P1 regression, now reproduced through the real public consume route with PostgreSQL; do not carry r33 acceptance forward to this clock delta.** `SELECT now()` is a transaction-start timestamp, so the new checks can admit authority that expired while the request waited for a row lock. The r35 run consumed an expired code and created a user/session; r33 rejected its corresponding case. A separate P2 records the incomplete application/database clock migration. The parent executed the probes; this reviewer only inspected the script, final receipts and frozen source hashes, without running a database or test.

## Frozen scope and evidence

- Snapshot: `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r35/talent-signal`, clean commit `288f874aa7cfdee1bfe27b0a30c52ffce15d275f`.
- Comparison: r33 `78c2a85fb318ae8833ce6999318f30c1065af7d7`. Only `apps/backend/src/modules/desktopAuth.ts` and its integration test differ within the 451-file backend/contracts manifest.
- Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/backend-r35-snapshot.json`, captured `2026-09-25T05:23:29.730343+00:00`, SHA256 `54ed43d0af3c098bce05a74ecbbe9ecd2a745ad6ab097aed0bec1bddee0814af`. All **451 files** independently matched.
- `desktopAuth.ts`: `0e95ff9f1de0d7bc1a209326d0ed939ae213fc46d9e483c6c59db246687f13c1`.
- `desktopAuth.integration.test.ts`: `a9fea8ff0ed692b7e7479d015d7d418b60f896f6461bdb3e679b47b8b9526505`.
- Unchanged shared `accountLoginMethods.ts`: `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06`.

This review reads the frozen backend delta and necessary shared consumers only. It does not assess moving Pi/Web/native code or overwrite r33's report. Only this report was written.

## P1 — post-lock expiry checks use the pre-wait transaction timestamp

**Location:** `desktopAuth.ts:141–143`, consumed at `1054–1057`; also target prepare `520–528`, pending reads `1388–1412`, and continuation recovery `1577–1578`.

PostgreSQL 18 is the configured production image (`compose.production.yaml:17`). Official documentation specifies that `now()` equals `transaction_timestamp()` and is constant within a transaction; `clock_timestamp()` observes actual time. A later `SELECT now()` does not refresh the transaction's clock. [PostgreSQL 18 current date/time](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT).

The concrete consume sequence is:

1. Create and approve a legitimate paired login attempt and issue its valid 60-second code. Near the code deadline, another connection holds D's row lock without changing the row.
2. Call the real consume route with its correct pairing/code/verifier/fingerprint. It executes `BEGIN` (`1039`) before waiting in `loadAttempt` (`1040`, `232–240`, `FOR UPDATE`).
3. Release the holder after the code deadline, while D's longer attempt lifetime remains valid. The new `databaseNow()` returns the time before the wait, so `code_expires_at <= dbNow` is false. There is no later code-expiry check before `commitDesktopLogin` (`1094–1105`); the expired code can create a session.

This is a regression from r33's application-clock comparison performed after D was acquired, even with synchronized hosts. Anonymous login has no flow deadline to catch it. For credential rounds, a code deadline can precede the flow deadline, so `assertFlowDeadline` is also not a substitute. A short wait is sufficient when the request starts just before expiry; the normal 10-second statement timeout (`database/pool.ts:13`) does not prevent this schedule. Row locks can legitimately block until the holder's transaction ends. [PostgreSQL 18 row locks](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-ROWS).

The same cause has two additional verified source paths:

- **Target prepare:** `BEGIN` (`379`) precedes `SELECT ... G FOR UPDATE` (`520`). After waiting across G's expiry, `524–528` still admits it using the old transaction timestamp. A still-valid flow with an earlier grant deadline is enough. The code then creates a new target D capped to the already-past grant expiry (`570`, `598–600`), returning a prepared attempt from expired authority. Its later authorization may refuse; this particular path alone does not prove a credential mutation.
- **Pending recovery:** result acquires D after `BEGIN` (`1512–1513`) and may also wait for actor locks. New pending checks compare D/G against the same old time (`1391`, `1409`, `1577–1578`), potentially returning `pending` or `pending_continuation` after the relevant D/G deadline when the separate flow deadline has not yet elapsed. Committed-history receipts deliberately have different deadline rules and must not be changed to use pending expiry rules.

The consume/code path is now dynamically confirmed below. Target prepare and pending continuation recovery remain source-only findings; the new probe does not exercise them.

## Independent assessment of the parent PostgreSQL counterexample

**The narrow expired-code counterexample is valid.** The same script imports the actual production `registerDesktopAuth` and mounts its public handlers in Fastify. It executes prepare→authorize→approve→complete→consume; only external Apple verification is controlled. It does not stub consume, the transaction client, row locking or the session mutation. Anonymous login is intentional: no existing-session expiry or credential-flow deadline can obscure the code-expiry boundary.

The script restricts its database connection to the dedicated loopback `account_sync_clock_boundary`, creates random actors, and completes a fresh-code positive control for each source. Only after a legitimate code is issued does it shorten that code's expiry to DB wall-clock time plus four seconds. It then holds the exact D row and starts actual consume. `pg_stat_activity` observes a lock-waiting desktop query with a transaction start before the deadline. The blocker releases only after an independent DB `clock_timestamp()` has passed the deadline by at least 150 ms; it does not update D while holding it. This models entering the final seconds of a valid code's lifetime without waiting the full minute and leaves the other authority longer-lived.

| Evidence | r33 | r35 |
| --- | --- | --- |
| Fresh-code control | `200 logged_in` | `200 logged_in` |
| Consumer transaction start (DB) | `05:30:16.780Z` | `05:30:38.039Z` |
| Shortened code deadline (DB) | `05:30:20.773Z` | `05:30:42.031Z` |
| DB time observed before blocker release | `05:30:20.953Z` | `05:30:42.194Z` |
| Expired-code consume | `410 DESKTOP_AUTH_ATTEMPT_EXPIRED` | **`200 logged_in`** |
| Durable D | `expired`, not consumed | **`consumed`** |
| Session count delta / matching new users | `0 / 0` | **`1 / 1`** |
| Cases | `2/2 passed` | **`1/2 passed`** |

Dates in this table are `2026-09-25`. The failure receipt saves the response and durable observations before its exact `410` assertion fails, so this is a recorded unauthorized-after-deadline commit, not an unexplained harness timeout or generic 500. Global session counts alone would be weak with concurrent writers, but this dedicated sequential fixture also records a newly created user for its unique email and its own D consumed. The positive cases exclude a universally broken route/fixture. Parent-reported exit codes (`r33:0`, `r35:1`) agree with the script's explicit exit policy and receipt outcomes; no separate process-exit log was supplied here.

### Evidence binding and limits

All paths below are in `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/clock-boundary`:

| File | SHA256 |
| --- | --- |
| `code-lock-expiry.mts` | `20e80777e6b10bd4214ba78e85450513f0cc10afa0ece4ec8b98881fcb368a38` |
| `r33-code-lock.json` | `a188a15378683c9608f029dc253df20a7e60a0b27e5c14a9f1c43959a3232649` |
| `r35-code-lock.json` | `88505e7e12009074c43c4a8a5ec09eda05ccdc1bf2d5c7012d32f2dadc7449d9` |

Both receipts have stable before/after hashes, and all five recorded runtime files independently match their respective frozen source. The script's 12-second statement timeout is slightly above production's 10 seconds, but the approximately four-second wait in this receipt fits both; that difference does not explain the failure.

The app-generated r35 `executedAt` is `05:30:40.230Z`, earlier than its DB-observed pre-release time `05:30:42.194Z`. Do not use those cross-clock timestamps as a single chronological timeline, or claim these two runs are a synchronized-host-clock experiment. No cause for this discrepancy was measured. The decisive r35 ordering uses **only DB time**: transaction start < code deadline < observed release threshold, followed by actual successful consume. The PostgreSQL `now()` semantics and code path establish why that transaction retains the earlier time. The r33 run demonstrates that its corresponding test rejected correctly, not that every clock condition was identical across runs.

The harness contains unused copied revocation/admission-gate machinery; `gate` remains null in these two cases. It therefore proves neither revoke-after-admission nor an authenticated-current/target round. It also does not test G/A lock waits, provider latency, host-clock offsets, full real-time 60-second TTL, Web transport, WK cookies or live OAuth. Fastify injection invokes real public route handlers in process; it is not an external HTTP/browser test. These limits do not invalidate the observed code-deadline failure, but the broader static seams still require their own acceptance evidence.

## P2 — the claimed database-clock policy is not implemented end to end

The comment at `136–139` claims expiry comparisons never use the application clock, but `assertFlowDeadline` still uses `new Date()` (`341–342`), as do preparation flow validation (`458`), authorization (`677`, `713`), approval (`786`), code issuance (`921`) and cancellation (`1917`). Attempt TTL (`598`), code TTL (`930–931`) and current grant expiry (`1158`) are also computed with the application clock. Replacing only `databaseNow` with a live DB clock would leave this discrepancy.

There is an exact new cross-clock inconsistency, beyond wording: code issuance stores `app_now + 60 seconds`, while consume compares it with DB time. With a stable application clock 90 seconds behind DB, an immediately redeemed fresh code is already expired to the new consumer. With the application 90 seconds ahead, its nominal 60-second code can remain DB-live about 150 seconds. Login lacks a flow deadline. No clock-skew experiment was executed here; this is a source-derived scenario, not a claim that deployment clocks are currently skewed.

The unchanged `assertFlowDeadline` still rejects some waits that cross a credential flow deadline on synchronized hosts; it does not repair the shorter code/grant deadline cases above. Do not remove that guard without supplying an equivalent guard in the chosen clock domain.

## Minimal repair requirements

1. Either revert this unrequested runtime clock delta to the reviewed r33 behavior, or implement a coherent bounded expiry fix. A revert removes the new regression; it is not proof that all older expiry checks are sufficient.
2. For pending authority, observe a **fresh database wall clock after the necessary blocking locks** and compare every applicable stored attempt/code/grant/flow/session deadline at the admission point. Use a separate post-lock `clock_timestamp()` observation or equivalent post-lock SQL comparisons. Putting a clock expression only in the same `SELECT ... FOR UPDATE` predicate is not a substitute for a check after the wait. If later lock waits or provider verification occur before mutation, revalidate deadlines after those waits as well. Preserve D→G→A/U/S→P ordering and exact actor/revision guards.
3. If DB time is the chosen policy, align issuance and consumption; preserve the original proof/flow caps rather than renewing TTL. Keep ordinary completion and desktop consumers consistent. The shared `loadLockedCredentialChangeAttempt` already uses `expires_at > now()` in its locking query (`accountLoginMethods.ts:920–938`), and `initiatingIdentity` uses the same transaction-time predicate for session expiry (`desktopAuth.ts:282–285`); these are pre-existing seams, so changing the new helper alone does not establish a complete post-wait guarantee. This report does not relabel them as newly introduced r35 defects.
4. Preserve readback of an exact committed G/audit fact under its original live actor after pending proof expiry. Do not restore the earlier B1/B3 false-unknown/cancel behavior by applying pending TTL to already-committed receipts.

`statement_timestamp()` is only fresh at command start, so it is unsuitable if that same command can wait before authority is used. Use the documented wall-clock operation and explicitly choose the post-lock authorization point. Normal audit timestamps may remain transaction timestamps where that is their intended meaning; a blanket textual replacement is unnecessary.

## Required bounded regression evidence

- Real public consume: valid fixture positive control, then hold D through code expiry without editing the row while blocked. Record transaction start, actual lock wait, DB wall-clock deadline crossing and release. Require exact `410 DESKTOP_AUTH_ATTEMPT_EXPIRED`, no new session/grant/credential audit or revision increment, and no consumed code. A random 4xx/500/timeout is not a pass.
- Real target prepare: live flow and actor, shorter G expiry, hold G across that expiry. Require exact invalid/expired domain rejection and no new target D; separately preserve a fresh positive case. Use production route bindings and the original secret where required, not fabricated provider authorization.
- Pending result/ACK and later A/G waits: no pending continuation from elapsed authority; preserve original committed result/ACK successes. Exercise the actual consumer rather than merely evaluating `SELECT now()` in a test.
- If DB-clock support remains the intended change, test issuance→consume with controlled application-clock offsets in both directions and elapsed flow deadlines. Do not alter system clock or production time.

The two changed repository assertions (`integration.test.ts:1676–1680`, `2597–2601`) only compare a cancellation's already-written expiry with the database clock in a subsequent query. That can be a reasonable revocation assertion, but it exercises neither an in-transaction lock wait nor issuance/consumption clock consistency. No new clock-boundary regression test appears in this delta. r33's 27/27 parent cases and 81/81 suite cannot be treated as execution evidence for r35.
