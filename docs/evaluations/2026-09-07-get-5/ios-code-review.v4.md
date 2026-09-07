# GET-5 iOS code review — frozen v4 final capacity delta

```yaml
reviewer: ios-code-review
artifact: /tmp/get5-ios-review-v4/manifest.json
scope: v3 pending-recovery capacity guard, shared policy, caller integration, and regression source
method: static source and test-source inspection
verdict: no_actionable_findings_in_reviewed_delta
runtime_proof: not_executed_by_this_reviewer
```

The remaining v3 P2 is resolved in source: an existing protected screenshot admission can pass the UI capacity preflight and reach its exact-request recovery gate. New admissions still respect the limit. No new actionable defect was found in this narrow delta, and the earlier source-level resolutions remain applicable.

This is a follow-up to [v3](ios-code-review.v3.md), not a native execution or release-verification result. All line references below are relative to `/tmp/get5-ios-review-v4/apps/ios/`. All 27 files match the frozen manifest. Only four hashes changed from v3: the screenshot policy, its UI caller, its test file, and the canonical UI test's receipt lookup/scroll helper.

## Narrow verification

| Check | Result and exact evidence |
| --- | --- |
| 1. Capacity applies to new intent, not existing recovery. | `Sources/Features/AskScreenshotAdmissionPolicy.swift:40–45` returns a notice only when attachments exist and there is no pending screenshot admission. |
| 2. The real UI uses the tested policy. | `Sources/Features/RelationshipAskView.swift:3410–3417` passes current attachments, protected pending state, and the store's capacity notice through that helper. `send` retains its early notice branch at `3312–3315`; the branch is now bypassed for existing recovery. |
| 3. The capacity bypass does not authorize changed images or a new key. | The unchanged `performScreenshotContact` still derives the ordered request identity and calls `beginScreenshotAdmission`. The store reuses only matching objective/hash/capture-time state before checking fresh capacity (`Sources/Features/RelationshipArchiveModels.swift:2551–2557`). |
| 4. Fresh admission at 20 remains blocked before POST. | The shared policy returns the full-capacity notice for a new request, and the unchanged store also requires fewer than 20 references before allocating a fresh pending key. |
| 5. Accepted overflow recovery remains durable and explicit. | The unchanged matching-key exception at `RelationshipArchiveModels.swift:2572–2576` permits the already-admitted 21st result. The unchanged create caller requires successful recording before clearing request/images (`RelationshipAskView.swift:3464–3470` after the v4 line shift). |
| 6. The regression crosses the actual policy/store boundary. | `Tests/AskScreenshotAdmissionPolicyTests.swift:49–88`, `testFullHistoryComposerPreflightStillReconcilesItsProtectedAdmission`, reserves at 19, fills the 20th slot, calls the same preflight helper, rejects changed image identity, reuses the original key, records the accepted task, and verifies pending state clears. This is test-source coverage; it has not been run by this reviewer. |
| 7. Fork-owned screenshot restoration and inherited read-only protection are unchanged. | `RelationshipArchiveModels.swift` is byte-identical to v3. The UI delta only changes the capacity-notice helper, leaving owned-task restoration and explicit owner/read-only checks intact. |
| 8. The other v4 test delta does not change production behavior. | `UITests/Get5CanonicalSessionUITests.swift` selects the persisted receipt ID and scrolls toward the original message. It does not modify admission, ownership, persistence, or authority. No cosmetic test-tree change is treated as a product defect. |

## Proof limits

`pnpm docs:check` passed after this report was written: documentation, wiki, and all three architecture-diagram checks.

This review establishes that the source fix is integrated and that the added regression describes the missing failure path. It does not establish compilation, XCTest success, real retry taps, network behavior, or a completed native reopen. The parent task owns those executions. The regression uses a synthetic store and shared policy; existing persistence/relaunch tests remain complementary proof rather than being re-executed here.

No Xcode, Simulator, XCTest, real private content, credentials, or production writes were used. This reviewer changed only this report and preserved v1–v3. Independent backend ownership validation and the parent's final runtime evidence remain outside this narrow source verdict.
