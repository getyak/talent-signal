# Phase-one optimizer worker

`worker.py` runs with Python 3.11 or later and uses the Python standard library
only. It is a finite coordinate-search algorithm, not the Opik Optimizer SDK.
There are no third-party Python dependencies to pin. The TypeScript parent
spawns it with isolated Python mode in a disposable working directory and sends
only approved dev demonstration IDs and candidate fields over JSON Lines.

The worker selects task guidance and dev demonstrations; it cannot alter the
bundled rules, tools, authorization, identity policy, model parameters, oracle,
rubric, hidden partitions, or release decision. The parent validates every
candidate again before dispatch to the shared production relationship-text
provider. All paid requests are governed individually by the durable ledger.

Run `python3 -m unittest discover -s apps/eval-runner/optimizer -p '*_test.py'`.
TypeScript tests also exercise the child-process protocol, production HTTP
serialization/parser with a deterministic fake transport, checkpoints and
recorded replay. Fake transport results are not live model quality evidence.

## Controller commands

The CLI dispatches `optimization <command> --controller-dir <directory>
--run-id <opaque-id>`. Supported commands are `start`, `status`, `stop`,
`resume`, `revoke`, `tombstone`, `run`, `replay`, `import-feedback`, `source-sweep`,
and `maintain`. `run` only accepts the
configured pinned GLM model and the controller's provider credential. There
is no CLI fake-provider switch. Tests inject an offline transport explicitly.
Set the credential in `TALENT_SIGNAL_PHASE_ONE_PROVIDER_API_KEY`; the CLI never
prints or writes it to the run artifacts or budget ledger.

The operator owns one private controller directory for the billing scope.
Its `controller.json` uses this exact shape:

```json
{
  "schemaVersion": "optimization-controller.v1",
  "ledgerFile": "budget.sqlite",
  "permitFile": null,
  "bindingsFile": "bindings.json",
  "model": "glm-4.5-flash",
  "pricing": null,
  "searchFile": "search.json"
}
```

`permitFile: null` and `pricing: null` deliberately leave paid execution
unconfigured. An operator supplies the monetary permit and the pinned model's
verified currency and integer input/output micro-units per million tokens.
No price, currency, billing scope, or deployment scope is inferred by the
optimizer. Every run and final verifier for that scope shares `budget.sqlite`;
changing a run ID does not reset monthly usage. File references must be local
basenames; controller JSON reads reject symlinks and oversized files.

`bindings.json` fixes `baselineDigest`, `datasetDigest`, `evaluatorVersion`,
and `optimizerVersion`. The baseline digest is the canonical digest of
`optimizationConfiguration(model, baseline, examples)`. The dataset digest is
the canonical digest of the complete `search.json`. It does not claim to be a
heldout dataset digest; final verification separately freezes and signs its
own final-only dataset while retaining the same budget-run bindings. The
current versions are `relationship-boundary-search.v1` and
`bounded-coordinate-search.v1`.

`search.json` uses `optimization-search-input.v1`, a validated `baseline`,
approved dev `examples`, `maximumTrials` (1–32), `repetitions` (2–10),
`timeoutMs` (100–3600000), and 1–100 cases. Each case has an opaque `caseId`,
`sourcePartition: "dev"`, `purpose: "development"`, `referenceTime`, an
`optimization-relationship-input.v1` `modelInput`, and a local `oracle` with
`allowedKinds` and `requiredCitationIds`. The worker receives candidate fields
and example IDs only. The product receives only model input and frozen
configuration. Neither receives the oracle. This deterministic evaluator
checks answer shape and citation requirements; semantic quality remains
`not_run` and release authority remains `none`.

## Recovery and release artifacts

`start` persists the controller, pricing, permit, and input binding. Changing
them invalidates resume and final verification. Each new trial consumes one
atomic candidate admission, independently of paid-call dimensions. Repeated
admission of the same trial does not consume another candidate. Every real
product request reserves and issues its own paid operation before network I/O.
The final-validation allowance stays held when search stops.

The controller saves an immutable product recording after each attempt and a
search checkpoint after each trial under `runs/<run-id-digest>/`. Recovery
replays known recordings and completed trial prefixes. If a paid operation was
issued but its recording is missing, the controller stops; it does not repeat
the charge. An unknown outcome keeps its reservation. `stop` checkpoints and
causes an active controller to abort through polling; revocation and deletion
also deny further admission. `tombstone` deletes run artifacts while preserving
the spend ledger. Artifact writes serialize against the ledger tombstone so
late output cannot restore deleted artifacts. `replay` validates local records
without starting Python or dispatching any model request.

