# Session model trial evidence

## Outcome

Internal iOS Lab can select a task-specific admitted model and curated prompt
for one sign-in, run an ordinary product task with that configuration, inspect
actual execution and product adoption, and restore the server default. Trial
expiry, account/session isolation, concurrent selection, and interrupted
configuration requests have independent checks. This is working-tree and
Simulator evidence, not a TestFlight or production deployment.

## Native and real-provider proof

The strengthened native test selected Workspace conversation, glm-5.3, the
Concise answer preset, and a 15-minute trial. It sent one synthetic “Hello”
through the actual product composer with the same authentication session.
The model answer appeared in the conversation; Lab recorded `accepted`; the
native stop action then produced a `stopped` receipt. The
[sanitized receipt](live-adoption-proof.json) records one real provider request,
4,210 ms, reported usage of 1,642 input / 44 output tokens, and matching prompt
revision `fcefdb96a6b8ec4b`. These measurements establish configuration and
execution, not comparative quality, representative latency, or product benefit.

| User task | Native evidence |
| --- | --- |
| Select a task, model, preset and duration | [Configuration](native-trial-configuration.png) |
| Receive the model answer in the product | [Conversation](native-model-answer.png) |
| Distinguish execution from adoption | [Execution result](native-execution-result.png) |
| Restore new tasks to the default | [Rollback receipt](native-restored-default.png) |

An earlier real run exposed a failure: its adapter reported completion but
the product rejected the final output and showed a local fallback. The initial
test checked only execution and therefore passed incorrectly. Preserve the
[original metadata](initial-fallback-observation.json) and
[fallback screenshot](initial-local-fallback.png) as failure evidence. The exact
upstream content was not retained, so its rejected field shape is unknown.

The fix supplies the canonical output schema to non-baseline Agent presets,
validates the structured result, and records product adoption after the
product transaction succeeds. The original baseline prompt remains unchanged.
Older observations without adoption metadata render as unverified. A synthetic
invalid-shape counterexample now proves that a successful HTTP response can
still produce a failed provider result and product fallback, with no second
call using a different prompt. The strengthened native test also requires
`product_outcome=accepted` and rejects the known local-fallback presentation.

Exactly two real requests were made across the initial and corrected runs.
The initial process had a two-request ceiling and used one; the corrected
process had a one-request ceiling and used one. Only synthetic fixture data
was used. Provider credentials were passed in memory from the already admitted
internal provider to an owned loopback API; no credential values were printed
or written to these artifacts. One real model was configured. No superiority
between models or online A/B effect is claimed.

## Deterministic and database evidence

- 33 focused backend tests passed, including existing provider behavior, exact
  prompt identity, input capability checks, tool/scope preservation, cancellation,
  zero-call local lookup, invalid output, and forbidden alternate-template retry.
- [20 integration checks](database-proof.json) passed against disposable
  PostgreSQL with the real product routes and provider adapter using a fetch
  fixture. They include same-user/different-session isolation, account isolation,
  stable-ID replay, expiry/default behavior, concurrent compare-and-swap,
  obsolete stop, product adoption/fallback, and disabled-capability behavior.
  Five fixture requests were made; no external provider request was made there.
- Five signed native recovery tests passed: explicit null replacement,
  lost selection response, lost stop response, changed authentication session,
  and rejection of an unverified configuration receipt.
- The native fixture journey and corrected real-provider journey passed on
  iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6. Backend typecheck, localization
  policy, and Release Simulator build passed. Localization has 1,456 keys with
  unchanged transitional and raw-call counts.

## Reproduction and limits

Apply migrations through 041 and seed an owned disposable loopback database.
`runLabTaskTrialEvaluation.ts` requires `LAB_TRIAL_EVALUATION_DATABASE_URL`.
`startLabTaskTrialProofServer.ts` provides the owned port-4329 native surface;
its default mode uses a deterministic fetch fixture. Live mode additionally
requires `LAB_TRIAL_REAL_PROVIDER_PROOF=true` and the admitted provider
configuration. `LAB_TRIAL_REAL_REQUEST_LIMIT` can lower its two-request ceiling.
Do not treat rerunning the live native test as a free test.

The Debug-only native harness shares one simulated fixture sign-in through
`TS_IOS_UI_TEST_AUTHENTICATED_SESSION`; it accepts only a matching loopback
endpoint and fixture account, validates the session with the server, and is
compiled out of Release. Native test: `LabTaskTrialUITests`; recovery tests:
`LabTaskTrialTests`. Test credentials stay outside attached receipts.

Observations contain metadata, not the objective, evidence, model answer, or
hidden reasoning. They are capped at 100 per trial and retained for seven days.
Configuration tombstones remain while their authentication session could replay
them, then expire seven days after revocation/expiry. Synthetic repository
evidence is intentionally retained beyond that runtime lifetime.

The broader [Lab plan](../../../plans/2026-09-04-lab-complete-runtime.md) remains
active. Batch experiments, CI regression consumption, guided device metrics,
composite reset, online outcome controls, and Web review are separate remaining
milestones. This proof did not exercise admitted live image models, VoiceOver,
physical-device performance, or a deployment rollout.
