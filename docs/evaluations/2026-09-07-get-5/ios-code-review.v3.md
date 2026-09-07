# GET-5 iOS code review — frozen v3 screenshot retest

```yaml
reviewer: ios-code-review
artifact: /tmp/get5-ios-review-v3/manifest.json
scope: v2 remaining screenshot ownership, admission capacity, and accepted-result recovery
method: static source, caller integration, and focused test-source review
verdict: changes_required
runtime_proof: not_executed_by_this_reviewer
```

The v2 fork-reopen defect is resolved in source. Fresh admission is now blocked before crossing the screenshot limit, and accepted results have an explicit persistence-success gate. One P2 remains: the UI capacity preflight also blocks recovery of an already-protected request, preventing the new store recovery exception from being reached.

This is a narrow retest against [v2](ios-code-review.v2.md), not a new persona evaluation. All paths and line numbers below refer to frozen files under `/tmp/get5-ios-review-v3/apps/ios/`. All 27 copied files match the manifest. No Xcode, Simulator, XCTest, or native taps were executed by this reviewer.

## Remaining IOS-5 · P2 · Capacity preflight blocks an existing unknown screenshot admission

**Exact location:** `Sources/Features/RelationshipAskView.swift:3312–3315,3410–3413`.

The capacity notice is returned whenever selected media exists and the Session has at least 20 screenshot references. It does not distinguish a new request from an existing `pendingScreenshotIdempotencyKey`. The shared `send` entry point returns immediately on that notice, including when reached from “Check original screenshot task.”

This contradicts the corrected store's intended recovery path: `beginScreenshotAdmission` reuses the matching protected key before checking fresh capacity (`Sources/Features/RelationshipArchiveModels.swift:2551–2556`), and `recordScreenshotTask` allows an already-admitted 21st result at `2572–2576`. Neither can run after the UI returns early.

**User impact:** if the Session reaches 20 task references while an earlier request's outcome is unknown—or restores such a v2 state—the user reattaches the original images but cannot reconcile that request. Text continuation remains blocked by the pending admission, and Fork remains disabled while that key is pending. The accepted task may still exist in screenshot history, but its originating Session cannot finish recovery.

**Minimal correction:** apply the fresh-capacity notice only when there is no pending protected admission. Preserve exact objective, image-order/hash, key, and capture-time validation for recovery; bypassing the capacity notice must not permit a changed request or a fresh key. Keep the explicit post-acceptance persistence gate introduced in v3.

**Focused regression:** reserve a key with 19 task references, add the 20th reference while that request is unresolved, and round-trip persistence. Reattach identical images and exercise the same preflight policy used by the actual UI before calling the store. It must allow exact-key readback, durably record the accepted task, and clear pending recovery. Changed image/order/objective must still fail, while a genuinely new request at 20 must be blocked before POST. The current race test starts directly at the store recorder, so it misses this UI gate.

## Concrete checks and resolution evidence

| Check | v3 result | Exact source or test evidence |
| --- | --- | --- |
| 1. Fork distinguishes inherited references from new tasks. | Resolved in source. | `RelationshipArchiveModels.swift:341–360` adds persisted inherited IDs and derives owned IDs; `2660–2661` snapshots the copied set at fork creation. New task recording does not add it to the inherited set. |
| 2. Reopening a fork restores only its newly owned screenshots. | Resolved in source. | `RelationshipAskView.swift:3685–3693` iterates `ownedScreenshotTaskIDs`, preserving the post-await Session/task match. The blanket `originSessionID == nil` exclusion is gone. |
| 3. Restored ownership survives cache encoding and decoding. | Covered by implementation and test source. | Persisted fields at `RelationshipArchiveModels.swift:766,801,853`; `Tests/AgentSessionContinuityTests.swift:229` creates a fork, records its new task, reloads persistence, and verifies the new ID remains owned and refreshable. |
| 4. Inherited screenshot tasks cannot regain live recording/resume/cancel authority. | Resolved in source. | Store guard at `RelationshipArchiveModels.swift:2571`; UI recorder supplies the read-only set at `RelationshipAskView.swift:3652–3655`; resume/cancel check the set at `3502–3505,3534–3536`. `Tests/AskScreenshotAdmissionPolicyTests.swift:40` checks new-owned acceptance and inherited rejection. |
| 5. Concurrent sync cannot drop inherited read-only classification. | Preserved in source. | `RelationshipArchiveModels.swift:2737–2739` unions inherited sets while unioning task IDs. Legacy fork snapshots without this field conservatively treat existing references as inherited. |
| 6. A fresh 21st admission fails before a key or network request is created. | Resolved in source. | Store checks `< 20` at `RelationshipArchiveModels.swift:2554`; UI preflight runs before sending state and POST at `RelationshipAskView.swift:3312–3315`. `Tests/AgentSessionContinuityTests.swift:229` asserts no pending key at capacity. |
| 7. Fork provides capacity while preserving original screenshot history. | Resolved in source. | `RelationshipArchiveModels.swift:2642–2663` copies at most 19 screenshot references and retains whole-turn/byte bounds, leaving one new slot. UI retains draft/media during fork and shows the existing trimmed-context notice. The same capacity test verifies original count remains 20. |
| 8. An already-admitted result can be stored after a concurrent final-slot fill. | Store path resolved; UI retry path remains blocked above. | `RelationshipArchiveModels.swift:2572–2576,2608–2617` permits one matching admitted overflow, persists it, clears matching pending state, and scopes the capacity notice. `Tests/AgentSessionContinuityTests.swift:266` covers direct recording of that result. |
| 9. Failed local recording cannot be called successful admission recovery. | Resolved in source. | `recordScreenshotResult` returns `Bool` at `RelationshipAskView.swift:3648`; false propagates at `3671–3677`. The create caller throws on false at `3460–3462`, before clearing images/request at `3465–3467`. |
| 10. The recovered oversized Session does not poison unrelated synchronization. | Preserved in source. | `RelationshipArchiveModels.swift:2814` adds screenshot count to the existing per-Session sync-bound preflight. Existing required-owner synchronization continues to isolate this local overflow from other Sessions. |

## Proof boundary

`pnpm docs:check` passed after this report was written: documentation, wiki, and all three architecture-diagram checks.

The new test sources are useful targeted coverage, but this reviewer has not compiled or executed them. In particular, the fork ownership tests prove the intended state/predicate contract when run; they do not by themselves prove a native reopen, waiting-for-user card, or successful tap. Runtime evidence remains the parent task's responsibility.

The current backend schema declares `inheritedScreenshotTaskIDs`; canonical ownership validation is independently assigned and is not inferred from client fields. No other review reports or scores were read. This reviewer modified only this report and preserved the prior reports. A later shared-source fix does not alter the frozen-v3 finding without another scoped verification.
