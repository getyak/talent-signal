# Private Opik improvement loop

This playbook implements the boundary in [ADR 0015](../decisions/0015-private-evaluation-and-delegated-prompt-improvement.md).
Use the existing private Opik instance. Business content is permitted inside
the owner's authorized private evaluation scope. A second per-case approval or
synthetic reconstruction is not required. Candidate generation, evaluation,
release review and business-action authority remain separate.

## What each result proves

| Result | Meaning |
| --- | --- |
| Local completion | The frozen run finished and its immutable artifact exists. |
| Projection receipt | Opik readback agrees with that artifact; a failed projection does not rerun the task. |
| Deterministic checks | Serialization, citations, scope, state and recovery boundaries passed. |
| Semantic judgment | A qualified evaluator assessed the actual output against frozen evidence. |
| Independent verification | A separate controller signed the exact comparison, dataset and rubric. |
| Release readback | The target actually loaded the approved task configuration and application revision. |
| Later observation | An owner reported what happened within a defined exposure window. |

`not_run`, `needs_review`, `unavailable`, unknown cost and missing observations
are meaningful states. A deterministic fake transport proves plumbing; it
cannot certify semantic quality or authorize a release. A green ordinary PR
check does not mean a funded model comparison or deployment occurred.

## Correct an answer

In a signed-in canonical Session, use **Correct answer** beside the response.
Choose fact, person, time or unsupported-suggestion error, or distinguish a
preference and a later change. An optional expected answer stays a proposal.
Saving waits for server readback; retries preserve the same operation and a
newer device revision requires reload. Saved feedback can be withdrawn even
after its original source becomes unavailable.

The backend binds feedback to the actor, Session turn, original execution,
output hash, reference time, model and captured prompt. Eligible relationship
text failures produce private development regressions for the existing Lab
rerun path. Historical answers without an execution snapshot are explicitly
unavailable. Thumbs, clicks, preferences and later changes do not create
factual gold. Withdrawal, source removal, identity change and expiry invalidate
derived cases and their descendants. Later observations record exposure,
versions, window and missing/late/censored states; they make no hiring-causality
claim.

## Recover an Opik projection

Use the same project, local artifact directory and projection ledger as the
original replay. `opik-export` reads its captured completion and invokes no
model or task executor. Dataset synchronization or remote recovery must not
change the dataset digest attached to the original run.

```sh
OPIK_PROJECT_NAME=PROJECT pnpm --filter @talent-signal/eval-runner opik:export \
  --run-id RUN_ID --artifact-dir /private/results \
  --ledger-dir /private/projection-ledger --owner-controlled
```

The CLI's existing Opik destination settings and owner-controlled-instance
flag still apply. Read the typed receipt: unreachable service, authentication,
missing dataset and digest conflict require different repairs. A repeated
successful export reuses its receipt. `opik-delete` records a tombstone before
cleanup, retries failed deletion, and exits unsuccessfully until absence is
verified. Keep tombstones so a late completion cannot recreate the projection.

## Configure bounded optimization

Create an owner-only controller directory outside the repository. Keep one
durable SQLite ledger for the entire budget scope and all its runs; a new
run, worker or month readback must never select a fresh ledger to reset spend.
Controller files bind baseline, dataset, evaluator and optimizer versions.
The permit supplies currency, per-run and per-month monetary/resource limits,
concurrency and a reserved final-validation allowance. Missing money, pricing
or credentials leaves paid execution unconfigured.

```sh
pnpm --filter @talent-signal/eval-runner optimization start --controller-dir /private/controller --run-id RUN_ID
pnpm --filter @talent-signal/eval-runner optimization run --controller-dir /private/controller --run-id RUN_ID
pnpm --filter @talent-signal/eval-runner optimization status --controller-dir /private/controller --run-id RUN_ID
pnpm --filter @talent-signal/eval-runner optimization stop --controller-dir /private/controller --run-id RUN_ID
pnpm --filter @talent-signal/eval-runner optimization resume --controller-dir /private/controller --run-id RUN_ID
```

`replay` reads recorded trials without execution; `revoke` invalidates the
permit; `tombstone` stops admission and removes run artifacts. Unknown provider
outcomes retain their reservation and cannot be paid-retried automatically.
Every model request, candidate and final check consumes the shared ledger.
Inject `TALENT_SIGNAL_PHASE_ONE_PROVIDER_API_KEY` only into the trusted
controller, never the Python worker, a case, a report or command-line text.

See the [optimizer instructions](../../apps/eval-runner/optimizer/README.md)
for controller inputs and the bounded Python search. It uses the same
relationship provider, serializer and parser as the product. The initial
search varies registered task guidance and approved dev demonstrations. It
does not use the Opik Optimizer SDK or certify other task families.

