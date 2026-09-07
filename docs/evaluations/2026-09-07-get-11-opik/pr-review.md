# GET-11 final independent PR review

Date: 2026-09-07. Reviewed implementation:
`6601c5753c1ed697f536ebb6112d69835f05c29f`, against main
`11984f15275a8dbdb8a93eb020d6e9d3e9663f4a`.

**Result: no unresolved confirmed P0/P1 in the reviewed scope.** Two additional
P1 failures were independently reproduced during this review, repaired by the
implementation owners, and independently checked before this conclusion.

The reviewer inspected the final diff and relevant surrounding code under
`AGENTS.md` and `REVIEW.md`. Earlier reviews were supporting evidence, not a
substitute for inspecting the merged implementation. The reviewer made no
source-code changes, paid model requests, private-content exports, deployments,
or GitHub/Linear mutations. This new evidence file is the reviewer's only
repository edit.

## Findings closed

### P1: an existing tombstone skipped interrupted private-copy erasure

The maintenance sweep returned `tombstoned` immediately when the marker existed.
Because explicit deletion writes that marker before erasing controller copies,
a crash or filesystem failure could leave private cases, examples, or reviews
permanently retained while later sweeps reported completion.

An independent synthetic reproduction created the marker alongside an unerased
private case: the original sweep returned `tombstoned` with the case body still
present. After repair, the same reproduction removed that body. The sweep now
retries erasure and budget shutdown, preserves the original tombstone, tolerates
already-missing copies, and surfaces other failures. A child-process regression
kills deletion after its first atomic replacement; the recovery test verifies
remaining-copy removal and the SQLite budget stop. Permission failure, unreadable
tombstone, and missing configured budget state are also covered.

Evidence: [controller deletion](../../../apps/eval-runner/src/phaseOneCommand.ts)
and [crash/recovery tests](../../../apps/eval-runner/src/phaseOneCommand.test.ts).

### P1: revoked Lab source could still enter the provider after reservation

After reserving a Lab attempt, asynchronous observation preparation could find
that its private source had disappeared. The original code disabled observation
but still dispatched the frozen input. An independent fake-provider reproduction
observed one provider invocation with a synthetic revoked-input sentinel after
the missing-source read.

The repaired path denies dispatch when private lineage is unavailable, then
revalidates source authority, lease, job expiry, cancellation, and definition
under the deletion-compatible lock order immediately before provider entry.
Locks are released without waiting for the network response. Result persistence
performs another current-authority check, so a response arriving after withdrawal
cannot recreate private retained output. Reserved capacity is not refunded; an
authorization error after provider entry preserves observed usage or an unknown
outcome instead of inventing zero calls.

Independent tests against disposable PostgreSQL passed the real authenticated
feedback-to-Lab flow, withdrawal barriers on either side of source observation,
source/job/lease expiry, zero-provider-call assertions, and withdrawal while a
provider response is pending. The runner also preserves an observed remote call
and its usage when a later authorization exception occurs.

Evidence: [dispatch and persistence fences](../../../apps/backend/src/modules/labExperimentJobs.ts),
[attempt runner](../../../apps/backend/src/modules/labJobRunner.ts),
[PostgreSQL races](../../../apps/backend/src/modules/feedback.integration.test.ts),
and [measurement tests](../../../apps/backend/src/modules/labJobRunner.test.ts).

## Scope and independent verification

Review covered migration 057 and source deletion/late-write behavior; feedback
ownership, revisions, retries and native recovery; saved private Lab cases;
observation export, local persistence and deletion; budget/search/controller
recovery; paired evaluation and release identity, approval and rollback gates;
new CI jobs; and compatibility after merging current main.

The final increment also checks readiness against migration 057 and connects the
documented deployment identity, optional workspace exposure and runtime export
configuration to the standard TestFlight Compose deployment. Rendered Compose
configuration retained loopback API binding, disabled export by default, left
workspace exposure unset, and mounted the fixed outbox path on a named volume.
The deployment script passed shell syntax validation.

