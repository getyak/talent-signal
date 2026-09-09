# GET-9 / GET-23 integration boundary review

Date: 2026-09-10. Reviewer: independent design_review agent.
Scope: merged integration draft, real owned native PostgreSQL `get9_eval` on
port 32774 with the parent's migrations 062–065 already applied. The reviewer
applied no migrations, changed no product files, called no Hao service and
controlled no Simulator. Temporary probes created and removed their own
synthetic accounts only.

## Decision

**The confirmed P1 findings in this bounded integration review are closed.**
Independent native PostgreSQL probes verified the latest screenshot purge,
directory invalidation, stale-output gate and lock-order fixes described below.
The original failures remain recorded. This is not full GET-9 acceptance or
release readiness; no live model, client UI or complete suite was run here.

## Original P1: screenshot checkpoint rebind revives a deleted candidate's span

`productRunStorage.ts:9–16` updates a screenshot Run's `source_generation` to
the account's current generation whenever the canonical screenshot is available.
This precedes the output revision guard. Existing span contents and feedback
history remain attached to that Run, so raising its generation makes their old
content visible again even when their own source was deleted.

An independent probe used the actual `captureProductStep`, `productRunSink`,
`saveProductRunOutput`, `ProductRunService` and PostgreSQL trigger. It recorded a
`search_contact` result by reading a real synthetic subject row. Deleting that
subject changed generation and hid the Run. The screenshot itself remained
available. A subsequent legitimate screenshot checkpoint with a higher revision
rebound the Run and exposed the deleted subject's marker again:

```json
{"case":"screenshot_checkpoint_rebind_after_candidate_deletion","initialMarkerVisible":true,"afterSourceDeletionAvailable":false,"afterSourceDeletionMarkerVisible":false,"canonicalTaskStillAvailable":true,"afterCheckpointAvailable":true,"deletedSourceMarkerReappeared":true}
```

Source: `/tmp/get9-review-screenshot-rebind.mts`; result:
`/tmp/get9-review-screenshot-rebind.log`, exit 0. This is a synthetic source
lookup/checkpoint boundary probe, not a live model or full screenshot UI run.

A current screenshot's availability does not authorize every old lookup result
in its Run. Before rebinding, permanently remove old-generation span and feedback
content in the same transaction, or keep that trace metadata-only while retaining
the current canonical screenshot output. Buffered spans also need their own
capture-generation/lineage boundary so a later flush cannot restore old content.
Apply the revision admission gate before any rebind. Verify both higher-revision
updates and rejected stale updates after deletion, including a late flush.

The new `sourceExpiresAt` handling takes a minimum and updates with SQL `LEAST`,
so it cannot intentionally extend a retained deadline. Invalid expiry maps to
an already-expired deadline. That temporal bound is useful but does not establish
source identity and cannot prevent this generation-rebinding resurrection.

## Failed/null-task content boundary

`/tmp/get9-review-monitor-boundary.mts` used an actual Fastify monitor wrapper,
a product transaction, real `createHarnessSourceGuard`, nested capture and a
separate connection performing a real `agent_session_retracted_tasks` INSERT.
After the synthetic memory read, the provider seam rechecked authority and threw
`HARNESS_SOURCE_CHANGED`. The product transaction rolled back; HTTP returned 409.

The running and failed detail views contained no marker, and direct SQL found
none in the Run or its spans. Two metadata spans remained. A separate successful
turn retained both context spans and an output deeply equal to its wire response.
This proves the bounded failure rollback/capture path without relying on an SDK
network response.

Corrected comparison log: `/tmp/get9-review-monitor-boundary-second.log`, exit 0.
The first log's output-string comparison was affected by PostgreSQL JSONB key
order and was replaced by deep comparison; it was not a product output defect.
The failed tool/Run was not discarded from evidence.

## Binary image copy finding and fix

The first monitor probe showed the actual chat `images[].data` Buffer shape
surviving as `{type:'Buffer',data:[...]}`. The subsequent source patch checks
original ArrayBuffer/views and serialized Buffer shapes before retaining content.

`/tmp/get9-review-media-filter.mts` independently verified Buffer, Uint8Array,
ArrayBuffer, SDK base64 and data-URL forms all become the omitted-media marker,
while ordinary sourced text remains. Log `/tmp/get9-review-media-filter.log`,
exit 0. The original binary-copy P1 is closed for these observed representations.
This does not resolve old nonbinary source content in the rebind finding.

## Previous-answer expiry

`/tmp/get9-review-previous-expiry-final.mts` exercised actual `createChatTask`,
compiled source state and a controlled Claude-provider seam with no network.
Each case began with a valid previous answer and an active current source.
The old Run itself or only its parent product Session expired during execution.
Both dynamic-guard cases rejected `PREVIOUS_ANSWER_UNAVAILABLE`. Two additional
cases deliberately omitted the provider's authority call and were still rejected
by the host's final check. All four committed zero new context manifests:

