# GET-11 independent implementation review

Date: 2026-09-07. Status: first-pass findings repaired and independently checked;
the separate safety review remains open. This is not a release approval.

The independent reviewer inspected the isolated GET-11 worktree without changing
implementation files. Review covered the budget ledger, optimizer/product adapter,
paired evaluation and release contracts, runtime observation persistence, feedback
lineage and the native correction editor. Subsequent fixes belong to the named
implementation owners. All reviewer reproductions used synthetic local content;
no paid provider request, private-content export, or deployment was performed.

A separate second reviewer is auditing newly integrated private-source bridges,
global development examples, actual human-reviewer separation and unknown judge
usage. Their additional findings and repair evidence live in
[the final safety review](safety-review.md). Closing the findings below does not
close that separate review.

## Confirmed findings and repair evidence

| Finding | Reproduction and consequence | Current disposition |
| --- | --- | --- |
| P1: observation merge prevented deletion | Two valid attempts containing 251 spans each exceeded the aggregate 500-span schema limit. `enqueue`, `deleteRun`, and an overdue `flush` all failed at `mergePending`, retaining the original bodies and blocking later runs in the same sweep. | Independently retested after repair: both attempts export separately, deletion succeeds, and no synthetic body remains. |
| P1: temporary observation bodies survived deletion | A simulated rename failure left a raw `.pending.<uuid>.tmp` body. Explicit deletion and an overdue sweep succeeded without removing it; status reported no remaining work. | `atomicJSON` cleans failures; recovery/deletion sweeps cover abandoned content temporaries. Independently retested with a crash-style temporary file and verified removal. |
| P1: interrupted lock creation blocked deletion indefinitely | An empty legacy `.json.lock`, representing death between exclusive creation and owner write, caused every deletion/expiry attempt to throw a JSON parse error. | The prepared-owner hard-link protocol and legacy recovery were inspected. Independent retest recovered the empty lock and completed deletion. |
| P1: lost-response feedback retry could never recover | Submit revision 0 commits revision 1, its response is lost, and another device changes the record to revision 2. Replaying the original operation correctly returns current revision 2, but the native client classified it as an invalid response and preserved the same pending operation forever. Editing, withdrawal and reload remained disabled. | Client now classifies a newer revision with matching identity as a conflict, allowing editor reconciliation. Fix inspected; root reports a passing simulator fixture for this exact sequence. |
| P1: source deletion could precede a new feedback descendant | Observation or child-case creation captured an execution snapshot before source revocation, then inserted a new regression from that stale copy after the revocation trigger had finished its descendant traversal. Read guards denied access, but the deleted body could be recreated in storage. | Execution rows are locked in sorted order before fresh availability checks and before parent/job locks. Lock order inspected. Independently passed the real PostgreSQL suite, including two-connection tests that pause the actual insert, observe deletion waiting on a lock, then verify all newly committed descendants are scrubbed. |
| P1: private demonstrations could enter a global production prompt | Selected `private_business` examples were embedded in a source module loaded for every workspace, losing source revocation and potentially exposing one workspace's evidence to another workspace's model request. | Both source rendering and production startup now reject private demonstrations. Independently ran the fresh-process source selection test: actual candidate and rollback serializer/digest match, and a handwritten private demonstration module fails startup. |
| P1: a late first-turn Chat result could recreate revoked content | A provider remained pending while another transaction revoked the source. The new task was not visible to invalidation triggers; its captured feedback snapshot and original response could then commit. | The final Chat completion gate now locks manifest/source rows and performs a fresh availability check before either snapshot or idempotency response storage. Existing Session/screenshot/parent-reply locks cover those dependencies until commit. Independently passed both Session and no-Session PostgreSQL fixtures: 409 with no snapshot or idempotency body. |
| P1: a repeated runtime attempt could remain pending on actual Opik | The owner verified that duplicate trace POST requests do not update the existing trace in the installed Opik version. The second attempt's root digest could therefore never match readback. | Explicit trace PATCH is now used. Fix inspected; owner reports successful actual readback of two attempts and eight spans, plus a shared Ask image observation. |
| P1: full-content observation missed source deletion and idle expiry | Feedback-snapshot-only cleanup omitted images and workspace/Lab runs. Retained observations also skipped the periodic source validator, allowing stale bodies while the product was idle. | Trusted source references now cover media, captures, fragments, people, contexts, Sessions and regressions. Retained runs are revalidated by background flushing. Independently passed the actual PostgreSQL fixture for media/capture revocation with active sibling records and regression-only expiry without another product request. |
| P1: final-verification crash temporaries survived tombstone | Deletion originally removed named execution/report files but left a crash-created temporary containing outputs. | Bounded sensitive-file cleanup runs within the artifact transaction. Independently passed the orphan-output temporary deletion test. |
| P1: revoked critical judgments left a reusable passing report | The signed report originally did not bind the human review store; revocation after verification could leave the old passing result usable. | Signed reports and release decisions bind the judgment-context digest. Verification, inspection, release and deployment readback check current state, including after awaited runtime reads. Independently passed command and package fixtures for changed reviews and revocation before/after approval. |
| P1: runtime deletion used an unsupported endpoint | The installed Opik version returned 501 for individual span DELETE, preventing cleanup from reaching trace deletion. | The transport deletes the trace and verifies cascade deletion with GET for every known child. Independently passed transport fixtures: a surviving span prevents a verified deletion receipt. Inspected the owner's completed real-Opik proof: both traces and all ten named spans were absent, with two deleted receipts and no pending work for that proof. |