| Independent check | Result |
| --- | --- |
| Frozen implementation: feedback integration, Lab runner, runtime observation lifecycle, disposable PostgreSQL | 28/28 passed at 20:22:52 Asia/Shanghai |
| Frozen implementation: controller command, private-source bridge, optimizer controller | 40/40 passed at 20:24:32 Asia/Shanghai; includes the real child-process crash/recovery test |
| Runtime configuration, deployment exposure, Chat provider, unscoped Chat | 44/44 passed |
| Runtime observation persistence and deletion | 22/22 passed |
| Readiness including database containing only migration 056 | 8/8 passed |
| Lab runner and Workspace Conversation Agent before the final measurement guard | 34/34 passed; the updated runner was retested in the 28-test frozen-commit run above |
| CI orchestration and source-selection focused tests during initial review | Passed; unchanged by the final repairs |
| Documentation and whitespace checks | `pnpm docs:check` and `git diff --check` passed |

The earlier [native and live Opik proof](README.md) was inspected and reused;
this reviewer did not rerun Simulator or the live Opik service. Review fixtures
used synthetic content and a disposable database, not production data.

## Delivery boundary

This result permits proceeding to PR validation. Required GitHub checks must
still pass on the submitted revision before merge. It does not certify funded
model quality, authorize missing budget or exposure parameters, or establish a
completed deployment. Those outcomes require their own current execution and
destination-readback evidence under the [operational playbook](../../operations/opik-phase-one.md).

## First CI repair follow-up

The independent review of the first CI repair increment over
`0608d6794a579dee7263eb13476513aec34ed560` found no new confirmed P0/P1 in
the following inspected changes. Native end-to-end fixtures and the separate
judge outbound-authorization analysis were still owned by other reviewers and
are not covered by this increment.

- CI still runs the complete eval-runner `vitest run src` selection, with two
  workers to bound competing subprocess startup. The controller timeout changes
  no assertions. Projection deletion now waits for the actual durable deletion
  marker; a `finally` release prevents the artificial network barrier remaining
  blocked if that assertion fails. Verified deletion and late-resurrection
  rejection assertions remain intact.
- Budget subprocess tests now execute a static worker and receive JSON on stdin.
  Paths containing quotes, a template marker, and a newline remain data. Real
  concurrent admission, SIGKILL, retained issued reservation, and controller
  ownership assertions remain intact; worker failures are not converted to passes.
- Named-contact shortcut matching uses bounded scanning instead of ambiguous
  backtracking. Oversized or disallowed clues take the ordinary Agent path with
  the original objective. Tests preserve exact scoped search, no-match behavior,
  and adversarial-whitespace handling without truncating a question into a clue.
- The observation cache compares its transport's existing credential directly;
  credential material no longer participates in the cache digest. Rotation and
  disable dispose the old background timer. Policy, endpoint and outbox identity
  remain bound, with no new export authorization.
- Infisical additions declare credential-name ownership only. The GitHub OIDC
  release path, contract and workflow credential injection are unchanged;
  ordinary PR CI does not acquire the evaluation credentials.

Independent execution at 20:39 Asia/Shanghai passed 43 Agent tests and 61 budget,
controller-command and projection CLI tests. All used synthetic fixtures or
local fake transport and issued no paid requests. The four Infisical manifest
checks also passed independently. Owner-reported typecheck results were reused.
The required GitHub checks must pass again on the submitted repair revision
before merge.

## Native recovery and acceptance follow-up

This review inspected the frozen follow-up increment over
`7f66d65b5b20d29ce620e2a268b067736729b435`. **No unresolved confirmed P0/P1
remains in the reviewed follow-up increment.** This includes the native terminal
race, metrics, behavioral fixtures, signed-report compatibility, dataset
lifecycle, Session source binding, and direct-checkpoint final admission. The
Session-grouping P1 below was independently verified closed before this result.

### P1 closed: native feedback sources did not bind the original Session group

