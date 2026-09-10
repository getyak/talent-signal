# GET-9 cleanup failure receipt review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: the uncommitted `claudeHarness.ts` cleanup-preservation patch, focused
Agent tests and a no-network synthetic probe. No product files were edited.

## Decision

The confirmed P2 that cleanup could replace an observed budget failure and
lose its usage receipt is **closed**. No new confirmed P0/P1 was found in this
bounded review. This is not a diagnosis of the actual research thirteenth
trial 1 failure and does not turn any failed evaluation into a pass.

## Original evidence

The independent `/tmp/get9-review-cleanup-receipt.mjs` probe supplied a fake SDK
iterator with one assistant receipt (1000 input, 2 output; budget 100) and a
throwing `return()`. It used no network. Before the patch, the final result was
`CLAUDE_HARNESS_RUN_INTERRUPTED` with no receipt, replacing the expected token
budget failure. The original probe remains unchanged.

The thirteenth live artifact records 14 tool calls and a generic interruption
without a usage receipt. That is consistent with, but does not prove, cleanup
masking. Its original cause, exact usage and cleanup stage remain unknown.

## Re-review

The inner execution path retains its primary typed failure. Each close,
iterator return, warm SDK disposal and workspace disposal is now independently
attempted; a failure does not skip the following operation. Cleanup diagnostics
append only a finite `cleanupFailures` code, never a raw error message. The
existing receipt's usage, primary failure classification and incomplete-usage
marker survive secondary failures.

A successful SDK terminal result followed by cleanup failure is rejected as a
typed failure retaining the real terminal usage. Text and structured output
are excluded from that failure receipt. It cannot become a successful result
merely because model generation finished. Known allowlisted failure codes such
as `SESSION_STORE_UNAVAILABLE` survive; arbitrary cleanup text becomes the fixed
cleanup-failure code.

The outer continuation finalizer and observation completion are independently
attempted. An inner failure has no returned output, so continuation receives
`finish(false)`. A successful inner result may call `finish(true)`, but a failed
finalizer or observer still makes the harness reject. The backend continuation
uses the existing product transaction and savepoint, not a standalone commit;
its `finish` rollback/release and final authority fence are unchanged. No new
continuation-release omission was found. This review did not inject a database
failure or establish a new transaction-rollback integration result.

## Independent verification

- `claudeHarness.test.ts`, `claudeHarnessContinuation.test.ts`,
  `claudeHarnessAuthority.test.ts`, `claudeChatProvider.test.ts`: **34/34 passed**.
- `/tmp/get9-review-cleanup-receipt-fixed.mjs` executes the compiled harness with
  a fake iterator and synthetic continuation/observer. Budget failure remains
  `CLAUDE_HARNESS_TOKEN_BUDGET_EXHAUSTED`, with 1000 input, 2 output,
  `usageComplete=false`, unknown cost/turns still null, and four fixed failure
  codes for close, return, Session finish and observer completion.
- The same probe confirms `finish(false)`, observation completion attempted,
  one close/two iterator returns, no private sentinel in the serialized error,
  and physical removal of its private Run directory.
- The focused repository test also rejects success-plus-close-failure with
  actual terminal usage and checks physical directory removal. Continuation
  tests preserve `SESSION_STORE_UNAVAILABLE` and run finalization after cleanup.

The two iterator returns in the budget probe are the language's iterator close
on abrupt loop exit and the harness's explicit final cleanup; they are not two
model requests. Warm-disposal and workspace-disposal rejection branches are
independent by code inspection; this probe does not inject failures into those
two operations. A workspace deletion failure still retains the existing owner
journal for the existing sweeper to retry.

The parent's first failing fixture/store-code test run is retained separately;
the corrected full-suite log reports 155 passed and one skipped. This reviewer
ran only the focused checks above. Documentation validation is left to the
parent's requested final combined check.

## Limits

No model, HTTP, PostgreSQL, Simulator or stop-hook experiment was started.
No new claim is made about recovery quality, remote retry count, deadline
behavior of a hanging SDK cleanup promise, or the actual cause of a historical
missing receipt. Existing failed attempts and their unknown values remain
unchanged.
