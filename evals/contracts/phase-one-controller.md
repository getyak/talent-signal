# Phase one independent controller

The controller runs outside the Python candidate generator. It owns the final
corpus, source exposure ledger, evaluator configuration, signing keys, budget,
and release authorization records. Generated candidates select bounded task
guidance and approved demonstrations; they cannot supply these trusted files.

The directory must belong to the running account with mode `0700`; inputs,
keys, and outputs use `0600`. Paths in configuration are basenames, bounded and
read with `O_NOFOLLOW`. Use a dedicated local account/container when untrusted
code runs on the same host: process separation alone is not an operating-system
security boundary. Keep this directory outside the repository and worker input.

## Reproducible offline proof

From the repository root, choose a directory that does not already exist:

```sh
node evals/contracts/create-phase-one-fixture.mjs /tmp/talent-signal-phase-one-proof
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one freeze --controller-dir /tmp/talent-signal-phase-one-proof
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one verify --controller-dir /tmp/talent-signal-phase-one-proof
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one adjudicate --controller-dir /tmp/talent-signal-phase-one-proof
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one inspect --controller-dir /tmp/talent-signal-phase-one-proof
```

`verify` performs twelve requests through the shared production serializer and
parser with an offline transport: two variants × two repeats × three final
partitions. The fixture permits only synthetic inputs. Expected categories are
`execution_integrity: pass`, `deterministic_boundary: pass`,
`semantic_quality: needs_review`, `release_conditions: not_run`. This proves
control flow, not model quality or deployment. `adjudicate` verifies and reuses
the signed original product recordings with zero new subject/judge calls.

Each invocation is a separate process. The generator never receives holdout
inputs, gold, executor keys, or review records. Signed journal checkpoints allow
restart without repeating issued paid operations. A same-host execution lease
and the shared budget controller lock prevent concurrent runs overwriting one
another. Stop, revocation, and tombstones remain available during execution.

## Frozen study and real execution

The fixture generator is the complete example of `phase-one-controller.json`,
case inputs, and the baseline/candidate files. Replace the fixture before
freezing a new authorized run; frozen state is immutable. Every run requires:

- `casesFile`: the complete study, including the development source groups
  actually used by search, and `p0`, `held_out`, `red_team` cases. Each case has
  `caseId`, `sourceIds`, `sourcePartition`, `purpose`, `referenceTime`,
  `modelInput`, `oracle`, and `slices`. `oracle` can be an expected-behavior
  proposal; it is not automatically human gold. Source overlap or identical
  input across partitions fails. Final inputs exposed to a generator or
  developer retain provenance but become ineligible for final verification.
- `exposuresFile`: current source-level events with `sourceIds`, `actorId`,
  `role` (`generator`, `developer`, `independent_executor`, `judge`, or
  `release_reviewer`), `content` (`input`, `gold`, or `failure_details`), and
  `observedAt`. Maintain this authoritative ledger when information is viewed;
  a private file cannot detect unrecorded human access automatically.
- `providerKind: real_model`, a pinned `glm-*` model, and
  `TALENT_SIGNAL_PHASE_ONE_PROVIDER_API_KEY` in the controller process. No
  provider credentials are passed to the Python worker or ordinary CI.
- `sourceBindingsFile` and `sourceBackendURL` for every private case or
  demonstration; both are `null` for an entirely synthetic corpus. The binding
  array uses `OptimizationFeedbackBinding`: `target`, `targetId`,
  `regressionId`, `contentHash`, `feedbackId`, `feedbackRevision`, `executionId`,
  `expiresAt`, and `expectationAuthority: proposal`. Source authentication comes
  from `TALENT_SIGNAL_PHASE_ONE_SOURCE_TOKEN`. Every private case must include
  `feedback:<feedbackId>` and `execution:<executionId>` in its `sourceIds` and
  match the authenticated native export's input and reference time. Final
  private `oracle` contains `expectationAuthority: proposal` and the exact
  `expectedBehaviorProposal`; it is not relabeled as human gold. Development
  demonstrations and historical search sources cannot reappear as independent
  final sources, including different feedback records from one execution.