One persistent controller owner fences concurrent `run` commands. A live PID
is never displaced; an owner whose PID no longer exists can be recovered. This
fence does not block stop, revocation or deletion. Budget admission failure
does not emit a product execution recording, so a competing process cannot
overwrite an issued request with a fabricated failed receipt.

Completed search emits `candidate-release-input.json`, including exact
configuration, search digest and reviewable source-module text. The default
production selection is `apps/agent/src/prompts/relationship-task-selection.ts`.
The backend and evaluation adapter use the same configuration builder and
actual prompt serializer. Installing a candidate means reviewing the
independent verification and exact release scope, replacing that source
selection, rebuilding, and comparing the new process's loaded task digest;
this search command performs none of those release actions.

Private business examples may participate in the authorized private experiment.
They cannot be embedded in the account-agnostic production source module:
the renderer and the startup loader both reject them. Such a best candidate
keeps its private experiment evidence but emits `sourceModule: null`. Synthetic
dev demonstrations can be included in a reviewed source release. Ties, failed
gates and no improvement retain the baseline.

## Feedback lifecycle and private observation

Set the controller's optional `sourceBackendURL` to the authorized HTTPS or
loopback backend origin. Supply its scoped token through
`TALENT_SIGNAL_PHASE_ONE_BACKEND_TOKEN`. Start the zero-model-cost maintenance
process before importing private content:

```sh
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts optimization maintain \
  --controller-dir /private/controller --run-id lifecycle
```

Keep this process under the same service lifecycle as the API and private
controller storage. It independently sweeps search and final-verification
sources every 30 seconds and immediately rechecks after watched input changes.
A temporary failure in one sweep does not skip the other. A successful sweep
records a heartbeat bound to its owner PID; private import and every private
model dispatch require a still-live owner and a heartbeat less than 60 seconds
old. A restarted maintainer sweeps before admitting work. `maintain --once`
performs the same cleanup for inspection/testing but does not authorize paid
execution. No provider credential or model request is used by maintenance.

With maintenance active, import the frozen original task from an already saved
native feedback regression:

```sh
pnpm --filter @talent-signal/eval-runner exec tsx src/cli.ts optimization import-feedback \
  --controller-dir /private/controller --run-id next-run --regression-id REGRESSION_UUID
```

Import is admitted only before the controller has a non-tombstoned run. It
reads the authenticated native export twice, verifies content and original
input hashes, and binds the exact regression ID, feedback revision, execution,
reference time and expiry. It updates the frozen search digest. Expected
behavior remains a separate `feedbackProposals` entry with
`expectationAuthority: "proposal"`; it is never inserted into model input or
converted to a deterministic gold answer. Every private case or example must
have an exact `feedbackSources` binding. A private example's demonstration is
the canonical `optimizationDemonstrationFromFeedback` representation, so it
cannot borrow an unrelated live source as its retention authority.

The controller reads current source exports before executing, resuming,
replaying, dispatching each model request, saving its response, and publishing
each checkpoint. A missing/deleted/expired source or changed content/revision
tombstones every run for the affected dataset, removes their private artifacts,
and replaces the corresponding controller search copy with a content-free
tombstone. Budget usage survives. Known expiry is checked locally even if the
backend is offline, including after an interrupted input/binding update.
Authentication outages, HTTP 503 and network timeouts instead checkpoint work
without deleting its source copy or treating the request as a new retry.

For private Opik observation, set `observationScope` to
`{"workspaceId":"SOURCE_WORKSPACE","authorizationScope":"REGISTERED_SCOPE"}`
and use the existing `TALENT_SIGNAL_OPIK_RUNTIME_POLICY` and `OPIK_API_KEY`.
The controller uses that private destination and its own `runtime-outbox`
directory. The actual shared production provider emits parent/model spans;
Python has no separate model or export path. Every observation binds all
private dependencies of that request, including selected demonstrations on
synthetic cases. Export and retry revalidate those sources, and source
retraction deletes local content and requests remote deletion. Unknown or
missing configuration is reported as unavailable/unconfigured, never as a
verified export.

Maintenance also retries the durable observation queue after Opik recovers,
including remote deletion receipts. It installs the same source validator
before retrying and runs export separately from source checks; a slow or
unreachable Opik does not delay source cleanup or the maintenance heartbeat.
No product/model request is repeated to repair an observation export.
