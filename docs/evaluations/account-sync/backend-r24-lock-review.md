# Independent review of the ordinary/desktop lock collision

**Conclusion: the frozen implementation has a real lock-order defect.** The final parent receipt establishes PostgreSQL `40P01` from two production consumers, with an injected scheduling pause rather than simulated locks. The counterexample remains valid after tightening the harness's success/error and single-effect assertions; the earlier false-green gap is closed.

Reviewed only; no database/provider execution or product source edits:

- Harness: `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-lock-pg-proof.mts`
- Receipt: `/private/tmp/ai-test-account-sync.umqxBi/parent-macos-manual/parent-desktop-lock-pg-receipt.json`
- Frozen source: `/Users/cubxxw/.codex/worktrees/account-sync-backend-proof-r22/talent-signal`, commit `f4143338685f305a237a450c59a44964dc083122`.

The final receipt was executed at `2026-09-25T02:46:41.768Z`. Its five before/after source hashes match each other and the current immutable files. I read the corrected harness and rerun receipt before finalizing this report. Other reports were not edited.

## The observed interleaving is genuine

The wrapper at harness lines45–61 delegates SQL unchanged to the real `PoolClient`. It pauses ordinary execution only **after** the matched `SELECT ... FOR UPDATE` resolves. It identifies the exact synthetic account/credential IDs. It does not add a SQL lock, alter a row, return a fake result or stub a production credential check.

The sequence is:

1. Production ordinary `completeCredentialChange` acquires the open credential row (`accountLoginMethods.ts:790–794`), then pauses before processing its result.
2. Public desktop consume runs and acquires the account row via `initiatingIdentity` (`desktopAuth.ts:955`, implementation at `255–267`). The harness waits for that real query to resolve, not merely for the request to be scheduled.
3. Ordinary resumes and requests the account lock at `accountLoginMethods.ts:814`.
4. Desktop proceeds to request the credential lock through `consumeTargetRound`/`loadLockedCredentialChangeAttempt` (`desktopAuth.ts:1134`; `accountLoginMethods.ts:920–924`). The resulting wait cycle is credential → account versus account → credential.

The final receipt records `firstOrdinaryLock:"credential"`, `firstDesktopLock:"account"`, `actualDesktopLockAcquired:"account"`; ordinary raises PostgreSQL `40P01`, desktop returns HTTP200 `completed`, the desktop row and existing grant are consumed, exactly one matching audit exists, and account revision changes **1 → 2**. This is not a test-created deadlock based on a lock that production would never take. Delaying a process after its query returns is a possible real scheduling interleaving.

The ordinary `status:500` is the harness's normalization of the raw function error, not an actual HTTP response from the public ordinary account route. Frozen `app.ts:596–638` also leaves `40P01` in the generic500 path, but that HTTP mapping is source evidence, not a separately executed route result here.

## Proof and effect boundary

This is deliberately a **duplicate** completion after the desktop target approve already consumed its provider challenge/assertion. The ordinary request uses the original credential secret and the same target nonce/assertion string (harness lines150–162). It is not a second fresh authorized provider proof.

Production ordinary completion validates and locks the grant/account before checking provider replay. Therefore a duplicate request can reach the conflicting locks even though it must later fail with a domain replay/consumed/stale error. The expected behavior is ordinary rejection and one desktop completion, not two successful authorizations. It is reasonable to test this malformed/repeated request directly; the report does not claim a current visible UI dispatches both requests.

The ordinary path uses the real auth guard and production completion function; desktop uses the registered public route. Apple cryptographic verification is controlled, while real PostgreSQL ownership, challenge/nonce/assertion, revision, secret, origin and mutation checks remain. No live OAuth, native window behavior, account takeover or duplicate credential creation is demonstrated. A single provider row is especially weak evidence of a single effect here because the target is an idempotent reassertion of the existing Apple subject.

## Repair-aware scheduling is sound

Harness lines170–175 correctly distinguish request and acquisition. If both consumers request the same first account/credential lock, it releases ordinary as soon as desktop requests that lock, allowing normal serialization; it does **not** wait for desktop to acquire a lock held by the paused ordinary transaction. If the first matched locks differ, it waits for desktop's actual acquisition before releasing ordinary.

This avoids forcing the old opposite-lock pattern on a correctly repaired common order. If the refactor changes SQL spelling enough that the matcher no longer recognizes it, the bounded waits fail rather than silently pass; update the monitor deliberately in that case. Capturing query row count/ID as part of the held-lock receipt would further strengthen future maintenance, though the current real `40P01` and source-bound fixture do not depend on an invented acquisition.

## Final assertion tightening verified

The earlier harness could pass an incorrect repair where ordinary accepted the spent assertion and desktop returned409, because it only checked no500, one provider row and a consumed grant. The final harness closes that gap at lines187–194:

- Ordinary must be `accepted:false`, status409, with `APPLE_CHALLENGE_INVALID`, `APPLE_TOKEN_REPLAYED`, `CREDENTIAL_ATTEMPT_INVALID` or `CREDENTIAL_ATTEMPT_STALE`.
- Desktop must be `accepted:true`, HTTP200, result `completed`, and its durable row must be `consumed`.
- The original grant must be consumed; exactly one mutation receipt for that grant must exist with the expected account, actor and `link_provider` kind; account revision must increase by exactly one. These assertions supplement the single provider-row count for this idempotent target.
- The monitor and state observations are preserved before assertions. The final failing receipt includes `auditCount:1`, revision1→2 and the real40P01, so the counterexample is not being inferred from a missing result.

No further rerun is needed to establish the existing counterexample. A repaired-source run can use this final harness, rebinding source hashes. This single test does not cover every possible account/credential/session lock order or decide a broader authorization claim. Capturing provider subject/ID before and after would add identity-continuity evidence, but is not necessary to prove the observed deadlock.

## Hashes

| Input | SHA256 |
| --- | --- |
| Harness | `a82fc1d8ce7f30d117ab737fd909fd081e378b203ff510117a72b61583a48c63` |
| Receipt | `d9fba7dd77b5ce15fd8dbdd16989da9cae06cf4fef712e23ab98584a2fb93aad` |
| `apps/backend/src/modules/desktopAuth.ts` | `7348cc54ae7a7949890c9a4e6c26a5bbe11d2f94fd329157d5435a550608cc19` |
| `apps/backend/src/modules/accountLoginMethods.ts` | `8aa9f7b1d2b8b88264bbacbe415acc7c0f24f71c63d064ee826863173d495f06` |
| `apps/backend/src/modules/auth.ts` | `196ccaf8a1c8d356e8b4715dd3c0125451cdf02180ba575a173dca0d96d8761c` |

The receipt retains the remaining matching source hashes and the synthetic actor/grant IDs. No production source, previous report or harness was edited by this review.
