# r26 backend repair review

Snapshot: `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r26/talent-signal`, commit `854f47beec6e930e8cbfb380551abe530d156a86`; comparison `f4143338685f305a237a450c59a44964dc083122` (r22). All 451 manifest hashes independently matched; worktree was clean. Only `desktopAuth.ts`, its integration test, migration 085, and `schema.test.ts` changed. This review did not run tests/databases, edit product source, or inspect moving Web/native as candidate evidence.

## Verdict

R1's original caller leak, R2's password-unlink mapping, R3's stored grant-origin mismatch, and R4's deadline renewal have concrete source fixes. Cancellation now expires its exact unused grant atomically. The corrected parent PostgreSQL probes pass all 11 original cases. However, full closure is blocked by three P1 findings below: remaining cross-consumer lock cycles, missing durable results after ordinary password completion, and a cancellation result that can contradict an already-completed ordinary mutation. The new parent probes reproduce target-prepare/consume F1 and both F2/F3 result failures; additional cancellation/approval lock schedules remain source-confirmed rather than dynamically executed. Evidence is distinguished below.

References below are relative to the immutable snapshot. `D` means a desktop attempt row, `G` a credential grant, `A/U/S` account/user/session, and `P` the provider challenge/assertion rows. SELECT without a locking clause is not treated as a row lock.

## P1 findings

### F1 — Target prepare and cancellation retain the reverse grant/account lock order

Primary locations: `apps/backend/src/modules/desktopAuth.ts:413`, `:499`, `:1255–1260`, `:1688–1704`; `apps/backend/src/modules/accountLoginMethods.ts:920–938`; migration `085_desktop_auth_attempts.sql:132–133`; `083_account_identity_ownership.sql:247–275`.

Target consume now obtains `D → G → A → U → S`: `loadLockedCredentialChangeAttempt` locks the grant before account context. Ordinary completion similarly obtains `G → A → U` (`accountLoginMethods.ts:789–814`). But target prepare still calls `initiatingIdentity` at line 413, holding A/U/S, then requests G FOR UPDATE at line 499.

Reproducible sequence: prepare/approve a valid target A for grant G; begin consuming A and pause after its actual G lock; start a second target prepare B for the same G and pause after its actual account lock; release A. A waits for B's A lock, B waits for A's G lock. Preparing a second target for a still-open grant is not prohibited by this backend. The same inversion also exists with ordinary completion versus target prepare. Mapping one deadlock victim to `503 DESKTOP_AUTH_CONFLICT` (`desktopAuth.ts:1065–1075`) does not remove the cycle or turn it into the expected stale/consumed result; prepare's error path does not perform that mapping.

Cancellation has the same inversion through a trigger: it first updates D at line 1688, acquiring A FOR SHARE through the retirement fence, and only afterward updates G at line 1701. A cancelled target B and consuming target A can be different D rows for the same G. B can hold A SHARE while waiting for G; A holds G while waiting for A UPDATE. The advisory `desktop-grant:` lock is used only by cancellation and does not serialize the other consumers.

The source also exposes the existing provider-proof variation: desktop approve obtains D then consumes P (`desktopAuth.ts:759–770`, `googleAuth.ts:85–92` / `auth.ts:274–294`), before its final D UPDATE acquires A SHARE through the fence (`desktopAuth.ts:790–795`). Ordinary link completion holds G/A before consuming the same P (`accountLoginMethods.ts:814–828`, `:520–529`). With a valid duplicated assertion arriving at both consumers before either commits, ordinary can wait on P while approve waits on A. This is a single-use/replay competition, not two independent fresh authorizations.

Required fix: choose and implement one complete order across every existing-grant consumer and provider-proof consumer, including account locks acquired by write triggers. Preserve the retirement and live-session guards. A local ordering change in target consume or a 40P01-to-503 catch is insufficient. Add deterministic barriers after actual SQL locks for consume/prepare, consume/cancel, and ordinary-completion/approve, and require a successful authorized winner plus specific consumed/stale/replay rejection for the loser, with one audit and one revision increment.

**Independent dynamic confirmation:** final `r26/parent-desktop-prepare-consume-lock-receipt.json`, executed `2026-09-25T03:21:20.242Z`, SHA-256 `dc4bb6a1251a9274f9cfeac7b731e1c80a4706883397f489d5f016995240c13a`, matches the frozen source hashes. Actual first locks were account for the new prepare and grant for consume; both were held before releasing the barrier. The instrumented real SQL call recorded PostgreSQL `40P01` when desktop tried to acquire account. Prepare B returned 200, while consume A returned 503/`DESKTOP_AUTH_CONFLICT`. Audit remained 0, revision 1→1, grant unconsumed, and A still approved. This confirms the public-route lock cycle directly, not just by inferring from its 503 wrapper. The cancel and approve variations described above were not part of this execution.

