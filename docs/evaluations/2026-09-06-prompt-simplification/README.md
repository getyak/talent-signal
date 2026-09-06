# Compact prompts and useful autonomy

Status: complete on the 2026-09-06 working tree; local backend deployed and verified.

## Change

[Product prompts](../../../apps/agent/src/prompts.ts) now share a small source
module. Relationship Ask can provide partial answers, alternatives, requested
question counts, and unsent drafts. General conversation can give substantive
recruiting guidance. Workspace adapters share one compact terminal protocol
instead of repeating task rules or appending a full schema only for experimental
styles. Screenshot filing retains its authorized internal work and adaptive
optional research; tool descriptions own operational details.

The [primary source record](../../../_index/sources/2026-09-06-agent-prompt-design.md)
explains the specific ideas borrowed from Anthropic, Pi, and smolagents.
This change adds no tools, no external-action authority, and no new access to
candidate records. Citation validation, contact identity gates, proposal review,
and source deletion remain host responsibilities. The relationship answer path
still uses supplied context; this work does not add autonomous evidence retrieval.

## Measurement

[Prompt sizes](prompt-size.json) record before/after character counts and hashes.
Counts are not tokenizer estimates. The workspace row includes the provider
footer; the screenshot row includes its full task JSON. Other rows describe
base task prompts. Tool descriptions are counted separately so moving a rule
does not falsely appear to remove its input cost. Runtime schemas, user context,
and tool observations are additional input.

The nine measured task templates total 15,056 → 9,662 characters (35.8% less).
Screenshot filing is 3,269 → 1,305 (60% less); including every contact-tool
description it is 5,822 → 4,017 (31% less). Workspace conversation including
its terminal instructions is 1,974 → 1,280 (35% less). The short company-research
prompt changed little. The native and vision-extraction prompts also changed,
but are outside this aggregate.

## Model comparison

The [synthetic comparison runner](../../../apps/backend/src/evaluation/runPromptComparison.ts)
uses the actual Chat adapter with six fixed synthetic cases and paired baseline
and current prompts. It alternates order, keeps model/parameters unchanged,
records errors, and neither reads a database nor exposes tools. The
[baseline](comparison-baseline.json) contains only product prompt text.

The [initial comparison](model-comparison-initial.json) exposed an old fixed
three-question limit and a new overstatement of proposed context. The new
general-plan answer also timed out at the configured 15-second boundary.
The [second comparison](model-comparison-r2.json) still overstated proposed
context. The final revision uses a compact positive distinction: only blocks
marked confirmed support confirmed facts; other blocks are attributed source
reports. Unknown actors and draft dates remain unresolved. Earlier observations
remain visible rather than being overwritten.

In the [final comparison](model-comparison-final.json), all 12 calls completed
with the same admitted GLM model and unchanged 15-second timeout, reasoning,
and token settings. Reviewed observations:

- The old prompt refuses six questions and supplies three; the new one supplies
  six, in the user's language.
- Both variants can give partial analysis and two drafts. The new revision
  attributes unconfirmed source reports and uses draft placeholders. It is not
  evidence that the old model could never perform these tasks.
- Both can produce general meeting plans. Each had one timeout in an earlier
  round; the final pair completed. Concision is not a timeout guarantee.
- Source instructions did not cause messaging or override the task; both
  variants declined personality/probability judgments. The final new response
  kept the source uncertainty explicit in these cases.
- Across the final six cases, reported input tokens fell from 3,028 to 2,480
  (18.1%). Median call duration increased from 7,405.5 to 9,622 ms. This change
  demonstrates reduced input and a removed question limit, not faster inference.

These are small human-reviewed observations, not a calibrated model-quality
score. Interpretations and general recruiting advice can still be speculative;
the draft and source-status distinction remains material. No actual contact
tool execution or native Foundation Models inference was part of this probe.

## Verification

- Agent package: 9 files, 55 tests passed.
- Backend conversation/provider/preset/Pursuit tests: 5 files, 58 passed,
  including direct drafts, six questions, partial answers, invalid outputs,
  ambiguous identity, and unauthorized citations.
- Web evidence/extraction/receipts: 4 files, 36 tests passed; Web typecheck and
  changed-file ESLint passed.
- Isolated PostgreSQL: all 7 screenshot-contact integration tests passed,
  including identity ambiguity, exact quotes, private-query/deletion rejection,
  idempotency, cancellation, source invalidation, and recovery.
- Native target compiled and both targeted suites passed: 79 tests, zero
  failures. The broader `scripts/ios/check.sh` stopped at a pre-existing
  localization gate (213 raw SwiftUI literals versus an allowance of 210);
  prompt edits added no UI literals. Targeted Xcode tests were run independently.
- Backend and Agent Host rebuilt in Linux; local backend/Web typechecks passed.
- Wiki tests: 8 passed; `pnpm docs:check` and scoped whitespace review passed.

## Deployment

[Deployment receipt](deployment.json) records readiness and exact deployed
prompt fingerprints matching the reviewed source. Docker Hub's Node base-image
metadata request failed with a TLS timeout, including a direct pull retry.
An offline build reused the previous immutable local image after verifying
identical lockfile content and dependency declarations, copied current source,
and rebuilt backend and Agent Host. The previous image remains tagged for
rollback. The original deployment script then ran migrations, restarted both
services, and passed Chat, voice, Apple-authentication, and tailnet probes.

Backend prompts are active for the installed iOS client's server calls. Native
on-device prompt changes require a subsequent iOS app build/release; this task
did not publish a TestFlight binary. Web source and its Agent dependency are
updated and verified locally.
