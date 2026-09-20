# Conversation send, durable queue, streaming, and recovery

Base: `e631705c4ad80b78655588f0414ce0215d7eefdf`.
Ownership: Pi implemented the initial backend, agent, contracts, and migration.
Codex implemented the Web experience and independently reviewed the complete
change, including subsequent privacy, shutdown, and admission-handoff fixes.
The final Pi resume was blocked by another task holding the repository writer
lock; Codex owns the remaining fixes and delivery. Unrelated main-checkout edits
remain untouched.

## Outcome

Sending a Web conversation message shows the user bubble immediately and
releases the composer. Admission is a short durable server transaction; model
execution runs in a bounded backend runner, one run at a time per Session, with
a server-authoritative FIFO queue. The user can edit or withdraw an unclaimed
queued item, stop the active run, retry a failed run explicitly, and continue a
paused queue. Refresh and disconnect never lose an accepted message, resubmit a
run, or clear a newer draft. The legacy synchronous
`/v1/chat/unscoped-tasks` endpoint stays compatible.

## Key decisions

- **Admission is separate from execution.** `POST
  /v1/agent-sessions/:id/conversation-queue` commits one queue row plus a
  monotonic state revision and returns a 202 receipt before any provider call.
- **Cross-process serialization** uses a per-Session advisory lock during claim
  plus a durable `running` row with a lease, heartbeat, and monotonic
  `lease_generation`. Every authoritative write is fenced on the generation, so
  a stale worker cannot publish text, overwrite a result, or append a Session
  turn after another runner recovered the entry.
- **No persisted preview tokens.** Live preview lives in the runner process and
  is broadcast on an in-process bus. A restart truthfully reports an
  interrupted run instead of replaying stale text. The snapshot revision is
  durable and monotonic.
- **Ordered, idempotent completion.** Current source validity, then a live
  claim, then exactly-once lineage/audit, then canonical Session history.
  A failure after provider success preserves the stored result so an explicit
  retry or lease recovery replays persistence without a second model call.
- **Truthful terminal states.** User stop pauses the queue and preserves the
  admitted user turn with an owned partial or a stopped-before-reply state.
  Late callbacks after cancellation are discarded. Revocation, expiry, stale lease, and shutdown never store a
  partial answer. Only an explicit Continue clears a pause; ordinary completion
  never does.
- **Objective is not evidence.** Terminal non-retryable states replace the
  objective with a privacy-safe tombstone (`content_state='scrubbed'`). The
  Lab write guard and manifest classification are added in the same migration.
- **Canonical user timestamp.** The Session user turn keeps the queue row's
  accepted timestamp; only the response records completion time.
- **Lab parity.** The queue runner selects providers through the configured Lab
  trial service and shares the frozen reference clock, so Web does not lose
  experiment arms.
- **Character limit.** The supported server bound of 1000 characters is kept.

## Modules

- `conversationQueueState.ts` — storage, snapshot, claim, lease/fencing.
- `conversationQueueAdmission.ts` — admission and client mutations.
- `conversationQueueCompletion.ts` — governed lineage and canonical write.
- `conversationQueueRunner.ts` — bounded worker, preview, recovery.
- `conversationQueueRoutes.ts` — HTTP routes and narrow non-mutating validation.
- `conversationQueueSweep.ts` — retention and revocation cascade.
- `conversationQueue.ts` — barrel re-export.

## Milestones

1. [x] Agent seam: `onVisibleText`/`onProgress`, incremental
   `VisibleTextFilter`, provider threading, cancellation composition.
2. [x] Additive contracts for admission, snapshot, mutation, and client calls.
3. [x] Backend queue module split, migration `073_conversation_queue`, runner,
   SSE observation, recovery, retention sweeps, App close hook.
4. [x] Route-level non-mutating validation for the mutation union plus a stock
   Fastify `inject` regression across all five mutation kinds.
5. [x] Web outbox/controller, editable queue, streamed transcript, and composer.
6. [x] Desktop browser checks and 360 px queue/continuation acceptance using
   synthetic data. Three rapid admissions survive navigation and preserve a
   newer draft; an additional Stop-during-handoff timing has React coverage.
7. [x] Disposable-database integration suite (18 cases), three SSE regressions and focused agent tests.
8. [x] Concise canonical documentation notes and this plan.

## Verification and release state

See [the evidence record](../docs/evaluations/2026-09-20-conversation-send/implementation-evidence.md)
for exact checks and their boundaries. Backend type checking, the production Web
build, focused client tests, 541 backend unit tests, and 21 queue/SSE tests pass. Independent HTTP proof
covers ten admission, streaming, cancellation, and recovery properties.

The implementation is isolated on its task branch. No resident migration or
production deployment has been performed. Release requires an exact-head CI
result; rollout remains a separate, unperformed operation.

## Open risks

- Live preview is per-process; multi-process deployments show durable state but
  not another process's forming text until it completes.
- The queue path does not use Claude SDK session continuation because that
  requires holding a transaction across model work; canonical conversation
  history is still supplied to the governed agent.
- Preview text is bounded to 12,000 characters. Longer replies finish through
  validated canonical readback; raw preview tokens are not stored for replay.
- The local outbox has a 24-hour maximum lifetime, bounded further by Session
  expiry; admitted messages live under the server's Session retention policy.
- Early browser runs encountered host load around 31, database timeouts, and
  browser-bridge failures. The core desktop and narrow-screen flow passed after
  recovery. No production latency percentile, full accessibility/theme matrix,
  or live external-provider result is claimed.