Before importing feedback, start `optimization maintain` under the controller's
service lifecycle. It checks search and final-verification sources independently
every 30 seconds and on input changes. Private imports and model dispatch require
a live maintenance owner and fresh successful sweep. `maintain --once` cleans
up but grants no execution authority. Known expiry removes content even while
the backend is offline; temporary service failures pause work. The optimizer
instructions specify the authenticated `sourceBackendURL`, token and exact
feedback bindings. Each selected private demonstration is a source dependency,
including when the current case is synthetic.

## Verify and release

Freeze a globally partitioned study before searching. Related source groups
cannot straddle dev and final partitions. The generator receives dev inputs;
final P0, held-out and red-team cases stay with the independent controller.
Repeated paired comparisons preserve exact inputs, reference time, candidate,
baseline and rubric. Exposed holdouts lose independent status. Critical
regressions veto promotion regardless of average score.

```sh
pnpm --filter @talent-signal/eval-runner phase-one freeze --controller-dir /private/controller
pnpm --filter @talent-signal/eval-runner phase-one verify --controller-dir /private/controller
pnpm --filter @talent-signal/eval-runner phase-one inspect --controller-dir /private/controller
```

Use the controller's trusted keys and authorization store; keys or approvals
supplied by a candidate artifact have no authority. Release scope must name
the target and exposure, with an independent rollback rehearsal environment.
Model judgment requires measured calibration, injection, order and repeat
assurance; missing assurance cannot pass a critical semantic gate. A Codex
release review is separate from the generator and judge.

Approved candidates become reviewable source-controlled task selections and
application builds. Private business demonstrations can be evaluated within
their scope but cannot be embedded into a global, cross-account source bundle.
Such a candidate requires a distributable selection and new verification.
Changing an Opik label never activates code. The authenticated internal
`/v1/lab/runtime-configuration` readback reports the actual loaded model/task
digest, bundled catalogue, process identity and application revision. In-flight
tasks retain their captured snapshot. Release and rollback must match their
approved configuration, not just a build exit code.

The release candidate's checkout must run `phase-one ci-verify`. Its signed
proof binds the fixed checks, application revision, implementation source and
emitted runtime build. Runtime readback captures the emitted build digest at
process startup; a source-mode process or incomplete build reports unavailable.
The final controller rejects stale builds and source changes. See the
[controller contract](../../evals/contracts/README.md) for signing, independent
review and the baseline → candidate → restored rollback commands.

Deployment exposure is separate from the study's holdout-exposure digest.
Set `TALENT_SIGNAL_DEPLOYMENT_EXPOSURE` to an explicit JSON object with
`schemaVersion: "phase-one-deployment-exposure.v1"`, `workspaceIds` containing
the admitted workspace UUIDs, and `percentage: 100`. Phase one supports that
exact workspace allowlist; other percentages fail startup validation. A changed
task selection requires this scope. Authentication rejects workspaces outside
it before handlers run, and runtime readback reports its captured value and
digest. A baseline process with no exposure configuration keeps its existing
audience and reports no scoped-release proof.

The existing internal TestFlight Compose passes these optional scope and Opik
settings to the API and persists the outbox in its own named volume. An empty
policy leaves export disabled. The normal deployment script captures the
checkout revision when rebuilding; reuse or rollback must preserve the selected
image's original revision or report it unavailable. Backend readiness requires
the feedback migration 057 before admitting this implementation as ready.

## Observe and remove private runtime content

Runtime observation is configured separately from prompt mirroring with
`TALENT_SIGNAL_OPIK_RUNTIME_POLICY` and a durable
`TALENT_SIGNAL_OPIK_RUNTIME_OUTBOX`. The policy identifies the private endpoint,
Opik project/workspace, source workspaces, authorization scopes, retention and
content-byte bound. Use `http://localhost:5173/api` for host processes or the
fixed `http://host.docker.internal:5173/api` gateway from Docker on this Mac;
verify connectivity from the actual container before enabling it. There is
no cloud fallback. Do not point the outbox at
temporary storage or a tracked repository directory.

The product supplies source lineage to the observer. Missing lineage or a
revoked source cannot be treated as an available recording. Native parent,
model and tool spans preserve attempts, retries, versions and media status.
Tokens and cost belong to model leaves exactly once; unavailable values remain
null. Credentials are removed from content. Oversized media is reported as
omitted rather than being called complete.

Local deletion persists before remote cleanup and source validation precedes
export. Retention and source removal sweep pending writes, failed attempts and
crash remnants. Readback, retry and deletion behavior is part of the release
evidence, not an assumption about an SDK flush.

See the [dated verification](../evaluations/2026-09-07-get-11-opik/README.md)
for measured results and any execution parameters still outstanding.