Relevant implementation and test evidence:

- [Observation outbox](../../../apps/agent/src/runtimeObservationOutbox.ts) and
  [observation tests](../../../apps/agent/src/runtimeObservation.test.ts).
- [Feedback execution locking](../../../apps/backend/src/modules/feedbackExecutions.ts),
  [feedback service](../../../apps/backend/src/modules/feedback.ts),
  [regression lifecycle](../../../apps/backend/src/modules/labRegressions.ts), and
  [PostgreSQL integration tests](../../../apps/backend/src/modules/feedback.integration.test.ts).
- [Native feedback client](../../../apps/ios/Sources/Services/AnswerFeedbackClient.swift)
  and [editor](../../../apps/ios/Sources/Features/AnswerFeedbackSheet.swift).

## Remaining integration evidence

The first-pass repairs above have no remaining demonstrated P0/P1 code finding
in their reviewed scope. The successful real-Opik proof was captured at
2026-09-07T10:13:11Z, used synthetic content and zero paid model calls, and covers
two attempts in one run plus the shared production Ask image adapter. Its two
traces and ten spans were read back before verified deletion. Earlier failed
synthetic probes have a separate cleanup manifest because the service became
unreliable again; the successful proof does not claim those probes were removed.

Exact evaluated task configuration now binds the loaded model, prompt and
policy through rehearsal, release and deployment readback. The command and
package fixtures passed independently. The new private-source bridge, complete
development-example history, actual human-reviewer separation and unknown judge
usage are covered by the separate safety review; its open items must be closed
before making a broader release-readiness claim.

## Existing completed-Chat storage lifecycle

The normal product source-revocation path already erases completed Chat bodies:
`transitionCaptureSourceAuthorization` calls `invalidateKnowledge`, which replaces
`create_chat_task.response_body` with an invalidation marker using the response's
`knowledge_snapshot_id`. Capture deletion replaces the same dependent bodies with
a deletion marker. Fragment review and identity correction use the equivalent
invalidation query. Authorization expiry uses the same transition through the
source-lifecycle sweep. This inspection did not require another storage mechanism.

The exact code is in [source authorization](../../../apps/backend/src/modules/sourceAuthorization.ts),
[capture deletion](../../../apps/backend/src/modules/captures.ts),
[fragment invalidation](../../../apps/backend/src/modules/resources.ts), and
[identity correction](../../../apps/backend/src/modules/identityCorrections.ts).
[Migration 055](../../../apps/backend/src/database/055_agent_session_chat_sources.sql)
and [migration 056](../../../apps/backend/src/database/056_agent_session_chat_lifecycle.sql)
separately scrub Session/screenshot-derived Chat bodies. Direct administrative SQL
updates are not equivalent to those normal product mutation paths. Submitted
media deletion is currently rejected by the existing durable-task policy; this
review does not claim that the upload-delete endpoint can remove submitted media.

## Verification scope and limits

Independent commands completed before subsequent integration changes:

```sh
pnpm --filter @talent-signal/agent exec vitest run src/runtimeObservation.test.ts
pnpm --filter @talent-signal/eval-runner exec vitest run src/optimization/budget.test.ts
pnpm --filter @talent-signal/evaluation exec vitest run src/phaseOne.test.ts
```

The initial results were 10, 39, and 10 passing tests respectively. The repaired
observation suite subsequently passed all 17 tests. An actual
Python subprocess smoke test evaluated three deterministic candidates, selected
`evidence_first`, returned `search_exhausted`, and replayed with a matching
digest. The repaired outbox was independently exercised with 502 total spans,
an empty legacy lock, a crash temporary, retained-state readback, and deleted-state
readback.

After source-lineage, namespace fencing, idle-source revalidation and Opik
transport changes, the observation suite independently passed 22 tests. The
final evaluation package suite independently passed 13 tests, and the phase-one
command suite passed nine, including withdrawn judgment contexts, exact runtime
configuration, private-source refusal and temporary cleanup.

The budget review found no demonstrated path that refunds unknown issued spend
or bypasses shared-scope concurrency. Candidate counting was initially absent
from orchestration; the new atomic `registerCandidate` path has been inspected.
Independent execution of the budget, controller, and phase-one command suites
passed 57 tests. A same-run concurrent receipt-write concern is closed by a
SQLite-owned executor lease and by refusing to record failures that occurred
before provider dispatch. The implementation and corresponding stop/concurrency
fixtures were inspected.

The projection retry/deletion review inspected the SQLite process lock, deletion
admission tombstone, pre-export cleanup identities, readback checks and atomic
event sequencing. The four focused ledger/reporter/transport/CLI suites passed
17 tests independently; no new P0/P1 finding was established in that scope.

The real PostgreSQL feedback integration suite independently passed all ten
tests against the disposable loopback database, including authenticated product
and Lab calls and the barrier-controlled deletion races. `pnpm docs:check`
also passed, including wiki and architecture diagram checks.

These checks do not establish real-model semantic quality, funding authority,
production exposure authorization, or a completed production deployment. A
blanket claim of zero P0/P1 issues is premature while the separate safety review
and final integration evidence remain open.
