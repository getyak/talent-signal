# GET-11 second independent safety review

Date: 2026-09-07. Status: confirmed findings repaired and independently retested;
compiled-runtime identity proof is being completed.
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
