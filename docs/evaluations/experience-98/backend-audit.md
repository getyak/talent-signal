# Backend reliability audit — conversation queue, account scope, system health, saved Person/Memory readback

Date: 2026-09-24. Base: `159c640286c14fa3c1d0244db3f318bf9b30422c` (frozen worktree).
Unit: backend modules only (`apps/backend/src/modules/*`, `apps/backend/src/**/*.test.ts`).
`apps/backend/src/routes/` does not exist in this tree; that scope pattern matched nothing.
This report separates confirmed defects from credible risks and missing proof. No scores are
claimed; passing tests are not a quality grade.

## Inspected boundaries

- Conversation queue: `conversationQueue.ts`, `conversationQueueAdmission.ts`,
  `conversationQueueState.ts`, `conversationQueueCompletion.ts`, `conversationQueueRunner.ts`,
  `conversationQueueSweep.ts`, `conversationQueueLive.ts`, `conversationQueueRoutes.ts`
  (admission, edit/withdraw/retry/stop/continue, leases, fencing, SSE stream/reconnect,
  recovery, retention sweep).
- Account scope / session recheck: `auth.ts` (`authGuard`, `currentSession`),
  `accountManagement.ts` (in-transaction `context()` recheck), `agentSessionSources.ts`
  (`assertSessionForChat`, `assertSessionChatSourcesAvailable`), `workspace.ts`, and the
  runner authority path `runnerAuthContext`.
- System health: `systemHealth.ts` (`observeSystemHealth`, `/v1/system/health`),
  `readinessRoutes.ts` (`/health/live`, `/health/ready`), against
  `docs/operations/system-health.md` and `database/pool.ts`.
- Saved Person/Memory readback: `memoryReviewRead.ts`, `memoryReviewRecall.ts`,
  `memoryReviewCommit.ts` (`readMemoryItem`, `readMemoryOperation`, `receiptSourceAvailable`),
  `memoryReviewOperationView.ts`, `memorySourceVerification.ts`, `memoryReviewStore.ts`
  (`resolveSessionSourceAuthority`, `MEMORY_EVIDENCE_AVAILABLE_SQL`), `people.ts`.
- pg 8.23.0 client/pool timeout semantics (dependency source in `node_modules`) were read to
  verify the health-failure bound claim.

## Verified facts (executed in this unit)

- `pnpm install --frozen-lockfile --ignore-scripts` — clean, lockfile untouched.
- `pnpm --filter @talent-signal/backend typecheck` — passes.
- `pnpm --filter @talent-signal/backend test` (vitest) —
  baseline before changes: **80 files passed, 15 skipped; 764 tests passed, 306 skipped**;
  after changes: **80 files passed, 15 skipped; 767 tests passed, 307 skipped, 0 failed**
  (+3 executed unit regressions, +1 DB-gated integration regression).
- Focused run `vitest run src/modules/systemHealth.test.ts src/modules/readinessRoutes.test.ts`
  — 17/17 passed.
- `git diff --check` clean; diff limited to the six files listed under Fixes/tests below.
  Pre-existing GET-49 work on the base is untouched.

## Findings (4)

### F1 — CONFIRMED, fixed: a committed stop that survives its worker can never reach a terminal state and permanently blocks that Session's queue

- Where: `apps/backend/src/modules/conversationQueueState.ts` (`fencePredicate` ~line 330 vs
  `fencePredicateAllowCancel` ~line 339; `finalizeConversationQueueEntry` chooses the
  cancel-rejecting predicate for every status except `cancelled`),
  `apps/backend/src/modules/conversationQueueRunner.ts` `recover()` (pre-fix: called
  `finalizeConversationQueueEntry(status:"interrupted")` and ignored its `applied:false`).
- Reproduction (trace; executable regression below): (1) admit two messages; (2) claim the
  first (`claimNextConversationQueueEntry`); (3) issue a committed `stop` mutation
  (`cancel_requested=true`); (4) the worker dies before settling the stop (crash, or the
  lease-lost race where `recordConversationQueueResult`/`persistConversationQueueCompletion`
  conflate `cancel_requested=true` with a lost lease and return without writing); (5) let the
  lease expire and run `ConversationQueueRunner.recover()`.
  Before the fix: `recover()`'s `interrupted` update matches 0 rows (its fence requires
  `cancel_requested=false`) and the failure is ignored; the row stays `running`, is
  re-reclaimed every recovery cycle forever, and `listRunnableConversationQueueSessions`
  excludes any Session with a `running` entry — the Session queue never runs again and the
  stop never becomes `cancelled`.
