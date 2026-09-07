# GET-5 Session backend code review — frozen v1

- Date: 2026-09-07
- Reviewer: `evidence-safety-reviewer`
- Lens: correctness, evidence integrity, privacy lifecycle, concurrency, and recovery
- Verdict: **fail** for frozen v1; three P1 and two P2 findings require changes.
- Score: `1` for the consequential privacy boundary; this is not an average of other dimensions.
- Confidence: `direct` for four findings and the successful fixture checks; `supported_inference` for the concurrency schedule in F3.
- Artifact: `/tmp/get5-session-review-v1`; every file matched `manifest.json` SHA-256 before verification. Relevant current Session/schema/migration files also matched at that point. Later working-tree fixes are outside this verdict.
- Ownership: review only. No implementation, deployment, Xcode, external effects, or real candidate data was used.

The highest-impact failures are canonical scoped answer retrieval through a forged unbound marker, source-linked draft retention after revocation, and an unconditional final write that can overwrite a lifecycle revision. Positive evidence covers owner isolation, tombstone replay, receipt failure rollback, ordinary source correction, shared screenshot retirement, and rejection of executable saved blocks.

## Method and exact proof boundary

Read the project entry routing, Architecture, Agent System, ADR 0014, REVIEW.md, backend instructions, and the evidence-safety skill references. Inspected the frozen implementation, contracts, routes, migrations 051/052, screenshot admission change, and integration tests. Traced unchanged transaction, canonical idempotency, source lifecycle, and image purge dependencies. Caller inspection included `chat.ts:823` and `unscopedChat.ts:94`: returned history reaches the provider as conversational context.

Independent executable checks used `/tmp/get5-session-code-proof/proof.ts`, containing only generated synthetic fixtures and no credentials. It runs the frozen `agentSessions.ts` with import paths redirected to repository dependencies. The existing isolated `session_proof_review` database was used with parent approval. Each run uses one outer transaction and nested savepoints, and finishes with `ROLLBACK`; no reviewer fixture survives. The original 18 integration tests and 34 reported focused passes were inspected as supporting evidence, not treated as an independent rerun.

Reproduce from the repository root with the existing local synthetic environment:

```sh
source /tmp/get5-session-proof.env
apps/backend/node_modules/.bin/tsx /tmp/get5-session-code-proof/proof.ts
```

This command depends on the temporary v1 proof artifacts and the local synthetic DB. The script must continue pointing at frozen v1 when reproducing these observations.

## Findings

### F1 — P1: Classify history by canonical task provenance, not the client marker

- Classification: **confirmed defect**.
- Exact copied locators: `/tmp/get5-session-review-v1/apps/backend/src/modules/agentSessions.ts:295`, `:514`, `:530`, and `:549`.
- Observation: payload validation skips manifest verification for any non-UUID `contextManifestID`. History reads likewise skip availability checks for that marker, but then load an owner-scoped canonical answer solely by `taskID` from both scoped and unscoped operation scopes. The canonical response's manifest and the operation's scope are not used to validate the turn.
- Reproduction: create a relationship task and canonical scoped answer, revoke its source, then save a new unresolved Session whose turn references that task ID with `contextManifestID="none-unbound-conversation"`. Read it with null person/context scope.
- Actual result: save succeeds at revision 1 and the history includes `SYNTHETIC_SCOPED_CANONICAL_ANSWER` even though that source is revoked. This is canonical text retrieval, not merely redisplay of client-supplied text.
- User impact: a saved marker can move restricted relationship content into unbound model context and bypass source revocation. The normal provider caller consumes the resulting messages.
- Recommendation: resolve canonical task kind, ownership, manifest, person/context, and current availability independently of client strings; reject mismatched turn provenance on sync and fail closed again on history reads. Apply equivalent canonical classification to redaction.
- Verification: both an active scoped task transplanted into an unbound/different-scope Session and a revoked task with a non-UUID marker must be rejected or omitted. Legitimate unscoped history must still use canonical assistant text.

### F2 — P1: Remove source-linked drafts even when there is no saved answer block

