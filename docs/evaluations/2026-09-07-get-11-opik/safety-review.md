# GET-11 second independent safety review

Date: 2026-09-07. Status: confirmed findings repaired and independently retested.
No confirmed P0/P1 remains in this second review's inspected paths.
This reviewer changed no implementation files. Review used the current isolated
worktree, ADR 0015 and the [first independent review](independent-review.md).
All reproductions used local synthetic sentinels or fake provider responses;
no business content, paid model request, deployment or release was involved.

## Additional findings

| Finding | Evidence and disposition |
| --- | --- |
| P1: final private input lacked source lifecycle binding | A `real_model` controller froze four `private_business` partitions without source bindings. Its `tombstone` command left the synthetic private sentinel in `cases.json`. Independently retested after repair: unbound private freeze is rejected and tombstone removes the sentinel. Native readback now precedes provider dispatch and receipt persistence; a live maintenance owner governs private import and execution. Frozen dataset metadata itself contains digests, not raw input. |
| P1: actual human judge could also act as release reviewer | With `reviewers: ["human-judge"]` and release `executorId: "human-judge"`, the independent-actor guard passed and execution reached the missing-runtime-token guard. Independently retested after repair: the same actor is rejected with `PHASE_ONE_RELEASE_REVIEWER_NOT_INDEPENDENT`; an ordinary synthetic freeze still succeeds. |
| P1: private demonstration could be observed as synthetic | Optimizer observation lineage followed only the current case. A synthetic case with a private demonstration put private content in the system prompt while declaring `source_refs.kind = synthetic`. Independently rerun tests now observe product lineage containing the private regression dependency and prove that withdrawal prevents another export of the pending private attempt. |
| Source-binding completeness | Exact native input/reference/proposal checks and same-source example/holdout rejection passed independent tests. The final controller also checks historical search source bindings, including examples absent from the selected candidate, against both feedback and execution identities. |
| Transient readback versus revocation | The optimizer initially purged all matching runs for every source-read error, including temporary backend failure or missing credentials. Independently rerun tests now preserve private input during HTTP 503, resume the same run after recovery, and remove run artifacts and raw input after confirmed source withdrawal. |
| Unknown usage became settled accounting | Independent execution of `phaseOneJudge.test.ts` reproduced missing usage being marked `settled` with the upper bound substituted for actual usage. There was no demonstrated refund or overspend bypass. Independently retested after repair: missing actual usage stays unknown with its full reservation; the estimate is not written as measured usage. |
| Deployment audience versus holdout exposure | The original binding recorded dataset-access exposure but no separate rollout audience. The added startup capture enforces an immutable workspace allowlist at authentication; candidates without that scope cannot start. Independent backend tests passed for outside-workspace rejection, unchanged baseline defaults and exact readback. Release binding now carries a separate deployment-exposure digest. |
| Late authorization changes and build identity | Release and readback recheck grants, judgment context and exposure after remote reads, then synchronously check local authority after the final source await. The source digest includes SQL migration behavior, and the compiled runtime reports a captured emitted-code digest rather than an environment assertion. |

## Independent checks

- The observation suite passed all 21 tests during this review.
- A combined controller/judge run passed 23 tests and failed the missing-usage
  accounting test above. This result is not a passing final verification.
- After source-binding repairs, the controller, private-source and final-command
  suites passed all 28 tests. These include an actual paused fake provider response
  followed by source revocation, native-copy erasure, HTTP 503 recovery, and
  independent human-reviewer rejection.
- Deployment-exposure and runtime-configuration suites passed all 6 tests.
- The subsequent combined budget, judge, optimizer, source and final-command
  run passed all 79 tests, including the previously failing usage case,
  private-demonstration observation, offline expiry and interrupted input writes.
- The final build/paired-evaluation suites passed 15 tests; CI-proof,
  private-source and final-command suites passed 16 tests after the later changes.
- A separate credential-free Node process loaded the real compiled backend
  module and exercised its registered Fastify runtime-configuration route.
  Its build digest matched all four emitted trees, and environment changes
  could alter neither that digest nor the registered process snapshot. The
  returned deployment-audience digest matched the captured scope and prompt
  references exposed no prompt bodies. This was local route injection, with
  zero provider calls and no deployed-server claim.
- The private-freeze, retained-sentinel and actual-human-reviewer reproductions
  ran in a disposable owner-only directory, removed immediately afterward.
- `pnpm docs:check` and `git diff --check` passed during the review.

The long-lived zero-paid maintenance command now owns idle controller copies,
sweeps source and final stores independently, and treats known local expiry as
deletion even when the backend is offline. It must run under the configured
service supervisor in an actual private deployment. Stopping that service is
not proof of remote deletion. These checks establish implementation behavior;
they do not certify paid semantic improvement, a production rollout or actual
database migration state.