- The original optimization `controller.json`, bindings, permit, shared
  SQLite ledger, and the **same run ID**. `budgetDatasetDigest` equals the
  original frozen `search.json` digest. The independently signed final study
  and final dataset have separate digests; they do not rename the search
  budget binding. Every search case must match a development case in the
  complete study. The search controller configuration, model, pricing, and
  permit must match the values admitted at run start.

The native source is checked before freezing or inspecting a study, before
subject/judge dispatch, before private result persistence, and before release
evidence is written. A definite withdrawal, changed revision, deletion, or
known local expiry tombstones the run and erases its copied private corpus,
examples, reviews, outputs and temporary files. Known expiry is checked before
credentials/network access. Temporary service failures block use without
claiming the source was withdrawn. Multiple readbacks prioritize any confirmed
invalidation over an unrelated unavailable service response.

Private execution also requires the original optimization controller's live
`optimization maintain --run-id <runId>` process. It checks search and final
sources every 30 seconds, including while no experiment is running; its
heartbeat must be recent and its owner PID alive. `--once` performs cleanup but
does not authorize paid dispatch. The final `sweepPhaseOneControllerSources`
hook runs without model calls and participates in the same lifecycle owner.

Final subject and judge requests use `phase: final_validation` in that same
ledger. Missing monetary authorization, exhausted budget, changed bindings,
unknown issued requests, a stopped run, or missing credentials prevent paid
execution. Only the explicit `search_finished_pending_independent_validation`
checkpoint resumes automatically. No command invents a currency, budget,
environment, or exposure scope. Private business inputs are allowed in this
authorized private evaluation boundary; fixture-only restrictions do not apply
to real evaluation.

`phase-one-frozen.json` binds the study, final dataset, exact baseline/candidate
model/prompt/policy configuration, repetitions, seed, rubric and environment.
`phase-one-executions.json` contains signed private execution checkpoints.
`phase-one-verification.json` contains a signed, content-free layered report.
The public key is trusted controller configuration, never read from the report.

## Build and CI identity

Before real final verification, apply the optimizer's generated source module
to an isolated verification checkout at
`apps/agent/src/prompts/relationship-task-selection.ts`. This is a local code
change; it does not deploy or grant production authority. The real final
controller requires that the compiled selected candidate is actually loaded,
rather than trusting candidate parameters while running a different build.

Run `phase-one ci-verify --controller-dir /path/to/controller` before `freeze`.
It executes a fixed credential-free build, runner typecheck, evaluation/agent/
backend/runner tests, P0 replay, and Python worker tests. It signs
`phase-one-ci-proof.json` only after every check succeeds and source/HEAD remain
unchanged. The proof contains the actual Git revision, source digest, emitted
runtime build digest, fixed check policy, and each check's output digest.
Source identity covers runtime/verifier source, SQL migrations, tests,
manifests, lockfile and CI workflow. Build identity covers emitted JavaScript in agent/backend/
contracts/evaluation packages. No raw check output or credentials enter the receipt. Failed-check diagnostics
are stored in a protected `phase-one-ci-diagnostic-<check>.json` file; they are
not release evidence. Test workers are capped at two. This proof binds the
SQL migration source, not the target database schema; actual migration and
database lifecycle verification remain deployment prerequisites. The proof expires after 24 hours and cannot survive a source/build
change unnoticed.

The frozen comparison's environment digest combines the declared deployment
environment and this signed CI/build evidence. A normal green CI status or
operator-supplied hash cannot replace the executed proof. Build/test proof
still has `semanticQuality: not_run` and `releaseAuthority: none`.

## Semantic assessment

Choose one explicit `semanticEvaluation` in the controller before freezing.
Both paths produce judgments rather than new confirmed candidate facts.

