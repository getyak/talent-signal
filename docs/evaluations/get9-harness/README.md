# GET-9 Harness acceptance evidence

Status: **acceptance in progress**, 2026-09-10. This index routes to observations;
it does not grant release authority. The committed integration checkpoint is `fc900819`; reviewed lookup guidance and Lab display-count repairs follow it.
GET-23 is merged into the work branch; release acceptance is still open. Each live
artifact retains its effective prompt/skill hashes, model receipt and fixture.
Earlier passing batches do not claim an identical final source revision.

## Live scenario matrix

The unchanged rubric requires at least 3/4 in each applicable dimension:
task completion, grounding, naturalness and recovery. Recovery is unscored when
no fault and repair occurred. Small passing batches do not establish reliability.

| Case | Latest reviewed evidence | Result and boundary |
| --- | --- | --- |
| E01 conversation | [seventh quality review](e01-seventh-quality-review.json) | 3/3; actual Hao SDK, authorized synthetic dialogue. |
| E02 original profile image | [fifth quality review](e02-e04-fifth-quality-review.json) | 3/3; real image/SDK/HTTP/database and scripted human field review, not UI upload. |
| E04 existing identity | [same fifth review](e02-e04-fifth-quality-review.json) | 3/3; stable handle reuses person, seeded relationship Memory preserved. |
| E05 research | [eleventh quality review](e05-eleventh-quality-review.json) | 3/3; actual SDK and product research with controlled Exa-shaped fictional pages, not real public-search recall. |
| E07 fresh-Session Memory | [eighth live evidence](e07-eighth-live.json) | 2/3; one 60-second timeout with no model response or tool call. Earlier seventh quality batch remains 3/3; not a reliability claim. |
| E10 calendar | [eighth combined review](e10-eighth-combined-quality-review.json) | 3/3 eventual drafts plus exact native confirmation, EventKit readback and cleanup. Trial 2 required explicit retry; not a complete live-chat-to-device UI journey. |

Every previous attempt remains in this directory, including failed quality,
budget and provider runs. E05 tenth remains 2/3; source wording was promoted
into unsupported professional experience. Literal field checks now reject
that observation label, while qualified inference still requires semantic review.
E07 fifth remains 2/3 because one answer added an unnecessary clarification.
No score, timeout, token budget or test threshold was lowered to pass a case.

Named-contact routing [third live batch](contact-lookup-third.json) and
[independent review](contact-lookup-third-review.json) remain **2/3**. One SDK
timeout, one clean lookup/read, one successful recovery from two invalid tool
requests. Successful host handoffs do not validate the subsequent scoped answer.
The [first batch](contact-lookup-first.json) remains 2/3 with incomplete tool
instrumentation; a second command failed syntax checking before model execution.

## Surface and provider proof

- [Web reviewed profile](web-profile-reviewed-readback.json): user-edited fields
  and saved readback retain the original source quote.
- [Web calendar conversation](web-calendar-conversation-proof.json): editable
  draft and explicit export UI; no external calendar-event creation claim.
- [Web scope return](web-scope-return-proof.json): original conversation and
  calendar draft survive scoped navigation; follow-up uses the same Session.
- [Web stale login](web-stale-login-proof.json) and
  [preference login binding](web-preference-login-proof.json): stale tabs are
  rejected before a different account can receive work or preference changes.
- [iOS initial run](ios-full-first-interrupted.json): release build and 539 unit
  tests passed; 76 UI cases passed, five failed, three explicitly skipped.
  Interrupted for diagnosis. The integrated build passes all 543 unit tests;
  three real-Hao canonical journeys failed the existing response waits in
  `/tmp/get9-ios-integrated-hao.xcresult`. A second run also failed all three canonical journeys: one missing citation after skipped lookup and two response waits. The latest lookup guidance requires a new native run.
- [Exa probe](exa-staging-live-probe.json): actual search and fetch succeeded.
  [TikHub probe](tikhub-staging-live-probe.json): credential/health proof only.
- Chrome integrated extension contract checks passed; actual installed-extension
  handoff remains pending the browser installation boundary.
- [Staging configuration](staging-harness-configuration.json) now selects the
  verified Hao model with its dedicated credential; running TestFlight containers
  are not yet replaced. Physical-device reachability and final deployment/PR/CI/
  merge proof remain outstanding.

## Code and regression proof

[Independent source/concurrency review](source-literal-review.md) closes the
revocation-liveness and append-loss P1s using independent connection probes and
14/14 database tests. Earlier rejected savepoint probes remain in that record.
Account-wide source metadata serialization remains a separate open performance
question; do not infer its cause from an unrelated slow UI run.

[Integrated checkpoint](get23-integration-checkpoint.json) retains the current
checks and open native gates. After GET-23 integration, the latest full backend run passes all 491 tests with
explicit database environments (`/tmp/get9-integrated-backend-full-third.log`).
Agent: 146 passed plus one skip. Web: 398 passed plus one skip; lint and types
pass, and the integrated production build passes. The earlier failed Web
assertions remain in `/tmp/get9-web-integrated-tests.log`; corrected expectations
include the platform header and shared UI cleanup helper name.

[Integration boundary review](integration-draft-boundary-review.md) records all
new P1 counterexamples and their independent follow-up. Empty and GET-23 database
baselines reach 68 migrations and repeat successfully. These are local checks,
not merged-release proof. Current-head CI, native surface acceptance, deployment
and final Linear closure remain pending.
