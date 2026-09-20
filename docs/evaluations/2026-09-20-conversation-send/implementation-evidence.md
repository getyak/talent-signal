# Conversation send, queue, streaming, and recovery — implementation evidence

Date: 2026-09-21. Owners: Pi initial backend implementation; Codex Web,
independent review, fixes, and verification. Baseline: `e631705c`.

## Delivered behavior

A local durable outbox renders the message immediately and releases the input.
The backend commits admission before model execution. One run per Session
consumes the durable FIFO queue; queued messages can be edited or withdrawn.
A separate Stop command pauses later work; retry and continuation are explicit.
Actual provider text appears through SSE before canonical completion. Forming
text never carries live citations, action cards, or execution authority.

A new draft survives completion, page navigation, and unknown delivery. A lost
receipt keeps its immutable message and idempotency keys; reconnect observes
state without starting a model call. Server revisions arbitrate edits, and a
lease generation fences stale workers and previews. Source withdrawal, account
changes, expiry, and deletion fence observation and remove owned derived data.

## Test environment

Disposable PostgreSQL with standard migration `073_conversation_queue`,
loopback-only backend and Web processes, synthetic accounts and a deterministic
provider. No resident database, real candidate conversations, paid provider calls,
or iOS Simulator was used. The production Web build uses a synthetic build-only
auth secret; it is not a release deployment.

## Automated evidence

- Web suite: 890 tests passed, one skipped. The final focused run passes 23 tests
  across delivery, BFF, and controller tests, including three rapid admissions
  before navigation, Stop settling alongside admission, and safe removal of
  definitive rejections. The latter two regressions were added after the
  full-suite run.
- Backend unit suite: 541 tests passed, 196 skipped without the integration
  database. Queue and SSE checks below ran separately with a disposable database.
- Backend queue integration: 18 tests passed on the disposable database,
  including the later stop-before-first-token and unavailable-provider fixes.
- SSE transport/security: three tests passed, including revoked login/source
  denial and shutdown of an open connection before Fastify waits for clients.
- Agent: delegated suite reported 276 passed and one skipped, with visible-text
  filtering, provider callbacks, cancellation, and harness coverage.
- Backend TypeScript, contracts build, Web lint, and final production Web build
  pass. The initial build without `AUTH_SECRET` failed during page collection;
  the final build supplies a synthetic value and rebuilds dependencies first.
- Documentation, wiki, architecture boundaries, and architecture diagram checks
  pass (`pnpm docs:check`).

The backend cases cover idempotent admission and changed-input conflicts, FIFO,
edit/claim and stop/completion races, paused failures and explicit retry,
result-persistence replay without another provider invocation, expired-lease
fencing, ownership and retention, source revocation, and route validation of all
mutation kinds. Shutdown additionally leaves an interrupted entry, retains the
next queued item, and does not save preview text as a stopped answer. User Stop
before the first token preserves the admitted user turn; an uncooperative
provider's later callbacks and final result do not become a reply.

## Independent HTTP proof

[Machine-readable result](http-acceptance-result.json): ten checks passed through
real API routes, transactions, SSE, and canonical Session readback. The scripted
provider emits genuine delayed callbacks. Checks include disconnect without
cancellation or duplicate execution, queued editing/withdrawal, explicit stop,
paused reads that never auto-start work, and exactly-once continuation of the
edited message.

One loaded-host sample measured admission at 1,423 ms and first visible text at
3,892 ms. These are synthetic single-run observations, not production targets,
model benchmarks, or percentiles. Final shutdown, navigation-handoff, and
stop-before-first-token fixes have dedicated regression coverage after that HTTP run.

## Browser observations

The actual authenticated UI was tested with the production Web build, real BFF
routes, and the synthetic backend. Local echo appeared before the admission
receipt, and the composer immediately accepted a newer draft. The repeated
home-to-Session check completed all three submitted messages without a lost
receipt, duplicate, or erased newer draft after the admission-handoff fix.

A subsequent Session run verified Stop retaining a paused queue, independent
queue editing, another submission while paused, withdrawal of that new entry,
and explicit continuation of the remaining edited message. Canonical rendered
history then contained the edited objective, the withdrawn entry was absent,
and the unsent draft still read "保留这份新草稿". The 360 × 800 paused state kept
queue controls and input above the mobile navigation; Continue completed on
that viewport. Transcript scrolling remained independent of the input.

- [360 px paused queue](mobile-paused.png)
- [Desktop completion with preserved draft](desktop-completed.png)

An earlier test run encountered host load around 31, database timeouts, and
browser-bridge failures; after recovery the above UI sequence passed. These
interruptions are not provider performance measurements. The final small guard
that defers navigation while Stop is in flight has a dedicated React regression;
that exact overlapping timing was not repeated in the browser. A full
text-size/theme matrix and real external-provider performance are outside this
local proof. No production rollout is implied.

## Review corrections

- Mutation validation no longer lets Ajv union processing strip another
  variant's fields (notably Stop's run identity).
- A mutation's request hash is SHA-256, not retained JSON containing message text.
- Live previews recheck login/source authority and the current lease generation,
  coalesce updates, cap observer buffering, and clear on termination.
- Revocation removes running queue payloads too; terminal outcomes preserve
  pause, and failed/interrupted entries can be explicitly removed.
- Fastify pre-close stops runners and open SSE connections. Shutdown also waits
  for in-flight claims so no new provider call begins after close.
- Concurrent admission may rebase Stop only if the same run still owns the
  active slot; other conflicts remain visible.
- Definitively rejected deliveries can be removed without erasing the new draft;
  unknown receipts require reconciliation, and queue capacity includes the active run.
- Queue migration `073_conversation_queue` is a readiness requirement. Missing
  provider configuration creates an actionable failed item and pauses the queue.
- Route-boundary tests explicitly disable background workers so their original
  database-call assertions stay meaningful; worker execution has real-database coverage.
- Stop before visible output preserves the user turn. Preview checks distinguish
  a user cancellation from lease loss, and late provider callbacks are ignored.

## Limits

Preview fan-out remains per-process; durable queue state works across workers,
but a different process cannot replay forming text. Long previews stop at the
12,000-character display bound until final readback. Queue execution supplies
canonical history without Claude SDK continuation. Current-run steering is a
separate future capability; this queue means the next turn, never silent input
injection into the current turn. Relationship/identity-review Sessions and
pre-upgrade pending intents retain their existing guarded paths.

No merge, resident migration, or production rollout is claimed by this record.
