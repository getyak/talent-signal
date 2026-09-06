# Durable Lab batch evidence

## Outcome

Internal iOS Lab now runs a frozen set of synthetic relationship-text cases
against two admitted model/prompt configurations, with repetitions, call limits,
per-attempt results and review. The server owns execution while the app is
closed. Recovery reads the same ID; cancellation preserves completed output;
uncertain provider attempts are never automatically repeated. This is source
and Simulator delivery, not deployment or a TestFlight release.

## Real native execution

The [real receipt](live-batch-proof.json) records a native-created batch with
one synthetic conflicting-evidence case, one run per configuration, and exactly
two actual glm-5.3 requests. The app was terminated and relaunched before reading
the same batch, opening its model answer, and saving an inconclusive review.

| Configuration | Actual prompt revision | Provider duration | Reported input / output tokens |
| --- | --- | --- | --- |
| Baseline | `5f3810075c9e2fed` | 3,895 ms | 630 / 183 |
| Concise | `2f9d86340d819cb3` | 3,054 ms | 659 / 161 |

Both results passed the bounded output and authorized-citation checks. Semantic
review remains unknown and batch quality remains `needs_review`. These two
samples prove execution and configuration, not superior model quality,
representative latency, or product benefit. The saved review was written by UI
automation on synthetic fixtures, not a recruiter study.

Native evidence: [configuration](native-configuration.png),
[recovered batch](native-recovered-batch.png),
[actual model answer](native-model-answer.png), and
[persisted review](native-review.png). Screens use English UI with the original
Chinese synthetic case and model output. Provider credentials were passed only
in memory from the already admitted internal provider; the proof process had a
two-request ceiling and has been stopped.

## Recovery and failure evidence

- [26 PostgreSQL checks](database-proof.json) passed using the real routes and
  provider adapter with a deterministic fetch fixture: frozen definitions,
  stale catalogs, stable-ID replay/conflicts, account/user isolation, legacy
  exclusion, two-worker ownership, actual prompt identity, budgets, queued and
  in-flight cancellation, graceful shutdown, unknown/late-result recovery,
  closed provider failures, expiry and content scrubbing. There were 16 fixture
  requests and zero external model requests in these checks.
- 22 focused backend unit tests passed across the new runner and existing Lab
  experiment, task-configuration and runtime-manifest boundaries. Five signed
  native store tests passed for lost start/cancel responses, relaunch/scope,
  unknown state, configuration rejection and historical selection.
- The native fixture journey ran two cases, two repetitions and two
  configurations (eight calls), relaunched, inspected output and saved review.
  Its cancellation journey completed only the already dispatched call and
  cancelled the unissued call. The final test refreshed and verified the
  rendered Cancelled status and retained result count. See the
  [fixture receipt](native-fixture-proof.json), [matrix result](native-matrix-result.png)
  and [cancellation readback](native-cancelled-batch.png).
  Fixture results cannot establish model quality.
- Backend typecheck, iOS localization policy and Release Simulator build passed.
  Localization has 1,547 keys with unchanged transitional and raw-call counts.
  Native tests used iPhone 17 Pro Simulator, iOS 26.5, Xcode 26.6.

Two observed failures changed the implementation. PostgreSQL JSONB reordered
object keys and invalidated a naive stringified snapshot hash; canonical hashing
now sorts object keys and preserves array order. Database and API clocks also
differed enough for an expired, scrubbed job to pass an API-time check. Readback,
cancellation, dispatch and scrubbing now use database expiry. The integration
counterexample deliberately moves the API clock one minute behind.

Native harness failures were also corrected: a switch must be operated at its
actual control; submitted IDs require committed readback; offscreen rows require
scrolling; and fixture pause gates must be released even after a failed test.
None of these fixture retries made paid model calls. The live journey passed
on its first two-call run. Subsequent live recovery is explicitly read-only.

## Reproduction and limits

Apply migrations through 042 and seed an owned disposable loopback database.
`runLabJobEvaluation.ts` requires `LAB_JOB_EVALUATION_DATABASE_URL`. Use a separate
database from any running native proof worker, since workers share a queue.
`startLabJobProofServer.ts` provides the owned port-4329 native surface; its
default uses a fetch fixture. Real mode additionally requires
`LAB_JOB_REAL_PROVIDER_PROOF=true` and an admitted provider, and permits at most
two requests per process. Use a fresh database when changing fixture/real modes.

Native test: `LabJobUITests`; recovery tests: `LabJobTests`. The Debug-only
shared authentication harness is documented in the
[session-trial evidence](../2026-09-04-lab-task-trials/README.md). Tokens are not
included in attachments. Runtime input/output retention is seven days; these
explicitly synthetic repository artifacts are retained as implementation proof.

Batch execution currently covers relationship text. Image/Agent batch adapters,
immutable saved regression cases and exact-version CI consumption remain open
in the [complete Lab plan](../../../plans/2026-09-04-lab-complete-runtime.md).
Saving a preference or failure category does not enforce a release check.
Guided device diagnostics, expanded appearance/reset workflows, observation
controls and Web comparison remain separate unfinished milestones.

Owned cleanup: the port-4329 proof API was stopped, and the disposable
PostgreSQL container and its three synthetic proof databases were removed
after exporting these artifacts. Shared internal services were not changed.