For actual human judgments, use `{ "kind": "human" }`. `reviewsFile` is an
array of trusted decisions containing `caseId`, `repetition`, `outputDigest`,
`comparisonDigest`, `rubricDigest`, `reviewerId`, `decisionRef`, `status`
(`pass`/`fail`), `evidenceRefs`, and `revokedAt` (`null` when active). The reviewer
must appear in `reviewers` and differ from generator/executor. Bind to the exact
recorded output, not a candidate's name or average score. Missing/conflicting
reviews mean `needs_review`. Run `adjudicate` after review changes; it makes no
paid calls. Never write a Codex judgment as a human decision.

For automatic semantic assessment, use:

```json
{
  "kind": "model",
  "evaluatorId": "independent-semantic-judge",
  "model": "glm-4.5",
  "assuranceFile": "judge-assurance.json",
  "pricing": {
    "currency": "USD",
    "inputMicrosPerMillionTokens": 1,
    "outputMicrosPerMillionTokens": 1
  }
}
```

The numeric rates above illustrate units only; replace them with the verified
contracted rates before any real run. The judge uses a fixed system policy,
temperature zero, 600 output tokens, no tools, a bounded response, and a
separately accounted inner call. It sees the frozen input, reference context,
expected-behavior proposal and actual output; no candidate author identity is
provided. The exact model returned by the provider must match.

`judge-assurance.json` is controller-owned evidence with
`schemaVersion: phase-one-judge-assurance.v1`, `evaluatorId`, `model`,
`rubricDigest`, `providerPolicyDigest`, `expiresAt`,
`calibrationSource: human_reviewed_cases`, `calibrationEligible`,
`calibrationDigest`, `injectionProbe`, `orderStability`, and `repeatStability`.
The policy digest comes from exported `PHASE_ONE_JUDGE_POLICY`; the rubric
digest comes from the frozen comparison. Calibration must refer to real
independent human-reviewed evidence, and all three probes must be `pass`.
The controller cannot generate its own assurance by asking the judge to call
itself calibrated. Missing, stale, changed, or incomplete assurance yields
`needs_review` without a judge call. No calibration evidence has been asserted
by the implementation's fixture tests.

The signed report binds the current review/assurance snapshot. Withdrawals or
changes invalidate inspection, release review, and deployment readback until a
fresh local adjudication. Model judgments are cached only under the same input
and assurance digest. Unknown judge usage remains reserved in the shared
ledger. Reports expose known/unknown subject and judge cost separately.

## Scoped release and live readback

Create `phase-one-release-controller.json` in the protected controller directory:

```json
{
  "schemaVersion": "phase-one-release-controller.v1",
  "executorId": "codex-release-reviewer",
  "keyId": "release-key",
  "privateKeyFile": "release-private.pem",
  "publicKeyFile": "release-public.pem",
  "bindingFile": "release-binding.json",
  "authorizationFile": "release-authorization.json",
  "rehearsalAuthorizationFile": "rehearsal-authorization.json",
  "environments": {
    "target": { "origin": "https://target.example", "deploymentId": "target-deployment" },
    "rehearsal": { "origin": "https://rehearsal.example", "deploymentId": "rehearsal-deployment" }
  }
}
```

These are example names, not authorization. Set actual approved deployment
IDs, origins and scope first. Release and verification use different actors,
key IDs and Ed25519 key pairs. The runtime bearer comes from
`TALENT_SIGNAL_PHASE_ONE_RUNTIME_TOKEN`. HTTPS is required except loopback;
redirects are rejected. The authenticated `/v1/lab/runtime-configuration` must
return the exact deployment ID, process identity, startup time, prompt catalogue
digest, and `relationship_task.taskConfigurationDigest` derived from the loaded
model/prompt/policy. `build_source_digest` is captured from actual emitted code
at compiled backend startup. Source-mode execution or missing build files
cannot provide that proof. Catalogue-only readback cannot prove a release.

Deployment audience is separate from the dataset access ledger. The actual
backend `TALENT_SIGNAL_DEPLOYMENT_EXPOSURE` uses
`{ "schemaVersion": "phase-one-deployment-exposure.v1", "workspaceIds": ["<UUID>"], "percentage": 100 }`.
The backend enforces this workspace allowlist on authenticated business routes.
Runtime readback includes the actual scope and `deployment_exposure_digest`;
the controller verifies both the body digest and exact authorized scope.
Unconfigured scope provides no release proof. Partial percentage rollout is
not implemented by phase one.

