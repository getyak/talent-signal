# GET-9 SDK navigation-state projection review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: the SDK-only projection in `claudeContactProvider.ts` and its focused
test. No product code or model execution was performed by this reviewer.

## Decision

No confirmed P0/P1 was found. The patch is a bounded attempt to reduce repeated
navigation metadata, not general lossless context compression. E05 fifteenth
remains quality **2/3**; its third SDK budget failure is unchanged.

## Boundaries retained

`apps/agent/src/claudeContactProvider.ts:18` keeps a tracker local to each Run.
The first state, changed states and all error states are returned in full.
Only an identical successful `current_state` is omitted. Error states also
update the tracker, so successful A after error B is emitted again even if A
appeared earlier. Comparison uses exact JSON serialization: reordered properties
can prevent deduplication but cannot make different serialized states equal.

The projection copies the result before omitting that single property. Original
messages, fetched text, source references, timestamps, selected identifiers in
remaining fields, and error recovery instructions are unchanged. It does not
mutate the original result or durable host observations. The model instruction
states the omission convention and explicitly denies authority to these hints.

`claudeHarness.ts:313` still checks current authority and budget around tool
execution. `screenshotContactTasks.ts:650` still checks tool availability against
current durable state before executing, with full error-state feedback on a
rejected call. The adapter still awaits the real Harness result and returns its
receipt; no terminal tool shortcut, fabricated SDK success, budget increase or
silent retry was added.

## Verification

Independent command:
`pnpm --filter @talent-signal/agent exec vitest run src/claudeContactProvider.test.ts`
passed **2/2**, including a second independent rerun after the test correction.
Parent `/tmp/get9-state-projection-tests-third.log` likewise records 2/2; the
typecheck log contains no error. The final sequence is A, A, error B, A, B. It
covers identical success omission, a changed state introduced only by an error,
restoration of A, another success-state change, evidence preservation, an
unmodified frozen top-level source object and two fresh Runs.

The original A, A, B, error B, A sequence did not isolate whether an error
updates the tracker, because successful B already did so. The reviewer reported
that gap; the final sequence above now fails if errors do not update the
tracker. This targeted regression gap is **closed**, without changing the
production projection or asserting a runtime failure that was not observed.

## Remaining limits

The adapter currently starts a fresh SDK Run without continuation. It has no
explicit callback to reset its tracker after SDK context compaction. If an old
state is omitted from the compacted context, subsequent identical successful
results may not restore it. Host guards prevent that missing navigation hint
from granting permissions; a denied call returns full current state, but
additional confusion or repair turns remain possible. No compaction was observed
in the cited batch, and this review does not establish compaction recovery.

The fifteenth third-trial trace contains 15340 Unicode JSON result characters,
of which 6576 are `current_state`; these are not token counts or additive saving
estimates. Exact-state omission may reduce repeated input across turns, but
completion under the unchanged budget still requires a complete live evaluation.
Keep original evidence and the new field-level grounding instructions intact.
Documentation checks remain with the parent's final combined run.