### F2 — Ordinary first-password completion has no recoverable desktop committed receipt

Primary locations: `desktopAuth.ts:1162–1199`, `:1378–1390`, `:1320–1327`; `accountLoginMethods.ts:838–840`, `:855–894`.

For set/change password, current consume records D as consumed and returns a credential continuation. It does not record a committed mutation result, correctly, because the password has not yet been submitted. The intended ordinary WK completion consumes G, writes its audit, and increments account revision. `finishCredentialChange` never records that effect on the associated desktop operation; the only desktop `result_committed_at` writers are login, immediate unlink, and target link consume.

Reproducible sequence: real current-provider prepare/approve/consume for `set_password`; acknowledge the same continuation; call production `completeCredentialChange` with that grant and a valid new password; lose only its response; call public desktop result with the original live session, D pairing, and verifier. D still has no `result_committed_at`, so result calls pending authority at line 1390. Its own authorized password write changed the revision/fingerprint, causing `DESKTOP_AUTH_ATTEMPT_INVALID` at lines 1323–1327. Ack likewise selects pending mode. Re-authentication with the new password can prove the mutation happened, but is not an operation-specific lost-response receipt.

The new first-password test (`desktopAuth.integration.test.ts:1876–1945`) executes a genuine ordinary completion and checks subsequent password authentication; it stops before paired result/ack. The completed-receipt test at lines 1414–1444 only covers immediate unlink, where desktop already wrote its result itself.

Required fix: make every successful consumption of a relay-created grant durably discoverable under its original desktop/credential operation identity in the same transaction. Preserve exact original actor/session checks; allow that operation's own committed revision change only after identifying an actual committed effect. Do not infer password success from a visible password row, bypass pending revision checks, or rerun the password mutation for discovery. Add ordinary set/change-password completion → lost response → same-operation committed result and acknowledgment; assert one audit/revision change, unchanged original session, and denial for another/sibling/revoked session.

### F3 — Cancel can report cancelled after ordinary completion has committed the same grant

Primary location: `desktopAuth.ts:1678–1731`, especially `:1688–1706`.

Cancellation distinguishes consumed versus open only from D.status. For an open target D it marks D cancelled, then expires G only where `consumed_at IS NULL`. If ordinary completion already consumed that G, the UPDATE returns no row; this is silently accepted and cancel still returns `status: cancelled`. A later result read of D also returns cancelled before examining the grant.

Minimal sequence: current link proof → result/ack → target prepare/authorize; submit the legitimate target assertion through production ordinary completion before desktop approve; after that successful commit, cancel the target with its valid WK pairing or system state. The provider is linked and the grant audit is committed, but the desktop response reports cancelled. This sequence requires one valid target assertion, not a forged or second fresh proof, and can be tested sequentially before adding a race.

Required fix: arbitrate cancel versus every grant consumer under the complete shared lock order. If the underlying credential operation already committed, return the defined truthful consumed/committed result; never label its effect cancelled. If cancel wins, expire only that exact unused grant and audit that revocation atomically. Assert a newer grant with a different ID remains valid. Existing cancellation tests at lines 1623–1744 cover cancel-first and desktop immediate-unlink consume-first, not ordinary-completion-first.

## Closure of prior findings and protocol checks

