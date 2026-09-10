# GET-9 incremental independent code review

Reviewed: 2026-09-09T17:20:44.074831+00:00. Reviewer: independent sub-agent `design_review`.
Base HEAD: `56292d3c1185ed122ebde48cdec6b13bb6c4cc92`, plus the current uncommitted
and untracked implementation. Product files were read only.

## Outcome and scope

No confirmed P0/P1 was found in this bounded increment. This is not approval of
all GET-9 work or a claim that E05 eighth attempt passes. The ongoing live
attempt was not scored. Changes made after this review require their own check.

Reviewed the contact adapter's medium effort and current-state context, source
and speaker instructions, SDK timing/retry diagnostics, nullable usage through
runners/contracts and selected consumers, reviewed profile projection, and the
Web preference reload/save flow. Previously closed session/workspace cleanup
and Calendar implementation were not broadly re-reviewed.

## Confirmed remaining P2

1. **Scoped chat audit still invents zero usage on missing receipt.**
   [chat.ts](../../../apps/backend/src/modules/chat.ts#L1184) defaults both
   `remote_chat_input_tokens` and `remote_chat_output_tokens` to `0`. The nearby
   runtime observation already uses `null`, but the audit path also handles
   fallback after a failed remote attempt that may have consumed tokens.
   Use `null` for unknown audit usage and assert that a failed remote attempt
   preserves unknown counts. The owner acknowledged this and is fixing it;
   it was not closed at this review snapshot.

2. **Clarify the timing milestone.**
   [claudeHarness.ts](../../../apps/agent/src/claudeHarness.ts#L375) records the
   first SDK `assistant` message with a non-placeholder model. The pinned
   SDK 0.3.260 `SDKAssistantMessage` documentation says it emits one such message
   per completed content block, with non-final usage. Describe this as the first
   completed assistant content-block receipt, not completion of the whole model
   answer. It is also not TTFB or isolated HTTP latency. The calculation itself
   is suitable for that explicitly bounded milestone. The owner acknowledged
   the wording correction; no corrected snapshot was reviewed yet.

## Verified boundaries and earlier findings

- The main contact system prompt and `update_contact`/`finish_contact_task`
  descriptions now require field-local source coverage, exclude rejected
  namesakes from profile fields, and separate public claims from chat findings.
  Medium effort does not change tool authorization, source callbacks, original
  image handling or the existing budgets. `currentToolState` returns only the
  understanding tool before extraction and no tools after a non-running state;
  host-side invocation gates remain authoritative. These prompt changes are not
  deterministic semantic validation. The E05 seventh-attempt field-citation
  findings remain open until actual output demonstrates correction.
- Speaker attribution, chat/public-source separation and literal summary
  escapes were closed only for the observed seventh-attempt final outputs in
  [the independent E05 review](e05-seventh-quality-review.json). No eighth-attempt
  result is imported into this code review.
- SDK diagnostics collect two nullable elapsed-time milestones and at most
  30 retry records containing numeric counters/delay/status only. They do not
  copy the SDK error text, prompt, source content or credentials. Retry evidence
  is not an estimate of total HTTP requests; internal requests remain unknown.
  Success, terminal failure and interrupted receipts preserve these diagnostics.
- The new deterministic harness test covers first timestamps remaining stable,
  absent events staying `null`, duplicate assistant IDs and interruption
  receipt preservation. This closes the prior narrow timing-test recommendation.
- The three runners now preserve unknown input/output/total/cost/turns as `null`;
  totals remain unknown if a component is missing. Contract and person-research
  service schemas accept those nulls. Backend and agent-host mappings preserve
  them. Reviewed Web Lab output displays unknown, and iOS Lab models use optional
  token counts and display “Not reported.” No new nullable-consumer P0/P1 was
  found. The separate scoped audit issue above remains.
- Reviewed profile fields are reconstructed from the host's draft, replacing
  only user-edited values while retaining original excerpt/image metadata.
  Web and iOS visibly separate saved review values from source quotations.
  The snapshot remains inside the task state already cleared by task/session
  deletion and expiration; this increment introduces no separate durable copy.
  Existing tests assert edited value versus original quote and task readback;
  no database deletion test was rerun during this review.
- Web preference initial `busy=true` prevents initial-load/reload competition.
  Save retains its idempotency key across uncertain failures, checks an
  independent readback before displaying success, and offers reload after
  revision conflict. Inputs are disabled during requests. The route tests
  passed; this review did not repeat the real browser interaction.

## Independent verification

- Agent: 7 focused files, **55/55 passed**. Harness, authority, contact/chat
  providers and three usage runners.
- Web preference API route: **3/3 passed**.
- Documentation, wiki and architecture checks: passed after this artifact.
- No broad backend, database or iOS test suite was started by this reviewer.

## Outstanding delivery boundary

The owner separately reported that the unscoped Web home still rejected normal
chat through the legacy controller, and is now connecting the unscoped API,
Session and Calendar card. That new implementation is outside this snapshot and
needs follow-up review and actual UI evidence. This review therefore must not
be used as proof of complete Web conversational delivery, full iOS regression,
E05 acceptance, PR gates or overall GET-9 completion.