- Classification: **confirmed defect**.
- Exact copied locators: `/tmp/get5-session-review-v1/apps/backend/src/database/051_agent_sessions.sql:107` and `:115`.
- Observation: an unavailable turn sets `changed=true` only when one of three block arrays exists. `contactProposal` is removed only when that flag is true. Source provenance on the proposal itself does not drive invalidation.
- Reproduction: save a correctly scoped turn without any saved block arrays and a proposal whose `sourceMessageID` references that turn, including a synthetic `sourceText` and field excerpt. Revoke its source and GET the Session.
- Actual result: `proposalRetained=true` and `sourceTextRetained=true`; the GET sweep does not repair it. The same shape permits a proposal to be reintroduced after block redaction by omitting the arrays.
- User impact: revoked source-derived contact data remains in the canonical sync store and in cross-device responses for up to its draft retention period.
- Recommendation: derive draft invalidation from its source-message/task dependency independently of whether another field was removed. Clear media and other source-derived fields on unavailable turns without making their deletion conditional on a block array.
- Verification: exercise omitted arrays, empty arrays, previously redacted turns, and offline re-upload of a proposal after revocation. Confirm physical JSON removal and no revival after source restoration.

### F3 — P1: Make the final Session update atomic against lifecycle writers

- Classification: **confirmed code defect; concurrent schedule is a supported inference**.
- Exact copied locators: `/tmp/get5-session-review-v1/apps/backend/src/modules/agentSessions.ts:364`, `:369`, `:396`, `:443`; `/tmp/get5-session-review-v1/apps/backend/src/database/051_agent_sessions.sql:148`.
- Observation: the owner advisory lock serializes Session mutations and screenshot admission, but source invalidation and retention sweeps do not take it. The existing row is read without a row lock; the expected revision is checked before validation/sanitization; final `ON CONFLICT DO UPDATE` has no owner/revision/deletion predicate.
- Reproduction schedule: writer A reads revision 1 and sanitizes its replacement; source writer B revokes evidence, redacts the Session, and advances it to revision 2; A performs its unconditional upsert using the already-computed payload.
- Executable evidence: a query hook applied the real revocation SQL after sanitization and before the final upsert within the synthetic transaction. The request with `expected_revision=1` succeeded with `resultRevision=3` and `revokedBlocksReturned=true`. This verifies the statement-level failure, but is **not** a separately scheduled two-connection test.
- User impact: an in-flight save can overwrite a canonical retraction and return revoked display content as a successful save. A later sweep can remove it again, but that does not repair the violating response or the lost compare-and-swap guarantee. Expiry tombstones use the same unprotected writer pattern.
- Recommendation: use an actual atomic compare-and-swap at the final write, with owner and live-state conditions, or a compatible row-lock protocol covering lifecycle writers. On lost authority/revision, return the current canonical state instead of writing a previously sanitized payload. Avoid introducing an inverted source-row/Session-row lock order.
- Verification: a deterministic two-connection barrier test should pause A after read/sanitization, commit revocation or expiry in B, and resume A. A must conflict or return the redacted/tombstoned current state, never reintroduce content. Also retain same-owner parallel mutation coverage.

### F4 — P2: Enforce the composer draft's seven-day clock

- Classification: **confirmed defect**.
- Exact copied locators: `/tmp/get5-session-review-v1/apps/backend/src/modules/agentSessions.ts:144`; `/tmp/get5-session-review-v1/packages/contracts/src/agentSessionSchemas.ts:239`; `/tmp/get5-session-review-v1/apps/backend/src/database/051_agent_sessions.sql:121`.
- Observation: timestamp checks cover Session/turn dates and proposal dates, but omit `composerDraftUpdatedAt`. The SQL expiry function trusts that client timestamp.
- Reproduction: save a normal current Session with `composerDraft="SYNTHETIC_DRAFT"` and `composerDraftUpdatedAt="2099-01-01T00:00:00.000Z"`.
- Actual result: the draft and future timestamp are accepted and survive the save sweep. The draft can consequently remain until the 30-day Session limit instead of its seven-day limit. An unchanged draft can also advance its client clock unless preservation is enforced.
- User impact: synced private draft retention exceeds the documented control, including under a faulty device clock or stale merge.
- Recommendation: validate and bind draft retention to an admissible original timestamp; preserve its existing clock when the text is unchanged. Clamp or reject future values rather than trusting them.
- Verification: reject future timestamps; show that an unchanged-text refresh cannot extend the deadline; expire an old draft while retaining a current conversation.

### F5 — P2: Align accepted request bytes with the database representation