| Concern | r26 source conclusion |
| --- | --- |
| R1 original caller/session leak | `authorizePairedCaller` at 1304–1331 checks fingerprint plus account/user/session, then locks live identity. Result invokes it before pending secret return; ack invokes it before acknowledgment. Completed desktop receipts use receipt mode and tolerate their own revisions. Original leak is fixed in source; F2 remains for effects committed outside desktop consume. |
| R2 unlink password | Prepare now explicitly allows password as an unlink target at 452–459; current insertion preserves it for unlink at 1137–1142; shared last-method guard remains. Parent's new actual-PG positive receipt is 200 with password removed and Apple retained. |
| R3 password-first grant origin | `validateGrantContext` at 1213–1229 permits validated stored Web/desktop client scopes or matching actual origin; prepare validates it and target consume passes that same stored origin to the locked loader. It never trusts a replacement origin from request JSON. Parent's new actual-PG positive receipt consumes the original `client:talent-signal-web` grant successfully. |
| R4 original deadline | `grantExpiry` at 908–917 caps by current normal TTL, existing desktop expiry, flow deadline, and server approved_at + 300 seconds. Target expiry is additionally capped to existing G.expires_at at 538–539/565–569. No consume-time renewal beyond these caps. Existing challenge TTL cannot bypass the expiring grant guard. |
| R5 cancel-first revocation | D cancellation, exact unused G expiry and `desktop_grant_revoked` audit are one transaction. G is selected by the immutable attempt's grant ID; another grant ID is not updated. Original cancel-first bypass is fixed in source; F1/F3 prevent full concurrency/truthful-result closure. |
| Current acknowledgment before target | Prepare now requires consumed, acknowledged current D matching flow_ref AND credential_attempt_id for relay-created desktop grants (524–534). Ordinary Web password grants remain supported. The test at 709–743 exercises pre-ack rejection then real ack. |
| One-use proof / pairing / email | Internal completion still consumes the approved proof once; derived grant secret still comes from random pairing through the unchanged HKDF helper. Ordinary known-subject email promotion guards were not changed. No new raw pairing reconstruction or verified-email upgrade was introduced by these four changed files. |
| Schema and classification | Public request schemas and explicit extra-field prevalidation are now attached (1810–1935). Migration 085 retains table manifest/retirement/Lab guards and adds only the audit kind to its previous shape. `schema.test.ts` now reflects credential_round fields rather than the obsolete link purpose. |

## Full lock inventory within the reviewed boundary

| Consumer | Relevant acquisition order | Assessment |
| --- | --- | --- |
| Current prepare | A UPDATE → U UPDATE → S UPDATE → insert new D | No existing G wait. |
| Target prepare | A UPDATE → U UPDATE → S UPDATE → G UPDATE → read current D without row lock → insert new D | Inverts target/ordinary completion. |
| Current consume | D UPDATE → A/U/S UPDATE → insert new G → optional completion of its own uncommitted new G | The new G cannot be held by another committed consumer before insertion commits. |
| Target consume | D UPDATE → G UPDATE → A/U UPDATE → S live recheck/lock → mutation | Aligns with ordinary G/A order, but not prepare/cancel. |
| Ordinary completion | G UPDATE → A/U UPDATE → provider proof rows if link → mutation | Relevant to both grant and proof cycles. |
| Result | D UPDATE → A/U/S UPDATE → plain MVCC G read for continuation | Does not lock G; no claimed result/consume G/A cycle. |
| Ack | D UPDATE → A/U/S UPDATE → update that same D | Does not lock G; no claimed ack/consume G/A cycle. |
| Cancel open target | D UPDATE → A SHARE via D-write fence → cancellation advisory → G UPDATE | Inverts grant-first completion; audit only follows a successful unused-grant expiry. |
| Authorize / code issue | D UPDATE → plain proof read (authorize) → A SHARE via D-write fence | No G wait on these paths. |
| Approve | D UPDATE → provider challenge/assertion writes → A SHARE via D-write fence | Provider-proof/account inversion with ordinary link completion. |

Same-D requests serialize on D first. The identified grant-cycle examples deliberately use different D rows or an ordinary consumer, so that serialization does not prevent them. Result/ack fixes should not add new G or other-D locks behind their existing A lock without updating this inventory.

## Necessary test correction (P2)

The new race test at `desktopAuth.integration.test.ts:1947–2077` uses nondeterministic Promise.allSettled, an intentionally stale ordinary proof, checks at least one fulfilled outcome, excludes literal `40P01`/`deadlock`, then checks only G.consumed_at. It neither forces the critical lock interleaving nor rejects the new `DESKTOP_AUTH_CONFLICT`/503 wrapper. It also does not require exactly one audit, one revision increment, or exact expected loser error. Its passing result cannot establish the claimed absence of database deadlocks. Preserve the parent's stricter r24 deterministic test and add the newly exposed consumer pairs.

Additional bounded schema acceptance should include all public route discriminators and a fully populated mixed cancel authority (valid mode/pairing plus extra state), not only the current system-mode payload lacking its required state. This is a coverage request, not a claimed new authority bypass.

## Independent receipt status during this review

The first error-envelope results are archived as `r26/before-error-envelope-adapter-*`; they are superseded as product evidence. Their 500 responses came from the parent harness's incomplete error shape, not an observed production error: new response schemas require `message` and `request_id` alongside `code`, and production `app.ts:601–609` provides all three. The parent repaired its adapters and reran the four existing probes. I inspected the corrected receipts and independently matched every before/after source hash in each to the r26 manifest.