```json
{"case":"root_expiry","historyReceived":true,"dynamicGuard":"PREVIOUS_ANSWER_UNAVAILABLE","finalCode":"PREVIOUS_ANSWER_UNAVAILABLE","newManifestCommitted":0,"currentSourceStillAvailable":"active"}
{"case":"parent_session_expiry","historyReceived":true,"dynamicGuard":"PREVIOUS_ANSWER_UNAVAILABLE","finalCode":"PREVIOUS_ANSWER_UNAVAILABLE","newManifestCommitted":0,"currentSourceStillAvailable":"active"}
{"case":"root_expiry_host_only","historyReceived":true,"dynamicGuard":"not_called_by_provider","finalCode":"PREVIOUS_ANSWER_UNAVAILABLE","newManifestCommitted":0,"currentSourceStillAvailable":"active"}
{"case":"parent_session_expiry_host_only","historyReceived":true,"dynamicGuard":"not_called_by_provider","finalCode":"PREVIOUS_ANSWER_UNAVAILABLE","newManifestCommitted":0,"currentSourceStillAvailable":"active"}
```

Log `/tmp/get9-review-previous-expiry-final.log`, exit 0. The reviewed final
source-generation fence remains held through product commit; the independent
availability query uses a fresh statement clock. The earlier previous-answer
expiry P1 is closed for this bounded mechanism.

## Lab stop and controlled cleanup

The first independent `FOR SHARE NOWAIT` probe did **not** detect a waiting Lab
stop; its result was `UNEXPECTED_PASS`. Only the probe's deliberate rollback
allowed stop/cleanup to finish. The stronger variant first committed one main
and one subagent entry and retained a preference whose DELETE invokes the
invalidation trigger. It reproduced the same failure. These results remain in
`/tmp/get9-review-lab-stop.log` and
`/tmp/get9-review-lab-stop-retained-second.log`.

The corrected advisory stop-intent gate acquires the exclusive account key before
waiting for the workspace row. The independent heartbeat tries the shared key
in an autocommit statement. After fixing the initially observed UUID/text SQL
parameter error, the same retained probe confirmed actual lock waiting, ordinary
heartbeat rejection and successful real service cleanup:

```json
{"case":"real_lab_stop_pending_writer","committedBefore":2,"writerWaitingOnLock":true,"ordinaryHeartbeat":"HARNESS_SOURCE_CHANGED","state":"deleted","cleanupError":null,"dataRows":0,"activeSessions":0,"remainingHarnessEntries":0,"elapsedMs":176}
```

Source `/tmp/get9-review-lab-stop-retained.mts`; final log
`/tmp/get9-review-lab-stop-advisory-second.log`, exit 0. The timing covers the
controlled stop/check/release interval, not scheduled production heartbeat delay.
The exact transaction-local cleanup flag allowed preference deletion and removed
all retained derived data; the tested account reached zero rows. The initial
UUID/text failure remains in `/tmp/get9-review-lab-stop-advisory.log`.

The pending-stop P1 is closed for this tested mechanism. The temporary probe's
first retained variant mistakenly reused a one-shot continuation factory; that
probe error was corrected and its two leftover synthetic accounts removed. It
was not counted as a product failure. Original failed probe outcomes and the
interrupted full iOS results remain separate evidence.

## P1 follow-up: canonical screenshot output also retains deleted candidates

Clearing diagnostic spans alone is insufficient. The actual screenshot read
path calls `assertSourceCurrent`, which returns immediately for `capture_id=NULL`.
The SQL screenshot-availability function likewise validates a filed capture when
present but does not inspect cached directory candidates.

`/tmp/get9-review-canonical-candidate.mts` created a real synthetic subject and
assignment, placed their candidate projection in a waiting screenshot task, then
deleted both source rows. The actual `loadScreenshotContactTask` still returned
the deleted candidate label, and the SQL availability function returned true:

```json
{"case":"canonical_screenshot_candidate_after_source_deletion","beforeCandidateMarker":true,"afterCandidateMarker":true,"returnedStatus":"waiting_for_user","candidateCount":1,"canonicalSQLAvailable":true}
```

Log `/tmp/get9-review-canonical-candidate.log`, exit 0. All owned data was removed.
This is a real persisted-candidate/read-path probe with seeded synthetic task
state; it is not a full OCR/model execution.

Before accepting canonical output for rebinding, revalidate candidate account,
person and context availability and remove invalid projections from both
`state.response.candidates` and `state.searches`. Apply the boundary to reads,
checkpoints and state returned to the Agent. If exact cache lineage is unavailable,
require a fresh lookup after its source changes. A still-valid original screenshot
does not authorize a cached directory record whose source has been removed.
This finding was initially open alongside diagnostic-generation resurrection;
the dated re-review below closes the demonstrated paths after the fixes.


