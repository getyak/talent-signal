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
