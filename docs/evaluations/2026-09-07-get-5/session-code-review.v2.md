# GET-5 Session backend code review — frozen v2 retest

- Date: 2026-09-07
- Reviewer: `evidence-safety-reviewer`
- Lens: correctness, evidence authority, retention, concurrency, and validation compatibility
- Artifact: `/tmp/get5-session-review-v2`; all `manifest.json` SHA-256 values matched before execution. Later working-tree fixes are excluded.
- Verdict: **fail** for frozen v2. Four original defects are resolved; F4 has a confirmed residual retention path. Two additional P2 defects are recorded below.
- Score: `2` for the consequential lifecycle boundary; no aggregate score overrides the remaining retention veto.
- Confidence: `direct` for executable observations; the writer-first concurrency regression tests were additionally inspected, not independently rerun as a full suite.
- Previous review: [frozen v1](session-code-review.v1.md), preserved unchanged.

No implementation was modified. No Xcode, deployment, external action, or real candidate content was used. Parent approved the isolated synthetic database. Independent new fixtures were enclosed in an outer transaction with nested savepoints and rolled back. For the inverse-lock test, the backend owner confirmed that `session_proof_review` contains only synthetic fixtures and authorized selecting an existing active screenshot/capture pair; both connections rolled back all changes. No fixture identifiers, source text, or credentials were printed.

## F1–F5 disposition

| Original finding | Disposition in v2 | Exact proof |
| --- | --- | --- |
| F1: client marker bypasses canonical history scope | **Resolved** | Frozen `agentSessions.ts:387`, `:407`, `:658`, and `:685` classify scoped tasks from canonical manifests and operation scope. Independent original forged save now returns `AGENT_SESSION_NOT_FOUND`; a directly inserted legacy forged Session returns empty history after source revocation. Legitimate unscoped canonical answer continuity still succeeds. |
| F2: source-linked proposal survives without saved blocks | **Resolved** | Frozen `053_agent_session_review_guards.sql:45–57` derives removal from the unavailable source-message dependency. Independent source revocation removes the proposal with absent block arrays; re-upload at the current revision also returns no proposal. |
| F3: final unconditional upsert overwrites lifecycle revision | **Original defect resolved; new lock-order defect below** | Frozen `agentSessions.ts:568–592` includes owner, revision, and live-state predicates. The original post-sanitization source-update hook now returns `AGENT_SESSION_REVISION_CONFLICT`. The two-connection tests at `agentSessions.integration.test.ts:770` and `:817` cover a competing canonical revision and source revocation after the Session has acquired source locks, respectively. |
| F4: client clock extends draft retention | **Partially resolved; remains open** | Independent tests reject the year-2099 timestamp and preserve the original clock for unchanged content admitted six days ago. A draft already expired on its first upload is removed but its digest/clock is not persisted; a fresh-timestamp retry restores the same text. See R1. |
| F5: compact JSON passes but jsonb exceeds DB size | **Resolved** | Frozen `agentSessions.ts:554–562` checks the actual PostgreSQL representation. The original 245,479-byte request now yields controlled `400 / AGENT_SESSION_INVALID`; independent readback finds zero Session rows and zero operation receipts for that rejected request. |

All shorthand copied-file locators in this report are relative to `/tmp/get5-session-review-v2/apps/backend/src/`. They refer to the frozen copy, not the later working tree.

Independent scripts:

- `/tmp/get5-session-code-proof-v2/proof.ts`: original defect regressions, first-upload expiry, valid UUID case, and legitimate continuity controls.
- `/tmp/get5-session-code-proof-v2/deadlock-proof.ts`: actual inverse lock schedule using the two unchanged SQL lock statements from frozen v2.

Run with the local synthetic environment from the repository root:

```sh
source /tmp/get5-session-proof.env
apps/backend/node_modules/.bin/tsx /tmp/get5-session-code-proof-v2/proof.ts
apps/backend/node_modules/.bin/tsx /tmp/get5-session-code-proof-v2/deadlock-proof.ts
```

The full 25-test integration suite was inspected and its reported passing result was considered supporting evidence. This review does not claim an independent full-suite rerun.

## R1 — P2: Persist the retention fence before scrubbing an initially expired draft

- Classification: **confirmed residual of F4**.
- Exact copied locators: `/tmp/get5-session-review-v2/apps/backend/src/modules/agentSessions.ts:542–552`; `/tmp/get5-session-review-v2/apps/backend/src/database/053_agent_session_review_guards.sql:80`.
- Observation: the service computes the incoming draft clock, then redacts an expired draft before the insert. The database trigger returns immediately when the incoming stored payload contains no `composerDraft`. Consequently no hash or initial clock is recorded for this admission.
- Reproduction: create a new Session with a synthetic draft timestamp eight days ago. The response correctly omits the draft. Resubmit that Session at revision 1 with identical text and the current timestamp.
- Actual independent result: `initiallyRemoved=true`, then `reintroduced=true`.
- User impact: an offline client can restore unchanged private text whose seven-day retention already elapsed, despite the new server fence.
- Recommendation: persist the bounded incoming draft digest and original clock independently of the scrubbed payload, including on first admission. Retain only the necessary digest/clock after content deletion.
- Verification: assert the first expired upload stores no draft text but establishes the retention fence; same-text retries with a fresh key and timestamp must remain scrubbed. Newly edited text should continue to work.