## Re-review: screenshot and directory fixes

The final review read migrations 064/065, `productRunStorage.ts`, the actual
HTTP wrapper and screenshot checkpoint call sites. Generation changes now
atomically erase prior root content, span content and feedback text. The new
root input is a content-free envelope, permitting a valid current canonical
output without restoring old context. Each sink keeps its originally admitted
generation; a delayed old-generation flush retains metadata only.

The stronger independent probe populated a consistent canonical task revision,
read a real subject into a span, submitted actual feedback through
`ProductRunService.react`, deleted the subject and saved a newer canonical
checkpoint. It then appended a previously captured old-generation span:

```json
{"case":"rebind_late_span_feedback","initialMarkerVisible":true,"afterDeletionAvailable":false,"currentOutputRetained":true,"oldMarkerVisible":false,"oldMarkerInSQL":false,"lateSpanMetadataRetained":true,"feedbackHistoryCount":1,"feedbackContentPurged":true}
```

Source `/tmp/get9-review-generation-late-span.mts`; log
`/tmp/get9-review-generation-late-span.log`, exit 0. The initial visible marker
matters: omitting the sink's fourth generation argument would have tested an
always-metadata-only path and could not establish removal of existing content.
The older focused rebind probe also passed in
`/tmp/get9-review-screenshot-rebind-fixed.log`.

Migration 065 resets unfiled directory-derived caches on subject/context deletion,
status or label changes, and assignment subject rebinding. It preserves original
image/extraction state, advances task revision and lease epoch, and allows a new
lookup. The read guard and SQL availability additionally validate directory
references against current account-local active records.

A further independent counterexample found that comparing only the Run's old
output revision still admitted a late pre-deletion response: canonical revision
2, late response revision 1, deleted candidate visible again. That failed result
is retained in `/tmp/get9-review-canonical-candidate-stale.log`. The final helper
locks the actual canonical task first and rejects a lower revision before any
Run rebinding. Re-running the same counterexample produced:

```json
{"case":"canonical_screenshot_candidate_after_source_deletion","beforeCandidateMarker":true,"afterCandidateMarker":false,"returnedStatus":"waiting_for_user","candidateCount":0,"currentCanonicalRevision":2,"lateOutputRevision":1,"staleMonitorContainsDeletedCandidate":false,"canonicalSQLAvailable":true}
```

Source `/tmp/get9-review-canonical-candidate-stale.mts`; corrected-result log
`/tmp/get9-review-canonical-candidate-stale-fixed.log`, exit 0. These results close
the demonstrated diagnostic, canonical-candidate and late-response P1 paths.

## Re-review: HTTP lock order and Lab directory cleanup

The first helper fix alone left `onSend` updating the Run before locking its
canonical screenshot. Against a checkpoint holding the task and then requesting
the Run, an independent two-connection probe reproduced PostgreSQL `40P01` on
the HTTP side. The actual HTTP wrapper now locks the account/user-owned task
before its first Run UPDATE, matching checkpoint order.

The fixed-order probe completed both transactions without a deadlock:

```json
{"case":"http_checkpoint_lock_inversion","results":[{"path":"http","code":"OK"},{"path":"background","code":"OK"}],"deadlockObserved":false}
```

Sources `/tmp/get9-review-http-checkpoint-locks.mts` and its `-fixed.mts` variant;
logs use the same basenames. This tests the matching SQL sequence and actual
save helper, not a full HTTP/background scheduler. The original probe's final
cleanup initially omitted its assignment row; the known synthetic account was
then removed by `/tmp/get9-review-clean-lock-fixture.mts`. That cleanup error is
not counted as a product regression.

The retained Lab stop probe was extended with a real subject, assignment and
waiting screenshot containing their directory projections. With migration 065's
precise transaction-local cleanup exemption, real stop still rejected the active
SDK binding and removed all account data:

```json
{"case":"real_lab_stop_pending_writer","committedBefore":2,"writerWaitingOnLock":true,"ordinaryHeartbeat":"HARNESS_SOURCE_CHANGED","state":"deleted","cleanupError":null,"dataRows":0,"activeSessions":0,"remainingHarnessEntries":0,"elapsedMs":125}
```

Source `/tmp/get9-review-lab-stop-directory.mts`; log
`/tmp/get9-review-lab-stop-directory-second.log`, exit 0. The first variant had
an explicit SQL parameter-cast mistake before exercising the product boundary;
its log remains separate. The controlled exemption requires the exact target
account flag, deleting Lab workspace and revoked Lab user. Ordinary source
DELETE without that cleanup transaction still invokes cache invalidation, as
the independent candidate-deletion probe demonstrates.
