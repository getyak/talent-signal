# GET-9 Harness acceptance evidence

Status: **acceptance in progress**, 2026-09-10. This index routes to observations;
it does not grant release authority. The committed integration checkpoint is `fc900819`; reviewed routing, transport and schema repairs follow it.
GET-23 is merged into the work branch; release acceptance is still open. Each live
artifact retains its effective prompt/skill hashes, model receipt and fixture.
Earlier passing batches do not claim an identical final source revision.

## Live scenario matrix

The unchanged rubric requires at least 3/4 in each applicable dimension:
task completion, grounding, naturalness and recovery. Recovery is unscored when
no fault and repair occurred. Small passing batches do not establish reliability.

| Case | Latest reviewed evidence | Result and boundary |
| --- | --- | --- |
| E01 conversation | [eighth quality review](e01-eighth-quality-review.json) | 3/3; latest typed-tool runtime, actual Hao SDK and synthetic dialogue. Minor beverage generalizations scored3, not4. |
| E02 original profile image | [fifth quality review](e02-e04-fifth-quality-review.json) | 3/3; real image/SDK/HTTP/database and scripted human field review, not UI upload. |
| E04 existing identity | [same fifth review](e02-e04-fifth-quality-review.json) | 3/3; stable handle reuses person, seeded relationship Memory preserved. |
| E05 research | [eleventh quality review](e05-eleventh-quality-review.json) | 3/3; actual SDK and product research with controlled Exa-shaped fictional pages, not real public-search recall. |
| E07 fresh-Session Memory | [ninth quality review](e07-ninth-quality-review.json) | 3/3; latest runtime and explicit host proxy, fresh Sessions with sourced Memory/preferences. Eighth remains2/3; no reliability claim. |
| E10 calendar | [eighth combined review](e10-eighth-combined-quality-review.json) | 3/3 eventual drafts plus exact native confirmation, EventKit readback and cleanup. Trial 2 required explicit retry; not a complete live-chat-to-device UI journey. |

Every previous attempt remains in this directory, including failed quality,
budget and provider runs. E05 tenth remains 2/3; source wording was promoted
into unsupported professional experience. Literal field checks now reject
that observation label, while qualified inference still requires semantic review.
E07 fifth remains 2/3 because one answer added an unnecessary clarification.
No score, timeout, token budget or test threshold was lowered to pass a case.

Named-contact routing [strict-operation batch](contact-flat-first.json) passes
3/3 with one search/read pair each, no API retries and 10.958–17.114 seconds.
The [operation review](contact-operation-review.md) distinguishes typed tools
from the host's unchanged identity/authorization checks. Earlier
[third batch](contact-lookup-third.json) remains 2/3; [proxy-only experiment](contact-proxy-experiment-first.json)
remains 1/3 despite three completed model runs without API retries. Proxy access
alone does not repair tool use. The [stop-hook experiment](contact-stop-hook-experiment-first.json)
is not implemented in production and grants no release authority.

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
  The integrated build passes all 543 unit tests. The latest [three canonical journeys](ios-canonical-flat-fifth.json) pass
  unchanged response/evidence gates in41.816/52.612/45.467 seconds using explicit
  host proxy and typed operation tools. Earlier [serial failures](ios-canonical-third.json)
  and [proxy-only2/3](ios-canonical-proxy-fourth.json) remain visible. The later
  raw-argument hook patch has separate MCP/unit proof; this native batch predates it.
- [Exa probe](exa-staging-live-probe.json): actual search and fetch succeeded.
  [TikHub probe](tikhub-staging-live-probe.json): credential/health proof only.
- Chrome integrated extension contract checks passed; actual installed-extension
  handoff remains pending the browser installation boundary.
- [Staging configuration](staging-harness-configuration.json) records provider
  preparation; [actual deployment](testflight-deployment-first.json) now proves
  runtime revision `421c02d6`, migration 065, real synthetic chat/voice probes,
  Apple authentication and HTTPS. Existing Serve routes are unchanged. Physical
  TestFlight device and final PR/CI/merge acceptance remain outstanding.

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