## R2 — P2: Avoid the screenshot-source lock inversion introduced by v2

- Classification: **confirmed new defect**, proven with actual concurrent PostgreSQL connections.
- Exact copied locators: `/tmp/get5-session-review-v2/apps/backend/src/modules/agentSessions.ts:188–198`.
- Unchanged dependency: `/Users/cubxxw/data/talent-signal/apps/backend/src/database/047_screenshot_contact_tasks.sql`, `purge_screenshot_contact_derivatives`, updates screenshot tasks from a source-retention trigger.
- Reproduction: connection A obtains the v2 `FOR SHARE` lock on the screenshot task. Connection B updates its retention receipt to `revoked`; its trigger then tries to update the screenshot task and waits for A. After `pg_blocking_pids` confirms that B is blocked by A, A executes v2's next `FOR SHARE OF c,sr` query.
- Actual independent result: `blocked=true`; connection A completes after PostgreSQL aborts connection B with **`40P01`**. Both transactions are then rolled back. Thus the source-revocation operation can be the deadlock victim.
- User impact: ordinary screenshot Session sync can fail a concurrent source revocation with an internal database error. The existing writer-first test cannot detect this inverse ordering because it starts B only after A has acquired every source lock.
- Recommendation: establish a compatible authority-lock protocol. If using nonblocking acquisition, roll back the entire Session transaction before bounded retry so acquired task/Session locks do not remain held while waiting. Expose a controlled retryable conflict on exhausted contention rather than a PostgreSQL deadlock error.
- Verification: retain the existing writer-first tests and add this inverse schedule, including the possibility that revocation would be the victim. Assert no `40P01`, no partial mutation, and a successful or explicitly retryable outcome for each operation. The initial account-wide sweep also runs before source locking, so include contention where it modifies a Session row.

## R3 — P2: Compare UUID identity case-insensitively

- Classification: **confirmed validation defect uncovered during v2 retest; also present in v1**.
- Exact copied locator: `/tmp/get5-session-review-v2/apps/backend/src/modules/agentSessions.ts:410–414`.
- Observation: SQL accepts both case variants of UUID values, but manifest person/context comparison uses case-sensitive JavaScript string equality. These payload fields are typed as UUIDs, not case-sensitive opaque strings.
- Reproduction: create a valid canonical relationship fixture, then uppercase only the payload's `personID` and `relationshipContextID`. Keep its task, manifest, snapshot, and actual identity unchanged.
- Actual independent result: `AGENT_SESSION_NOT_FOUND`; the relationship lookup itself can resolve the UUIDs, but the later string comparisons reject them.
- User impact: a legitimate contract-valid UUID representation cannot sync. Current native person/context fields are server-returned strings and usually lowercase, so this is **not** claimed as a reproduced failure in the current iOS primary path. It is a real API/cross-client compatibility failure.
- Recommendation: normalize UUID identity comparisons and persisted canonical UUIDs consistently, including scope and fork-provenance comparisons, without weakening scope checks. Keep arbitrary textual task/sentinel IDs distinct from UUID identity normalization.
- Verification: accepted equivalent UUID case variants must resolve to the same person/context and fork message; a different UUID must still be denied. Existing idempotency and immutable-message comparisons should remain deterministic.

## Additional controls and limits

The independent v2 proof also confirms that `createdAt` plus `contextWasTrimmed` can be admitted with a 29-day-old creation clock and leaves at most one day of Session retention. The frozen created-time test additionally checks immutability and rejection of a 31-day-old first upload. Neither optional field grants new evidence or execution authority.

The two existing real-concurrency tests are materially stronger than v1's single-owner mutation test: one pauses before upsert while another connection commits a revision winner; the other verifies source-update blocking through `pg_blocking_pids` for both initial insert and later update, then checks physical scrub after revocation commits. Their limitation is lock-order coverage, not fake concurrency.

Strengths retained: canonical history classification, source-message draft invalidation, owner/revision predicates, actual-jsonb size validation, and controlled rejection without receipts all have direct independent evidence.

Missing proof after remediation: retest R1–R3 against a newly frozen artifact, inverse-order lifecycle tests including screenshot tasks and the sweep, and final native cross-device verification owned by root. Actual object-store purge completion and production workload performance remain outside this backend review.

Veto: R1 retains an avenue to reintroduce expired private draft content contrary to the stated control. No user input is required for these bounded implementation fixes. Root owns remediation and final release judgment.