Previously, `LabRegressionSnapshot.feedback_source` exposed feedback and execution
identity, but no original Session identity. `assertPhaseOnePrivateSources`
required only `feedback:` and `execution:` source IDs. Two different turns in the
same native Session could therefore have different executions and inputs and be assigned to
development and held-out partitions without the existing source/input overlap
checks recognizing their shared Session. Caller-provided Session IDs could not
be checked against the authenticated export. This left the GET-16 native
Session-level separation requirement unenforced and could contaminate independent
final evidence.

The backend now derives the group from the retained execution's `session_id` and
includes it in the frozen snapshot hash. The optimizer requires that exact native
binding and a corresponding `session:` source ID. Cross-partition checks include
all frozen case/example bindings even when dispatch reads only the current case.
Tests reject invented or omitted groups, distinct executions from the same
Session across splits, and a private development example overlapping a final
Session; unrelated Sessions remain eligible.

A follow-up review caught a second entrance to the same failure: an already
checkpointed search could go directly to final verification with an old private
example binding, after that example had been removed from the candidate. Final
verification now rejects malformed source lists and strictly validates every
historical binding before Session exclusion or budget resume. Six direct-verify
regressions cover missing Session, null/object/string lists, a null entry, and a
different execution in the same Session. They preserve the SQLite checkpoint,
record zero operations/network calls, and create no final execution or report.

Old snapshots remain readable in ordinary Lab history. Only cleanup may read the
valid pre-Session binding shape; it cannot admit, resume or freeze a new run.
Known expiry, authenticated 404/410 and local withdrawal still erase old private
copies. A temporary 503 preserves unrevoked data and surfaces the failure, while
an already committed or concurrently committed local tombstone takes priority.
The latter was checked for both file and SQLite markers and for legacy bindings.

Independent execution of the authenticated PostgreSQL suite created two actual
product turns in one Session, verified different execution/input hashes, and
compared each export's Session and content hash with database state. All 20 tests
passed on the dedicated `get11_session_binding` database; the earlier native UI
proof database was not used.

### Verified follow-up behavior

- Native capture recovery cancels the previous debounce before a new operation,
  checks cancellation before save, and refuses a late save for a UUID removed by
  the shared inbox actor. Explicit reimport stages a new UUID and remains usable.
  The reviewer read the actual Xcode result bundle: 40 passed, zero failed or
  skipped, including the new late-save/reimport test and the real UI correction,
  restart, private-case and frozen-rerun flow. The copied PostgreSQL evidence
  preserves feedback revision 1 as a proposal and the same complete text input
  across three deterministic provider calls. The proof does not establish media
  behavior or live model quality. See [native evidence](native-feedback/README.md).
- The five semantic dimensions have separate observations, numerator,
  denominator, unknown count, paired results and slice results. Correction burden
  is explicitly a required-material-correction proxy, not measured user editing
  time. Subject and judge usage retain unknown tokens/cost/duration. The v2 rubric,
  per-dimension human reviews, model judgment schema and execution journal prevent
  an old overall pass from becoming five new passes. Correctly signed legacy or
  incomplete reports fail current metric validation.
- The synthetic corpus exercises insufficient evidence, ambiguous identity,
  historical conflict, clearly answerable input and provider failure with frozen
  input/reference time and paired repetitions. Separate production Workspace
  Agent boundary tests exercise actual tool callbacks, recoverable read retry,
  clarification and thrown tool failure, including local trace ancestry. A
  candidate's fabricated booking or evasive clarification on answerable input is
  a critical regression even if aggregate formatting improves. These fixtures
  prove plumbing and veto behavior, not semantic improvement by a paid model.
- Lifecycle replay preserves original partitions, retires entire connected
  source/input groups, requires fresh replacement groups in the original split,
  and records repeated exposures. Explicit development import supplies only the
  former input/reference time and a generic boundary oracle; former final gold
  stays out of the search. Later exposure invalidates old final artifacts and
  imported provenance. SQLite serialization fences deletion and concurrent
  mutations; interrupted derived imports are stale until explicitly repaired.