- Classification: **confirmed defect**.
- Exact copied locators: `/tmp/get5-session-review-v1/apps/backend/src/modules/agentSessions.ts:360`; `/tmp/get5-session-review-v1/apps/backend/src/database/051_agent_sessions.sql:15`; error mapping at `/tmp/get5-session-review-v1/apps/backend/src/app.ts:606`.
- Observation: the service bounds compact request JSON at 240 KiB, while the database bounds whitespace-expanded `payload::jsonb::text` at 262,144 bytes. Many short typed fields can exceed the latter while passing the former.
- Reproduction: generate at most 200 turns with bounded, short display blocks, then remove blocks until compact request bytes fit the service cap. No field or array exceeds the schema limit.
- Actual result: `jsonBytes=245479`, `jsonbBytes=263082`; creation fails with PostgreSQL `23514`, constraint `agent_sessions_payload_check`. The application error handler maps that unhandled error to HTTP 500.
- User impact: a schema-valid Session near the advertised cap cannot sync and receives an internal-error response; retrying the same content cannot recover.
- Recommendation: validate the exact persisted representation or use compatible bounds, and translate an over-limit request into an explicit bounded validation response. Keep rollback and same-key retry semantics intact.
- Verification: cover the compact-JSON/jsonb expansion boundary, verify a 4xx response without sensitive SQL diagnostics in the response, and confirm no Session or operation receipt is committed on rejection.

## Concrete checks and evidence

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Frozen artifact identity | Pass | All manifest SHA-256 values matched; relevant current implementation matched when proof began. |
| Owner scope on GET and PUT | Pass | Independent PG fixture: second user in the same account received `AGENT_SESSION_NOT_FOUND` for both paths. Account predicates also present in row and operation lookups. |
| Old PUT replay after tombstone | Pass | Independent PG fixture: original PUT key returned the current null-payload tombstone, not old content. |
| Receipt insertion failure | Pass | Injected failure after Session write produced zero Session rows and zero receipts; same key retried successfully at revision 1. Uses actual transaction/savepoint rollback. |
| Ordinary source correction and restoration | Pass | Independent PG fixture changed source text and restored it; saved blocks stayed absent and governed history stayed empty. |
| Canonical-history scope and revocation | Fail | F1: actual canonical scoped text entered unbound history through a non-UUID client marker. |
| Source-linked proposal without blocks | Fail | F2: actual source text and proposal survived revocation plus GET sweep. |
| Lifecycle update interleaving | Fail / schedule inferred | F3: actual invalidation SQL between sanitizer and upsert was overwritten; separate-connection orchestration remains required. |
| Composer retention clock | Fail | F4: year-2099 timestamp was accepted. |
| Payload size expansion | Fail | F5: below-service-limit request caused PostgreSQL `23514`. |
| Shared screenshot references | Pass | Independent PG fixture: first Session deletion kept task `running`; final reference deletion changed task to `deleted` and image row to `purge_pending`. |
| Screenshot admission deletion fence | Inspected, not rerun | Frozen integration test lines 647–861 exercises unknown receipt, deletion-before-admission, concurrent admission/delete, and shared reference replay. The shared owner lock and digest-only tombstone match the intended design. |
| Executable saved block rejection | Pass | Independent service check rejected `requires_user_decision=true` with `AGENT_SESSION_INVALID`. Schema also forbids live citations and non-null action targets. |
| Same-owner competing mutations | Inspected, not rerun | Frozen test lines 243–264 asserts exactly one concurrent winner and a revision conflict. This does not cover lifecycle writers in F3. |
| History bounds | Inspected | Six turns, 2,000 characters per message, and 12,000 total are bounded in the frozen reader. Canonical assistant selection is owner-filtered. F1 concerns classification and source scope, not the owner predicate. |
| Pagination and no-store HTTP surface | Inspected, not rerun | Frozen tests lines 919–983 and route schemas cover tombstone pagination, authenticated readback, and no-store responses. |

## Strengths, missing proof, and release boundary

Strengths: digest-only idempotency receipts avoid retaining deleted payload copies; Session tombstones stop ordinary stale restores; canonical source retraction has a durable ledger; screenshot task deletion queues image purge while respecting live Session references; ordinary failed mutations roll back cleanly; saved blocks carry no executable targets or live citations.

Vetoes: F1 exposes source content to a scope where it is no longer authorized; F2 retains source-derived content contrary to revocation; F3 can restore retracted display content during a lifecycle race. These cannot be averaged away by other passing controls.

Missing proof: real-surface cross-device convergence after fixes; a deterministic two-connection lifecycle race test; object-storage purge completion beyond the durable queue; workload-level cost of account-wide per-row invalidation and periodic sweeps; full revised-route error behavior for the JSON size boundary. These are stated limits, not additional invented defects.

Open questions: none requiring user input for these implementation fixes. Root owns remediation, a new frozen artifact, retest, and final release judgment.