`release-binding.json` has every `PhaseOneReleaseBinding` field: candidate,
baseline, dataset, rubric, environment, exposure, comparison and verification
report digests; `targetEnvironmentId`; a distinct `rollbackEnvironmentId`;
and expected baseline/candidate runtime catalogue digests. Exact evaluated task
configuration digests must match every actual loaded state. An environment
label pointing to the same origin or deployment ID does not isolate rehearsal.
The binding also includes `candidateApplicationRevision`,
`baselineApplicationRevision`, `candidateBuildDigest`, `baselineBuildDigest`,
and `deploymentExposureDigest`. Candidate revision/build must equal the signed
CI proof. Baseline, rehearsal, restoration and final deployment readbacks must
match their corresponding exact build identities. `environmentDigest` in the
controller is the canonical digest of `{ targetEnvironmentId,
rollbackEnvironmentId, environments, deploymentExposureDigest }`; all four
values must match the release controller. Dataset `exposureDigest` continues to
mean access to evaluation sources and does not stand in for rollout scope.

`release-authorization.json` follows `PhaseOneReleaseAuthorization`:
`authorizationId`, `reviewer: { actorId, kind: codex|human }`,
`humanDelegatorId`, `bindingDigest`, `allowedAction: deploy_candidate`,
`grantedAt`, `expiresAt`, and `revokedAt`. A Codex reviewer can record a scoped
decision under the user's existing delegation; per-version human approval is
not required. The record cannot broaden that delegation. Candidate generation,
judge output, build success and Opik labels have no release authority.

`rehearsal-authorization.json` has `authorizationId`,
`allowedAction: rehearse_rollback`, `bindingDigest`, `environmentId`,
`humanDelegatorId`, `grantedAt`, `expiresAt`, and `revokedAt`. Within that exact
scope, load baseline, candidate, and restored baseline in the rehearsal
environment and run the corresponding observations:

```sh
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one rollback-baseline --controller-dir /path/to/controller
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one rollback-candidate --controller-dir /path/to/controller
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one rollback-restored --controller-dir /path/to/controller
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts phase-one release-review --controller-dir /path/to/controller
```

These commands observe live states; they never execute deployment scripts.
Each observation is signed and survives process restart. Rehearsal requires
three distinct processes in chronological order and the exact baseline
revision after restoration. The target remains on baseline until approval.

Release review requires all independent real-model safety/semantic gates,
paired non-regression, complete budget accounting, current source/review
provenance, the signed rehearsal and exact authorization. It writes a signed
decision and a reviewable source proposal for
`apps/agent/src/prompts/relationship-task-selection.ts`. Global builds can
contain synthetic demonstrations only; private examples remain permitted for
private search/evaluation, and require a newly evaluated deployable candidate
before global release. This prevents copying one workspace's facts into every
workspace's prompt.

Install the approved source in the authorized build/deployment workflow, then
run `release-readback`. It checks that the exact candidate was loaded after
approval. `release-inspect` authenticates a saved decision and current authority
without claiming deployment occurred. Environment changes, revoked decisions,
review withdrawals and stale loaded configurations fail closed. In-flight
requests retain their captured configuration snapshot.

## Retention and deletion

`phase-one tombstone --controller-dir /path/to/controller` permanently blocks
the run, deletes its private execution/report files and their crash-left
temporary files, and tombstones the original paid budget run. SQLite serializes
deletion against late writes. Controller-owned copied private cases/examples
are replaced with digest-only tombstones; copied review records are cleared.
The original native product source remains with its canonical retention and
deletion owner. The lifecycle maintainer performs this cleanup when source or
controller retention expires, even while no experiment is running. Without a
live maintainer private execution is unavailable; `expiresAt` alone is not a
background deletion scheduler.

Ordinary CI provides no model credentials and records semantic/release status
as `not_run`. Real model quality, calibrated judge evidence, an authorized live
rehearsal and actual deployment readback are separate operational proofs.