| Corrected parent receipt | Execution (UTC) | Observed result | SHA-256 |
| --- | --- | --- | --- |
| r26/parent-desktop-login-pg-receipt.json | 03:09:44.548 | 2/2: unverified Apple hint is not reserved; actual revoke-after-admission fails 401/SESSION_INVALID without another session | 0a8f8dff6ea40e80012f57bd3b1623b0927df72560b4c913c80213c552b388d3 |
| r26/parent-desktop-credential-pg-receipt.json | 03:19:20.932 | 3/3: password unlink, original-session pending positive, exact 409/DESKTOP_AUTH_FINGERPRINT_CHANGED for all anonymous/foreign/revoked result AND ack probes, original Web-origin target completion | 89a33141df1deeba85143f2211bba7b79d0cf4512a2e3289f9f8e1d8773653ac |
| r26/parent-desktop-deadline-cancel-pg-receipt.json | 03:14:47.083 | 5/5: fresh-password and uncancelled-link positives; original deadline extension 0ms and completion 409/CREDENTIAL_ATTEMPT_INVALID; both cancel modes prevent grant reuse | 0190db9ed20a8fa7c92035b2b011722643701cd03872e6d89a3c3fddb095e659 |
| r26/parent-desktop-lock-pg-receipt.json | 03:15:03.084 | 1/1: ordinary and target consume both lock grant first; ordinary returns 409/APPLE_CHALLENGE_INVALID, desktop completes once, audit 1 and revision +1 | 7d78fd8c6b7ccf7156dccccd73cab11f3aa20bcc9849bc93da3881daa1718ca8 |

These establish closure of the original narrow counterexamples. They do not close F1's other consumers or F2/F3's ordinary-completion result ownership. The original deterministic lock probe differs from its previously reviewed version only in the dedicated database/output path and corrected error envelope.

**R1 assertion refinement closed:** the final credential script, SHA-256 `37bfe7650f699b85475b9a57168dffcd3861da3bcee31afecf8f9e9ee7f3a4b9`, records and requires matching result/ack domain errors, including the newly added revoked-original ack. The final receipt above shows `409 DESKTOP_AUTH_FINGERPRINT_CHANGED` for every anonymous, foreign-account, and already-revoked-original result AND ack, while the original pending continuation positive succeeds. Its permitted alternate early-guard outcome is restricted to `401 SESSION_INVALID`/`AUTHENTICATION_REQUIRED`; unrelated 409, schema failures and 500 cannot pass. The separate actual revoke-after-admission test requires `401 SESSION_INVALID`. The original R1 isolation counterexample is dynamically closed at this snapshot.

Pi's reported 28/28 result is its own suite evidence; this reviewer did not execute it. Parent tests use real isolated PostgreSQL and production functions/public desktop routes with controlled provider verification. They are not live-provider, browser, or native acceptance.

## Independent review of new F1/F2/F3 probes

Reviewed final parent scripts and parent-executed receipts; no database execution by this reviewer. Final source hashes in all three new cases match the same r26 manifest. F1's final receipt is bound above; F2/F3's final strengthened receipt is bound below.

- `r26/parent-desktop-prepare-consume-lock-proof.mts`, final SHA-256 `f723afb1fd53bed2810bf1ced4f2334abc7da4b13bbb0d4a9130cdf954b3868c`: the production prepare and consume routes use two Fastify registries over the same isolated database. The SQL proxy forwards queries unchanged, records original thrown database error codes before rethrowing, and pauses only after an actual matching account/grant FOR UPDATE returns. For opposite first locks it waits until both are acquired; for equal first locks it releases the first caller before waiting for the second lock. This exposes F1 without forcing a repaired common order to deadlock. The prepare payload legitimately refers to the same open grant, and no repeated assertion is submitted to prepare. Assertions reject 500/503/40P01, require a successful target completion, appropriate prepare success or specific stale/consumed refusal, the consumed grant/desktop status, exactly one scoped audit and revision +1. A failure before the SQL barriers is a harness/setup failure, not a reproduced lock cycle. The old `ordinary` monitor naming refers to the second public prepare in this new script; it is not an ordinary credential-completion call.
- `r26/parent-desktop-ordinary-receipt-pg-proof.mts`, final SHA-256 `68b901f7da3cdcb0f90cd90daa18d632c59fadff70998f248cc041e87d60de3c`: the first case executes real current proof, real ack, actual auth guard, then production ordinary password completion before public result/ack. Omitting the completion response from recovery is a valid lost-response model; the harness still observes the actual successful mutation as its positive control. The two cancel cases prepare/authorize a Google target, consume that single challenge/assertion through ordinary completion under a controlled verifier, assert the linked provider and one revision/audit, then call real WK/system cancel followed by result. No synthetic DB state/time rewrite or second fresh proof is needed. These sequences reproduce F2/F3 in the final strengthened run.