- The lifecycle envelope initially bypassed array-only private-copy erasure. The
  repair now removes nested private bodies without requiring a valid audit
  digest. Maintenance also checks source withdrawal/expiry before stale
  retirement proof can mask cleanup, while execution still requires complete
  current provenance. Independent tests verified expired private search erasure,
  damaged lifecycle erasure, temporary-copy cleanup and tombstone fencing.

| Independent follow-up check | Result |
| --- | --- |
| Dataset lifecycle, phase-one core, dimensions and signed-report compatibility | 39/39 passed at 21:20:31 Asia/Shanghai |
| Frozen lifecycle CLI, final command, private-source bridge and optimizer controller | 49/49 passed at 21:27:55; includes real CLI processes and crash-repair assertions |
| Final Session and historical-checkpoint repair: final command, source bridge, optimizer controller and lifecycle | 70/70 passed at 21:53:46; includes six direct-verification rejection cases and legacy deletion combinations |
| Authenticated feedback integration on dedicated PostgreSQL `get11_session_binding` | 20/20 passed at 21:48:54, zero skips/failures; trusted Session export and legacy Lab readability verified |
| Judge, final command and behavioral fixtures before the lifecycle increment | 36/36 passed at 21:09:03 |
| Final behavioral corpus and real Workspace tool-boundary fixtures | 12/12 passed at 21:11:05 |
| Native feedback/capture/UI result bundle independently inspected | 40/40, zero skips/failures; `/tmp/get11-feedback-final-r1.xcresult` |

### Child acceptance mapping

| Issue | Implementation/evidence conclusion |
| --- | --- |
| GET-13 | Local projection survives unavailable/auth/missing remote state; immutable replay, explicit digest conflicts, deletion and actual Opik readback are covered by the earlier reviewed implementation and proof. |
| GET-14 | Shared product observation, parent/tool/retry lineage, TS/Python policy boundary, unknown usage, media readback and deletion receipts are covered by existing tests and actual Opik proof; recorded outstanding synthetic cleanup remains explicitly separate. |
| GET-16 | Independent paired execution, five dimensions, required behavior fixtures, critical vetoes and retirement/replenishment lifecycle are implemented and tested. Trusted native Session grouping and strict direct-checkpoint final admission now close the P1 above. |
| GET-17 | Cross-process budget admission, retained unknown reservations, same-binding recovery, expired-permit refusal and deletion have deterministic process evidence. No additional paid execution is required to establish these control behaviors. |
| GET-19 | Independent executor, generator isolation, layered unknown/critical results, current source/build/CI bindings, exposure invalidation and release-authority separation are covered. Hosted checks must still pass on the final repair revision. |

These conclusions cover implementation acceptance. They do not claim funded
semantic improvement, calibrated human gold, candidate deployment, or an
authorized release outside the recorded scope.

## CodeQL 48 filesystem follow-up

The independent review of the two-file increment over
`8f4a4f03f270d826a72d9099cb783b9ec9d048a6` found no confirmed P0/P1 within the
documented private-controller and dedicated-account boundary. Scope was
`apps/eval-runner/src/optimization/controller.ts` and
`apps/eval-runner/src/phaseOneDatasetLifecycle.test.ts`.

The SQLite authority is opened directly with `O_NOFOLLOW`; only `ENOENT` means
absent, while other errors propagate. Descriptor checks reject non-files,
non-owner files and group/other permissions, and likewise validate the opened
controller directory. All opened handles close on success or failure. Existing
file/SQLite withdrawal and withdrawal-during-503 behavior remains intact.
Independent lifecycle/controller execution passed **43/43** at 22:12:26
Asia/Shanghai, including missing authority, symlink, directory and public-mode
regressions. These failures make no source-network calls.

Limit: `DatabaseSync` still reopens a pathname, not the validated descriptor.
Holding descriptors does not itself prevent pathname replacement by a malicious
same-UID process or an actor able to replace an ancestor directory. This review
relies on the existing trusted private location and OS-account/container
isolation; it does not establish security for an attacker-writable path ancestry.
No hosted CodeQL run was performed by this reviewer, so this local result does
not assert that alert 48 or the PR aggregate check has passed.
