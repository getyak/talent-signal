# GET-12 owner parameters and configuration handoff

Recorded on 2026-09-21 for [GET-12](https://linear.app/getyak/issue/GET-12).
The [parameter receipt](execution-parameters.json) records the direct owner
reply, not a model-generated spending recommendation or an active runtime permit.

## Confirmed inputs

The owner answered **"人民币，没有上限"**: currency **CNY**, with **no per-run or
monthly monetary ceiling**. This covers generation, subject calls, judges,
nested calls, retries and final validation. No numeric budget answer remains
outstanding. The existing issue selected **DeepSeek V4.1 Flash** and included
**production and the existing product audience** in the release scope.

The permission is for the existing private improvement loop. It does not
remove source authorization, independent verification or exact-candidate
release review. It does not authorize billing-account top-ups or subscriptions.
Resource bounds, stop/revoke, usage accounting and unknown-outcome handling
remain active even when both monetary ceilings are unlimited.

## Observed configuration

The existing Opik UI at `http://localhost:5173` returned HTTP 200; its seven
existing Compose services reported healthy. A read-only projects request to
`http://localhost:5173/api/v1/private/projects` with workspace `default`
returned the three Talent Signal projects named in the receipt. No instance
was created or restarted. These checks establish reachability, not new trace
export, deletion, or semantic-quality evidence.

Infisical `dev:/shared` has a DeepSeek key and currently selects
`deepseek-v4-pro` at `https://api.deepseek.com`. A credential-injected GET to
`/models` returned HTTP 200 and both `deepseek-flash` and `deepseek-v4-pro`;
no inference request was made. No secret value was printed or copied.
The shared model remains unchanged. `dev:/evaluation` returned a missing-folder
404; the manifest's credential ownership does not prove that folder exists.
Other Infisical environments were not inspected.

## Apply to the private controller

In the owner-only permit referenced by `controller.json`, set `currency` to
`CNY`, `runLimits.amountMicros` to `"unlimited"`, and
`monthlyLimits.amountMicros` to `"unlimited"`. The
[optimizer contract](../../../apps/eval-runner/optimizer/README.md) owns the
full permit/controller format and resource requirements. This receipt is not
that format: do not load it as `permitFile` or substitute it for the trusted
authorization store. Create the actual permit with the frozen study bindings,
resource limits, validity interval and shared persistent `budget.sqlite` when
GET-18 prepares its run. Do not reset spend by choosing a new ledger.

`null`, an omitted field, zero, infinity, or a large sentinel number must not
stand in for explicit unlimited authorization. Reservations, measured usage
and final-validation reserves remain finite integer millionths of CNY.

As observed on 2026-09-21, DeepSeek's
[official CNY pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)
lists Flash peak input cache-miss/output prices of CNY 2/8 per million tokens;
off-peak prices are CNY 1/4, and peak cache-hit input is CNY 0.04. For
conservative admission, the peak cache-miss bound corresponds to
`inputMicrosPerMillionTokens: 2000000` and
`outputMicrosPerMillionTokens: 8000000`, in CNY. Recheck prices when freezing
the run. A reservation using peak rates is not an exact provider bill: the
adapter must distinguish measured tokens, cache/time-dependent pricing and
estimated cost rather than label all usage as a measured charge. Do not
relabel CNY amounts as USD in comparison reports.

## Execution-task handoff

- **GET-18:** adapt both the subject provider and judge from their current
  GLM/BigModel-only implementations; use `deepseek-flash` without changing
  the shared Pro configuration. Bind the pricing and requested/returned model
  metadata, provision only the required controller credentials, freeze the
  dataset and common budget ledger, then run and verify the experiment. The
  `/models` receipt is not subject/judge compatibility or calibrated quality.
- **GET-20:** use production-inclusive scope for the current product audience;
  resolve and freeze its actual workspace UUIDs with `percentage: 100` under
  `TALENT_SIGNAL_DEPLOYMENT_EXPOSURE`. Do not replace the allowlist with a
  wildcard, silently enroll future workspaces, or infer a separate staging
  environment. Prepare the independent rollback rehearsal, review the exact
  candidate/build and verify release/restoration from the real runtime.
  Private business demonstrations still cannot enter a shared source bundle.

GET-18/20/21 and GET-11 retain their own execution acceptance. Recording these
inputs and supporting explicit unlimited money does not assert a paid
improvement, production candidate release or subsequent observed outcome.

The authenticated Linear UI read back both dated handoffs:
[GET-18](https://linear.app/getyak/issue/GET-18#comment-f264ee82) and
[GET-20](https://linear.app/getyak/issue/GET-20#comment-a3d03f85).

## Local implementation verification

The updated budget ledger accepts the exact `"unlimited"` limit while retaining
finite accounting and every other resource/admission check. Existing numeric
permit objects gain no default fields, preserving their stored identity.
The owner receipt itself is not consumed as a permit.

- Runner typecheck passed.
- 112 tests passed across budget, optimization controller, phase-one judge and
  phase-one controller suites. They cover CNY/unlimited persistence, finite
  cap compatibility, mixed ceilings, monthly-policy edits, finite reservations,
  non-money resource admission, unknown outcomes/retries and overflow.
- Documentation/architecture checks and whitespace validation passed after
  integration. Independent review found no confirmed P0/P1/P2 in the actual
  implementation and documentation diff. Hosted current-head checks remain
  the merge gate recorded on the PR.

These tests use controlled transports and temporary local ledgers. They are
not evidence of a funded DeepSeek comparison, exact provider billing, a
calibrated judge, or a production candidate release.