The strengthened ordinary-result script closes the principal shallow-response acceptance gaps: it now requires exact committed intent/status, canonical Settings account/user, correct audit account/actor/kind, and password acknowledgment `status: committed` with its exact desktop attempt ID. F3 requires `link_provider/linked` rather than just top-level `committed`. These are future repair acceptance assertions; the current failure cases stop before the later success assertions execute. The optional extra first-password grant read and account-wide check for unexpected revocation audit can supplement final integrated acceptance, but are not needed to establish the present counterexamples.

**Final F2/F3 execution:** `r26/parent-desktop-ordinary-receipt-pg-receipt.json`, executed `2026-09-25T03:22:12.048Z`, SHA-256 `51c1354a1f66bff157226aba07120e8a5811ae4cdfd04d3eed1b936272dc95e8`. It matches r26 source hashes and records all three actual failures after the scoped audit/revision assertions pass. F2: production completion returned `password_set`, password persisted, audit 1, revision 1→2; original-session result and ack both returned 409/`DESKTOP_AUTH_ATTEMPT_INVALID`, and current D retained null result_committed_at. F3: both WK and system cases first committed ordinary `linked`, with Apple+Google, consumed grant, audit 1 and revision 1→2; cancellation and subsequent result each returned 200/`cancelled`, and D was stored cancelled. The first completed receipt is preserved as `before-result-assertions-*`. An intermediate invocation with `cases: []` was a parent setup-parameter failure and is excluded; it has been superseded by this completed rerun.

## Review of the proposed complete repair protocol

The parent proposes existing-grant consumers use `D (only the route's own row, where applicable) → G → A/U/S → P`; target prepare uses `G → A/U/S → insert a new D`; target approve obtains its existing G and account context before consuming P; cancel obtains G before a D write can acquire A SHARE through its trigger. Ordinary completion must not acquire another desktop D after taking G/A. This is a coherent direction and removes the demonstrated inversions if applied to every relevant write/expiry/error branch without removing retirement or session guards.

For shared completion history, the already-atomic G.consumed_at plus `account_access_events` row whose ID equals G.id can serve as the durable effect, without ordinary completion back-locking desktop rows. Require exact G account/user/session/intent and audit account/actor/kind/outcome agreement with the frozen operation. Result/ack must first enforce the original live actor/session/fingerprint, then inspect that committed effect through ordinary MVCC reads to select receipt versus pending mode. A genuine committed effect permits its own revision change; absence of that effect keeps the original revision/fingerprint/deadline checks. Do not run those pending checks first and accidentally reject the result being recovered. Merely seeing consumed_at, an unrelated audit, a current password/provider row, or URL metadata is insufficient.

Cancel must inspect the same exact completion history after obtaining G and before writing a cancellation state. If ordinary completion won, return truthful consumed/committed history without replaying the mutation; if cancel wins, revoke only the exact unused G and audit atomically. Do not repair missing receipts by locking a different D behind G/A, since that would create the opposite D/G order against result/ack. An incomplete/inconsistent receipt remains unknown or rejected rather than fabricated success. This is a design review, not verification that the moving implementation follows the protocol.

## Hash binding

Manifest: `/private/tmp/ai-test-account-sync.umqxBi/macos-pi/backend-r26-snapshot.json`, 451/451 matching files.

| File | SHA-256 |
| --- | --- |
| apps/backend/src/modules/desktopAuth.ts | 5fcd09f3811ee84e4d5e08d519f74f62d1c8f89edf8c8443cb48d0ef82d3c748 |
| apps/backend/src/modules/desktopAuth.integration.test.ts | 53302ec8b9802b73ee1b1f0af85a2e3fae1f43bc3a094477b84906eb81bb3558 |
| apps/backend/src/database/085_desktop_auth_attempts.sql | 08ece35735de887f3608e02a352bb6b025a3d19dceb481834adf36a322683413 |
| apps/backend/src/database/schema.test.ts | 27a54aff87ccbe4ee43c7dc4c7f5ad9e27ebd40e0fab610c544063d6873f3cca |
| apps/backend/src/modules/accountLoginMethods.ts (unchanged) | 8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06 |
| packages/contracts/src/desktopAuthSchemas.ts (unchanged) | f461e1ae1afe5aa31bd2c1f719d8750f3dda101f51b5041c72e8fe622200f206 |

The findings and closures apply only to this immutable backend/contracts snapshot. Final candidate hashes and integrated consumer proofs must be checked again; nothing here certifies moving Web or native code.