- Impact: one unsettled stop bricks conversation processing for that Session until the
  thirty-day sweep deletes the rows; the user's stop decision is lost and later messages pile
  up behind a phantom `running` entry.
- Fix (smallest): `conversationQueueRunner.ts` `recover()` — when the freshly reclaimed fence
  (owner, generation, lease, status all proven current by the reclaim) is blocked only by
  `cancel_requested`, finalize the truthful `cancelled` state via the existing
  cancel-allowing predicate, mirroring the existing `finalizeRetained` stop-race fallback.
- Tests: `conversationQueue.integration.test.ts` — new "settles a stop that survived a crashed
  worker instead of blocking the Session queue" (claim → committed stop → forced lease expiry
  → `recover()` → expects `cancelled`, paused queue, and `continue` resuming the next
  message). **Not executed in this unit** (DB-gated suite; see Unknowns).
- Residual risk (reported, not fixed): the lease-lost/cancel conflation in
  `recordConversationQueueResult` and `replayPersistence` still delays settlement until the
  next recovery cycle after lease expiry (~90 s + 30 s) instead of settling immediately.

### F2 — CONFIRMED, fixed: system-health and readiness failure is not time-bounded at the backend

- Where: `apps/backend/src/modules/systemHealth.ts` `observeSystemHealth` (pre-fix: awaited
  `pool.query` with no deadline), `apps/backend/src/modules/readinessRoutes.ts`
  `/health/ready`; `database/pool.ts` `createPool` sets `statement_timeout`/`query_timeout`
  but no `connectionTimeoutMillis`.
- Evidence: in pg 8.23.0 the connect timeout is armed only when
  `connectionTimeoutMillis > 0` (`lib/client.js` ~167), and `query_timeout` is armed when the
  query is submitted to a connection (`lib/client.js` ~702). Pool queue wait and connection
  establishment are therefore unbounded: a black-holed PostgreSQL host or a saturated pool
  (max 12) can leave `/v1/system/health` and `/health/ready` pending forever. The bound in
  `docs/operations/system-health.md` ("settles after four seconds") exists only at the Web
  proxy layer; any direct backend consumer loses bounded failure.
- Impact: monitoring and readiness probes cannot observe a dependency outage; a hung health
  request is indistinguishable from a healthy slow one.
- Fix (smallest): one shared 4-second observation budget (`SYSTEM_HEALTH_OBSERVATION_TIMEOUT_MS`,
  matching the documented Web bound) applied across both health queries and the readiness
  query; a timeout degrades to the existing `unavailable`/503 paths. Response contracts and
  query shapes unchanged.
- Tests (executed, passing): `systemHealth.test.ts` — "settles a hanging database observation
  within one bounded deadline", "settles a hanging migration observation without claiming
  schema health"; `readinessRoutes.test.ts` — "settles a hanging readiness probe with 503
  within its observation budget".

### F3 — CREDIBLE RISK (code-trace confirmed, no fix): saved-Memory item readback ignores staleness that every other read path fails closed on

- Where: `apps/backend/src/modules/memoryReviewCommit.ts:1279-1292` (`readMemoryItem` filters
  `status <> 'deleted'` and serializes with `evidence_retained: evidence.length > 0` from
  `status='active'` rows only), versus `memoryReviewRecall.ts` recall (requires
  `status='active'` plus `MEMORY_EVIDENCE_AVAILABLE_SQL` for every evidence row) and
  `readMemoryOperation`/`readMemoryScopedOperationView` (explicit `source_revoked` state).
  `MemoryRecallItemSchema` carries no status field, so an `invalidated` (source revoked) or
  `superseded` item is indistinguishable from a current one in this serialization.
- Reproduction (needs DB): commit a memory → invalidate it via the real capture/session
  deletion cascade (`invalidateMemoriesForCaptureIds`) → `readMemoryItem` still returns the
  item with full `display_text` and `evidence_retained:false`, while `recallMemories` hides it.
- Impact today is narrow: `GET /v1/memory/items/:itemId/scope` exposes only scope fields and
  `mutateMemoryItem` refuses non-active rows before this readback matters. Risk is a future or
  direct consumer presenting revoked-source text as current.
