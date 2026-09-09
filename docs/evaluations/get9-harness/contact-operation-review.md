# GET-9 contact operation schema review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: the uncommitted Claude contact adapter and tests, plus
[the first flat-tool lookup attempt](contact-flat-first.json).
No product files were changed; no model call or Simulator was started by the reviewer.

## Decision

No new confirmed P0/P1 was found. The confirmed P2 in the claimed extra-field
rejection behavior is closed by the raw-argument gate and the corrected boundary
description in the re-review below. The original counterexample is retained.
The three live synthetic routing trials pass their narrow handoff gate; they do
not establish native or full relationship-answer acceptance.

The adapter derives four operation schemas from `ContactWorkspaceInputSchema`,
omits the model-selected operation field and injects the host-selected operation
before invoking the existing `contact_workspace` domain seam. Search/read are
read-only; proposal operations retain their write classification. Current-message
grounding, unique same-Run identity/context selection, proposal fingerprints and
human confirmation remain enforced by the existing host. Missing read context is
now required in the actual model-facing MCP schema. The changed tool names,
schemas and descriptions also enter the existing continuation fingerprint.

## Original P2: the MCP layer strips unknown fields before adapter validation

`claudeHarness.ts` registers tools using `entry.schema.shape`. In the pinned SDK,
`createSdkMcpServer` reconstructs an object schema from that shape. Its actual
MCP dispatch validates and strips unknown fields before calling the harness and
adapter callbacks. The strict object policy from the original Zod object is
therefore not preserved at this boundary.

The independent no-network probe `/tmp/get9-review-contact-sdk-schema.mts` used
the actual pinned `createSdkMcpServer` and its `tools/list` / `tools/call` request
handlers with the same read schema. Log `/tmp/get9-review-contact-sdk-schema.log`,
exit 0, showed:

| Input | MCP result | Host callback |
| --- | --- | --- |
| Person ID only | Rejected: missing context ID | Not reached |
| Both IDs plus `reason` | Accepted, `reason` stripped | Reached once |
| Both IDs plus `operation: propose_update` | Accepted, `operation` stripped | Reached once |
| Both IDs | Accepted | Reached once |

This does not allow a read tool to execute a proposal: the adapter still injects
`read`. It does contradict the stronger claim that extra/operation fields are
rejected before any host dispatch. The direct-adapter test bypasses this SDK
normalization, so it cannot establish that claim. Add an actual MCP-dispatch
regression and preserve strict validation before normalization, or explicitly
limit the documented behavior to safe stripping plus host operation binding.
Do not weaken the host's operation or identity guards.

Independent focused tests passed: `claudeChatProvider.test.ts`,
`claudeHarness.test.ts` and `claudeHarnessContinuation.test.ts`: 24/24.
Independent Agent typecheck also passed.

## Live routing evidence

Every nested tool result in the three recorded trials was inspected. Each made
exactly one `contact_workspace_search` and one `contact_workspace_read`, with both
correct IDs, two successful results, an exact `resolved_contact_context` event,
completed SDK receipt, matching reported model and no recorded API retries.
Durations were 12.906, 17.114 and 10.958 seconds. Recovery was not exercised.

All three raw SDK prose responses still ask for clarification or describe absent
evidence access after the successful header read. The product adapter returns
the host-derived handoff block instead of that prose. Thus the recorded routing
outcome passes 3/3 without asserting that raw prose or the subsequent scoped
answer is fixed. Earlier failed proxy/native trials remain separate evidence.
The parent's initial TypeScript compile failure and later successful build are
not replaced by live execution evidence; build and runtime are separate checks.


## Re-review: raw model-argument admission

The new `PreToolUse` callback finds the exact granted capability and validates
its original `tool_input` against the capability's full Zod schema before the
SDK MCP normalization. Missing read context, additional `reason`, and a supplied
`operation` now produce a deny decision with a fixed `TOOL_INPUT_INVALID` reason.
The denial contains no rejected values or candidate content. Unavailable tools
and invalid subagent delegation still receive authorization denial; argument
validity never grants a capability. Source and budget checks still precede the
hook decision, and the existing domain and post-tool authority checks remain.

The new regression calls this actual registered callback with all three invalid
forms and observes deny with zero host calls, then allows valid arguments. It
also invokes the real pinned MCP request handler directly and explicitly verifies
that extra fields there are stripped and the fixed read handler is reached.
This separates model-path admission from the MCP layer's normalization rather
than claiming the latter rejects unknown fields. The fixed host operation and
same-Run identity checks remain the authorization backstop.

Independent checks after this fix: the three focused harness/chat/continuation
files passed 25/25; `claudeProvider.test.ts` passed 7/7; Agent typecheck passed.
The first parent full-suite run failed because an older allowed-read fixture
supplied `{}` despite required evidence references. The fixture was corrected to
supply a valid synthetic reference; the failure log is retained. The reviewer
read `/tmp/get9-raw-schema-tests-second.log`, reporting 149 passed and one skipped,
without presenting that parent-run suite as an independent rerun.

The P2 is closed for the implemented gate and its accurately stated scope.
These deterministic callback/MCP checks do not replace a live adversarial SDK
hook-control test. The recorded flat-tool live trials and in-progress native
fifth batch used the earlier code without this raw-argument hook, so their
successful routing evidence is not represented as verification of the new denial
path. No stop hook, successful-call schema, prompt, Session or budget change was
introduced by this correction.
