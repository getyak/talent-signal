# GET-5 canonical Agent Sessions

## Outcome and boundary

Provide an account- and user-scoped cross-device Session store with stable Session/message/task/proposal identities, optimistic concurrency, same-intent retry, explicit deletion, and bounded retention. Saved display is always stale and unconfirmed; no Session field grants evidence or execution authority.

## Approach

A typed per-Session payload is bounded at 240 KiB and 200 turns. `GET /v1/agent-sessions` paginates 50 rows by stable UUID; `GET`, `PUT`, and `DELETE /v1/agent-sessions/:id` use revision readback. Mutations require an operation UUID plus expected revision. Deletion retains an empty ID tombstone; operation receipts retain hashes and revisions, never transcript copies. Original Session retention is thirty days; proposal drafts have a seven-day limit. Backend source lifecycle triggers physically remove dependent saved answer blocks and proposal drafts, with use-time checks covering elapsed deadlines.

## Milestones

1. Implement typed contracts, migration, owner-scoped routes, and bounded canonical history loader — implemented; backend typecheck passes.
2. Verify real PostgreSQL behavior for account isolation, CAS races, retries, deletion, expiry, source invalidation, recovery, screenshot follow-ups, and Session-bound replies — forty-two integration cases cover PostgreSQL 18 through `056_agent_session_chat_lifecycle`.
3. Coordinate iOS integration and independent review — DTO and history helper integrated with their owners; root owns the independent final review, integrated iOS proof, and authorized local TestFlight deployment.

## Evidence and current state

- Shared DTO: `packages/contracts/src/agentSessionSchemas.ts`.
- Persistence: `apps/backend/src/modules/agentSessions.ts` and migration `051_agent_sessions.sql`.
- Route registration: `agentSessionRoutes.ts` and `app.ts`.
- Existing turn identity/order and established relationship scope cannot silently change; fork provenance is immutable.
- Scoped conversation history checks canonical manifests and reads canonical task response bodies. Client saved blocks are display only.
- Root owns the final canonical documentation changes and backend deployment. No deployment has been performed by this worker.

## Completion proof required

Completed checks:

- The preceding 055 verification passed 121/121 tests. Final 056 verification passes 128/128 tests across the same seven files, including forty-one Session cases and thirty-four provider cases, against the freshly migrated and seeded `session_proof_lifecycle_final` database. Exact final results and commands are retained in `/tmp/get5-session-056-proof/`.
- Final `pnpm --filter @talent-signal/backend typecheck`: pass.
- `pnpm docs:check`: final rerun passes after root trimmed the concurrent canonical documentation updates.
- `git diff --check`: pass.

The isolated Docker container `ts-get5-session-proof-20260907` is a synthetic verification artifact, bound only to loopback port 55607. Its final fresh database is `session_proof_lifecycle_final`; `session_proof_sources_final` and `session_proof_review` preserve preceding fixtures. They contain generated test accounts and synthetic text only, remain available for root/reviewer readback, and should be removed after integrated review. None is the TestFlight database.

## Self-review corrections

- Added a metadata-only retracted-task ledger so source text correction, revocation, deletion, or an expired authority cycle cannot regain prior derived text after restoration or stale re-upload.
- Ordinary snapshot supersession preserves readable historical text when its exact source remains authorized and intact. Every read still declares `stale_unconfirmed`; this grants no citation or effect authority.
- Screenshot transcript turns require owned canonical screenshot task references. Source/task invalidation removes their saved display. Subsequent screenshot follow-ups use the separately checked canonical interpretation path described below.
- Composer text and proposals expire independently at seven days. Pending operation identity remains recoverable within the Session boundary.
- Screenshot admission recovery stores only the stable idempotency key, SHA-256 request identity, and original capture timestamp. Partial tuples and attempts to alter an unresolved admission are rejected; no image content enters the Session payload.
- Deleting a Session resolves screenshot tasks by its owner-scoped pending admission key even before the task receipt arrives. It retires unreferenced task state, fences leases, and queues raw-image purge; a retained SHA-256 key digest blocks a late admission after deletion. A task still referenced by another active Session remains available until its last Session is deleted. Filed domain source records keep their own lifecycle.
- Both admission/deletion orderings, a simultaneous race, and shared-task references pass real PostgreSQL regressions. The related screenshot/task/route regression set passes 34/34 tests.
- Backend readiness now requires migration `056_agent_session_chat_lifecycle`; Session request payloads are included in logger redaction.

## Independent review corrections

- Canonical manifests and task operation scope determine conversation authority. A client sentinel cannot disguise a scoped task or import revoked scoped responses into an unbound Session.
- Revoked source-linked proposals are removed even when the related turn has no saved display blocks. Retraction identity prevents stale re-upload.
- Composer content receives a server-bounded start clock and account/Session-bound digest before display redaction, including first uploads that are already expired. Identical offline content cannot reset that clock; newly edited content receives its own clock.
- Storage preflight measures PostgreSQL's actual `jsonb::text` byte length and rejects expansion beyond 256 KiB as a controlled 400 before mutation receipts or payloads are stored. Database check violations never expose rejected private rows.
- The final write compares revision and deletion state atomically. Source rows are locked before validation; `NOWAIT`, a 100 ms transaction lock timeout, and bounded rollback/retry prevent reversed source lock ordering from making revocation the deadlock victim. Real two-connection tests cover both write-first and source-first orderings, including screenshot task/source locks.
- Declared UUID identifiers and operation UUIDs normalize case. Opaque non-UUID task references retain their original case. SQL source and deletion checks use the same UUID comparison behavior.
- Original `createdAt` fixes first-upload retention and cannot move after establishment. Local fork lineage can preserve unknown unsynced origin IDs without granting scope, history, or execution authority; known deleted, expired, and foreign origins remain unavailable.
- Inherited screenshot references are a unique retained subset and cannot be removed to promote copied tasks to live tasks. Legacy initialization must cover every previously retained screenshot reference.