- Recommended follow-up (not applied — behavior change needs DB-backed verification):
  align `readMemoryItem` with recall availability semantics or add an explicit status field
  to the contract; regression belongs in `memoryReview.integration.test.ts`.

### F4 — CREDIBLE RISK (no fix): stop event publishes before its transaction commits, and the cancelled fallback ignores `STOP_SUPERSEDED`

- Where: `apps/backend/src/modules/conversationQueueAdmission.ts` `applyMutation` `stop` branch
  (`queueMicrotask(() => publishConversationQueueStop(...))` inside the open transaction);
  `conversationQueueCompletion.ts` `persistConversationQueueCancellation` throws
  `CONVERSATION_QUEUE_STOP_SUPERSEDED` when the flag vanished, but
  `conversationQueueRunner.ts` `finalizeCancelled` logs that error and still finalizes
  `cancelled` (the cancel-allowing fence succeeds without the flag).
- Reproduction (needs concurrency): the mutation transaction publishes `stop`, then rolls
  back (e.g. `readConversationQueueSnapshot` throws 410 on a concurrent source revocation).
  The runner observes the abort, `persistConversationQueueCancellation` reports the stop as
  superseded, and the run is nevertheless cancelled and its answer discarded.
- Impact: a stop that never landed can still cancel a run and drop generated text;
  truthful-state guarantee ("if a stop or refusal won the race the caller must finalize the
  truthful state") is weakened in a narrow rollback window.
- Recommended follow-up: publish `publishConversationQueueStop` after commit (like
  `publishConversationQueueChanged`) and make `finalizeCancelled` return early on
  `STOP_SUPERSEDED`. Not applied (racy path, needs DB-backed concurrency test).

## Unknowns / not verified in this unit

- **307 DB-gated tests were skipped** (306 pre-existing + the 1 new integration regression):
  the suite requires `CONTACT_AGENT_TEST_DATABASE_URL`, and this unit was instructed not to
  start databases/Docker/services; the host has no local PostgreSQL binaries. The
  conversation-queue, memory-review, agent-session and screenshot-contact integration suites —
  including the new F1 regression — are **written but not executed**. F1's SQL-fencing logic
  and the fix were verified by code trace against `conversationQueueState.ts`, not by a live
  PostgreSQL run.
- The pg connect/queue hang behind F2 is traced in pg 8.23.0 source but not reproduced
  against a live black-holed socket.
- Whether the backend's `/v1/system/health` is consumed directly (bypassing the bounded Web
  proxy) by iOS or tooling was not verified (UI/native surfaces are parent-owned this unit).
- `REQUIRED_SYSTEM_MIGRATIONS` in `systemHealth.ts` omits `080_memory_pursuit_association`
  and `081_meeting_image_evidence`; readiness therefore does not gate them. Intent unknown;
  left unchanged.
- `runnerAuthContext`'s comment claims membership "is rechecked at claim and commit"; a
  commit-time recheck inside `persistConversationQueueCompletion` was not found (claim-time
  and recovery-time rechecks exist). The revocation window is small and the intended policy
  (whether a revoked member's queued answer may land in their own Session) needs an owner
  decision; left unchanged.
- `apps/backend/AGENTS.md` requests a TestFlight-local redeploy after backend changes; this
  was deliberately not run (no deployments/services in this unit). Deferred to the parent.
- Parent-reported Web defect (AgentCreatePersonCard omits `captured_at`, "Invalid time
  value") is out of this unit's scope: not investigated, not touched.

## Fixes/tests delivered (diff inventory)

- `apps/backend/src/modules/systemHealth.ts` — bounded observation budget (F2).
- `apps/backend/src/modules/readinessRoutes.ts` — bounded readiness failure (F2).
- `apps/backend/src/modules/conversationQueueRunner.ts` — recovery settles an unsettled stop (F1).
- `apps/backend/src/modules/systemHealth.test.ts`, `readinessRoutes.test.ts` — 3 executed
  regressions (F2).
- `apps/backend/src/modules/conversationQueue.integration.test.ts` — 1 DB-gated regression
  (F1, not executed this unit).

Exact verification: `pnpm install --frozen-lockfile --ignore-scripts`;
`pnpm --filter @talent-signal/backend typecheck`;
`pnpm --filter @talent-signal/backend test` (767 passed | 307 skipped | 0 failed);
`pnpm --filter @talent-signal/backend exec vitest run src/modules/systemHealth.test.ts src/modules/readinessRoutes.test.ts` (17 passed);
`git diff --check` clean.