The final narrow review of commit `59d6e11e` found no additional confirmed
P0/P1 regression. Maintenance validates private source dependencies before
starting asynchronous outbox retries, deduplicates overlapping flushes by
controller directory and observation policy, and writes deletion tombstones
and removes local content before retrying remote removal. Existing outbox
write fencing prevents a late transport result from restoring deleted content.
An independent rerun passed all 22 controller tests, including a held/offline
transport that cannot block maintenance, no concurrent duplicate export, and
successful idle recovery without another model request or budget-ledger run.

Owning evidence is in [controller tests](../../../apps/eval-runner/src/optimization/controller.test.ts),
[private-source checks](../../../apps/eval-runner/src/phaseOneSources.test.ts),
[final-command tests](../../../apps/eval-runner/src/phaseOneCommand.test.ts),
[build-identity tests](../../../packages/evaluation/src/phaseOneBuild.test.ts),
and [deployment-audience tests](../../../apps/backend/src/modules/deploymentExposure.test.ts).

## CodeQL alert 47: independent adjudication

[Alert 47](https://github.com/getyak/talent-signal/security/code-scanning/47)
(`js/file-access-to-http`) correctly identifies local evaluation data entering
the configured model request; it does not establish unauthorized disclosure.
The original [GET-19](https://linear.app/getyak/issue/GET-19) requirement places
final material with an independent executor and excludes the candidate generator
from its inputs, gold and detailed failure reports. The initial alert assessment
mistakenly treated this iteration's broader ADR/plan wording about all model
judges as an upstream authorization restriction. That interpretation and the
recommendation to disable the independent final model judge are withdrawn.
The ADR and plan must distinguish development scorers from calibrated judges
operating within the trusted final executor; this correction does not extend
the generator's access or the user's monetary or release authorization.

The inspected path supports an individual false-positive disposition for this
alert, with the following concrete boundaries:

- `phaseOneCommand.ts:79–85,122–136` reads owner-selected, bounded, non-symlink
  final-case JSON in the private controller directory. `phaseOneEvaluation.ts:281`
  supplies the frozen case input, oracle, subject output, repetition and criteria
  to the evaluator. `phaseOneJudge.ts:56–73` deliberately sends these fields to
  the fixed HTTPS BigModel endpoint with redirects disabled. The provider key
  is used only in the authorization header; controller files, signing keys,
  budget permits and source-access credentials are not serialized into the body.
- The only production call to the model-judge function is
  `phaseOneCommand.ts:494`. It requires independent actor configuration, frozen
  study/build bindings, current calibration and stability assurance, the original
  run's final-validation budget, and current private-source/lifecycle checks
  before dispatch and before recording. Source withdrawal prevents retained
  authority; missing GET-12 monetary configuration does not enable paid calls.
- The generator has a separate fixed Python worker. `optimizer.ts:122–139,179`
  passes only an allowlisted environment, candidate fields, development-example
  identifiers and development `score`/`hardGate` feedback. Search admission
  rejects non-development cases (`controller.ts:94–103`); final execution has no
  feedback call into that worker. Judge prose is discarded
  (`phaseOneJudge.ts:88–97`); structured judgments and digests enter the private
  signed journal (`phaseOneCommand.ts:232–239,487–499`). The final CLI returns
  aggregates, while detailed final artifacts remain controller-owned.
- Neither judge output nor its verification report grants release authority.
  `phaseOneReleaseCommand.ts:53–59` requires a separate release actor and key,
  excluding the generator, verifier and configured evaluators.

Independent checks passed: 5 model-judge tests, 13 paired-evaluation tests and
4 Python worker tests. This adjudication is based on the implemented controlled
code paths and private-controller trust model, not an OS sandbox guarantee
against arbitrary malicious same-user code. It does not attest provider-side
retention, a paid final evaluation or a deployed release. Keep the CodeQL rule
and job enabled; any dismissal applies only to this reviewed authorized I/O
path. This reviewer made no GitHub state change.

The subsequent judge assertions passed all 5 tests and now explicitly check
the intended evidence/oracle payload, fixed destination, disabled redirects,
and absence of provider credentials, budget permit identifiers and assurance
filenames. The aligned ADR/plan preserves the independent executor, calibration,
source, monetary and release boundaries. A separate read-only review of the
native feedback proof fixture found that PostgreSQL's `?host=` parameter could
override its initial URL hostname guard. Constructing a client without connecting
independently reproduced the mismatch. The repair rejects query strings,
fragments and non-PostgreSQL URLs; running the actual entry point with the
override in a clean environment now fails before pool creation. Screenshot and
voice providers are also explicitly disabled rather than inherited from the
environment. PBX registration is limited to the UI-test target and passes
`plutil -lint`. These checks certify the inspected fixture boundaries, not the
native E2E outcome, which requires its separate completed xcresult.

## GET-16 lifecycle: second independent safety review

The lifecycle review covered source withdrawal, crash recovery, retired-case
provenance, final-material isolation, and the current exposure used for release.
It found and independently closed two additional P1 retention failures after
the implementer repaired the new nested-document erasure path:

- A later exposure made a retired private case's development proof stale.
  Maintenance rejected that proof before checking native-source expiry, leaving
  the expired private search body on disk. A disposable synthetic reproduction
  initially returned `PHASE_ONE_RETIREMENT_PROVENANCE_STALE` with its private
  sentinel retained. After repair, the same source sweep removed the body and
  wrote `optimization-search-tombstone.v1`. Cleanup may inspect stale proof;
  ordinary start, run and resume still require current retirement authority.
- With an already committed local final-controller tombstone, an unexpired
  imported private source and native HTTP 503, maintenance initially returned
  the transport error and retained the withdrawn copy. The independent exact
  reproduction now returns `PHASE_ONE_RUN_TOMBSTONED`, makes zero native
  readbacks and removes the sentinel. The repair prioritizes both the local
  tombstone file and the durable SQLite tombstone, and rechecks after an awaited
  readback so a concurrent withdrawal cannot be hidden by its HTTP 503 result.

The new primary lifecycle document keeps current case bodies once; event history
contains metadata and digests rather than former inputs or gold. Retirement
preserves the original partition, replaces an entire connected source group
with fresh material in that partition, and requires current provenance before
development import. Imported retired cases receive the fixed generic search
oracle, not their former final oracle. A separate synthetic invocation confirmed
that a private import without a live maintenance owner fails with
`OPTIMIZATION_SOURCE_MAINTENANCE_REQUIRED` before writing the search copy.

The primary document and artifact invalidation use the existing SQLite write
boundary. Interrupted derived search/binding writes fail their current digest
and require explicit repair. Exposure can invalidate an active final run;
retirement and import cannot mutate its running dataset. Final consumers and
release checks use current lifecycle exposure, and the versioned judge/report
changes do not give old reports new authority. The five atomic semantic
criteria remain confined to the calibrated independent evaluator and its
existing budget and source checks.

Independent checks passed 22 package lifecycle/report-compatibility tests and
34 runner lifecycle/final-command/judge tests. After the final withdrawal repair,
the runner lifecycle suite passed all 11 tests, including unexpired sources
with file-only, SQLite-only and during-readback withdrawal under HTTP 503.
The nested private body, damaged metadata digest and interrupted-write cleanup
regressions also passed. All reproductions used disposable synthetic fixtures
and fake transports, with no business-data access or paid request. Arbitrarily
corrupted primary JSON or manually removed data classifications were not
presented as independently reproduced production failures; the inspected
writer replaces complete documents atomically.

The subsequent native Session-group review confirmed that the server exports
`execution.session_id` inside the hashed feedback snapshot. New admission
requires that authenticated identity in the binding and case source group;
different turns, executions or inputs from the same Session cannot cross
partitions, including a private demonstration paired with a final case.
Checking only the currently executing case does not bypass the global binding
check. Optional Session metadata in the native historical-read schema does not
admit legacy snapshots or allow a caller to invent their grouping authority.

The new mandatory field initially also blocked cleanup of older bindings.
The final repair confines legacy-shape compatibility to optimizer source sweeps
and the final-controller source sweeper. Ordinary start, resume, execution,
freeze and import retain strict admission. Independent disposable invocations
of the actual final sweeper confirmed that an expired legacy copy is erased
without a readback, an unexpired copy with HTTP 404 is erased after one readback,
HTTP 503 alone preserves the copy and reports unavailability, and a known local
tombstone erases it before any readback. A separate actual optimizer sweep
erased an expired legacy search copy without credentials or network calls.
The repaired native-source, optimizer, lifecycle and final-command suites
passed all 64 tests, including legacy and current bindings under file, SQLite
and during-readback withdrawal. This reviewer did not repeat the separate
PostgreSQL integration run or access the native UI proof database.

An additional implementation review found a separate historical-checkpoint
entry into paid final verification: a private example removed from the final
candidate could leave an older search binding without Session metadata outside
the current final-source admission checks. This reviewer independently checked
the repair in `phaseOneCommand.ts`: historical `feedbackSources` must be absent
or an array of at most 116 entries, and every entry passes the default strict
admission validator before source/Session exclusion and before budget resume.
Cleanup compatibility is not enabled at this entry. All 6 focused direct-verify
regressions passed for missing Session, null, object, string, invalid entry and
the same Session with different feedback/execution identities. Each preserves
the checkpoint and empty operation ledger, makes zero provider requests, and
writes no execution journal or verification report. These tests stub only the
independent CI-attestation check; freeze, checkpoint persistence and this
admission path remain real. The other 14 command tests were intentionally
outside this focused rerun.

There is no remaining confirmed P0/P1 in these reviewed lifecycle and Session
binding changes. These checks do not claim a live semantic evaluation or a
deployed release.

Owning checks: [dataset lifecycle tests](../../../packages/evaluation/src/phaseOneDatasetLifecycle.test.ts),
[report compatibility tests](../../../packages/evaluation/src/phaseOneReportCompatibility.test.ts),
and [controller lifecycle tests](../../../apps/eval-runner/src/phaseOneDatasetLifecycle.test.ts).