Root's independent reviewer owns re-running the final frozen review. Earlier reports remain preserved as historical evidence; this plan records the corrected implementation rather than rewriting those reports.

## Screenshot follow-up continuity

- The canonical Session history loader keeps the original user objective and reads only limited screenshot Agent summary, findings, question, and limitations from an owned, active task. Task/message/capture/resource references remain visible. It never reads client saved blocks, raw image bytes, complete OCR, or public page bodies into ordinary follow-up dialogue. The existing six-turn/twelve-message/twelve-thousand-character ceiling still applies.
- Screenshot interpretation is labeled unconfirmed and supplies no reviewed evidence, contact lookup authority, proposal approval, or external-write permission. Copied fork references remain read-only.
- `agent_session_chat_sources` stores exact screenshot root IDs and canonical content digests for every derived chat task, flattening inherited dependencies across subsequent replies. A source change, correction, deletion, revoked authorization, or deadline invalidates its descendants. Lifecycle cleanup physically strips canonical idempotency response bodies and persisted display; retry/readback also check current source availability.
- A final short `NOWAIT` fence and digest recheck happens after generation and before persistence. If the source is withdrawn during generation, the response and operation receipt roll back. The PostgreSQL regression pauses this exact interval and confirms no generated response is stored.
- A newly bound screenshot can answer a conversational follow-up without inventing a reviewed citation. Only the internal canonical-source admission enables citation-free relationship answers; response blocks explicitly say the screenshot interpretation is unconfirmed. Proposed or unattributed screenshot fragments are excluded from the separate provider evidence input and manifest. Missing canonical summary or unavailable source does not activate this exception.
- New PostgreSQL cases prove unbound context, bound context with an older Wiki, the first bound question with proposed OCR, canonical summary versus tampered client content, no image/full-OCR exposure, fork dependency propagation, physical replay-body deletion, unavailable/foreign scope, and generation-to-save withdrawal. Provider transport tests verify that client dialogue text alone cannot enable the citation exception.

No production write, deployment, commit, or external message was performed by this worker. Root remains the owner of deployment and final validation.

## Final product-panel corrections

- Normal PostgreSQL tests reproduced two defects before correction: a mixed reviewed citation caused an unconfirmed screenshot answer to retain informational status, and deleting a plain-text Session still allowed its original request to replay the full canonical reply. The corrected mixed answer retains its real citations while always labeling the screenshot interpretation proposed and unconfirmed.
- Migration 056 adds only metadata for canonical chat tasks explicitly bound to Sessions. It records the creator, originating Session, and fixed expiry; existing GET-5 tasks are backfilled from server audit references. Prior reply dependencies inherit the earliest deadline, including backfilled follow-ups. Legacy chat requests without `session_id` retain their existing policy.
- Original request retries recheck the originating Session before and after claiming the receipt. A short non-waiting read fence protects the final replay boundary. Generation revalidates and fences the Session immediately before saving, so deletion during model execution rolls back both the reply and its operation record.
- Session deletion and use-time expiry cleanup physically remove unavailable canonical reply bodies. An active same-owner fork can retain a shared reply until its original fixed deadline; its follow-ups inherit that deadline and gain no external effects. Removing the final reference or reaching that deadline removes saved display and replay bodies.
- Real PostgreSQL regressions cover scoped and unscoped deletion, unchanged legacy tasks, expiry, fork sharing, inherited fixed deadlines, deletion between replay checks, and deletion after generation but before persistence. Provider HTTP tests confirm that screenshot context adds an explicit system restriction against invented participants, agreement, dates or time zones, and against requesting the same screenshot by default; actual prompt revisions match the transmitted text. Ordinary managed prompts remain unchanged.
- Canonical architectural ownership remains [Architecture](../docs/architecture.md); this plan retains implementation and verification details only. Root owns the final review, native proof, and TestFlight deployment.
- The subsequent live-provider fixture exposed a transaction clock mismatch: metadata `created_at` used PostgreSQL transaction time while its expiry candidate used application time. A normal Chat API regression with a synthetic application clock thirty seconds ahead reproduced `23514`. The insert now clamps expiry with the same database transaction clock; it can only shorten retention and does not change migration 056. The targeted final rerun passes 87/87 across four affected files, including all forty-two PostgreSQL Session cases; typecheck passes. The original failure and corrected run remain in `clock-before.log` and `clock-after.log` under the proof directory. Screenshot-only system guidance now also forbids invented concrete dates in examples and uses date/time-zone placeholders instead.
