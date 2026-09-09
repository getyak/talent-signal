# GET-9 chat finding schema review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: field descriptions in `contactIntakeSchemas.ts`, the shortened finish
instruction, the adapter schema assertion and one synthetic database regression.
No product code was edited or model call made by this reviewer.

## Decision

No confirmed P0/P1 was found in this bounded delta. The change clarifies the
existing chat-only evidence boundary without adding authorization, retention,
external effects, validators, budgets or evaluation exceptions. This does not
establish that the live model now follows the boundary: the fourteenth E05
batch remains quality **2/3**, with trial 3 grounding **2**.

## Source review

- `apps/agent/src/contactIntakeSchemas.ts:36`: each finding now receives local
  instructions for complete chat support, explicit speaker attribution, actual
  message IDs and one contiguous original excerpt. Marking a paraphrase as an
  inference still requires support for every factual clause.
- `apps/agent/src/contactIntakeSchemas.ts:78`: the finish description now covers
  completion and separation of public research; the findings array describes
  material developments and explicitly permits an empty array for ordinary
  introductions, background or acknowledgments. It does not require a
  fabricated no-action finding.
- `apps/agent/src/claudeContactProvider.ts:25`: the adapter passes these same
  schemas into the Harness. `claudeHarness.ts:310` supplies their Zod shapes to
  SDK tools. The focused test converts the actual Harness-bound finish schema
  to JSON schema and checks the nested descriptions; it does not independently
  observe remote model consumption of those descriptions.
- `apps/backend/src/modules/screenshotContactTasks.ts:305` and `:437`: existing
  domain checks still resolve every finding reference to original messages and
  require an exact excerpt. Public/clue references remain invalid. Free-form
  text entailment is not mechanically proved by those checks. An inference
  label does not repair missing provenance, and no keyword blacklist was added.

A speaker may discuss a website in a real chat. The field instruction explicitly
allows that as an attributed statement, without claiming the Agent independently
verified the page. This preserves legitimate evidence and avoids banning words
such as website or agreement. Public corroboration obtained during research
still belongs in separately sourced profile observations and the task summary.

## Verification and corrected test diagnosis

Independent targeted run:
`pnpm --filter @talent-signal/agent exec vitest run src/claudeContactProvider.test.ts`
passed **1/1**. Parent log `/tmp/get9-finding-schema-tests-second.log` also records
1/1. The first schema-test fixture used `inputSchema` instead of the actual
`schema` property; its failed run is retained.

The new database test first attempts an invalid public reference, then submits
the original chat statement about a website and a real commitment. The latest
source asserts the typed error object, retains the denied event, and reads back
one correctly attributed finding with final status completed. The reviewer read
`/tmp/get9-finding-domain-tests-third.log`: **17/17 passed**. The reviewer did not
rerun database tests concurrently with the parent's live evaluation.

Two prior database runs are retained. The first expected completed but saw
partial; changing that expectation to partial then revealed zero findings.
Neither result proved that a denied call permanently forces partial status.
The cause was `.rejects.toThrow()` on an invocation that resolves an error object
(`screenshotContactTasks.ts:665`). That assertion aborted the synthetic model
before its valid retry. The reviewer identified this, and the test now uses
`.resolves.toMatchObject({error: "CONTACT_CITATION_SOURCE_UNAVAILABLE"})` and
restores the completed assertion. The existing finish path explicitly resolves
its latest tool status after a corrected call; production behavior was not
changed to satisfy the test.

## Limits

The new descriptions are model guidance, not a semantic enforcement mechanism.
The regression proves source-reference rejection and legitimate attributed chat
acceptance, not universal prevention of cross-source free-text claims. The next
live batch must retain every failure and satisfy the unchanged per-dimension
quality gate; no recovery score follows from this code review. Documentation
checks are left to the parent's final combined run as requested.
