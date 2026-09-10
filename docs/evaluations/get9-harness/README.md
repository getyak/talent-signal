# GET-9 Harness acceptance evidence

Status: **acceptance in progress**, 2026-09-10. This index routes to observations;
it does not grant release authority. The committed integration checkpoint is `fc900819`; reviewed routing, transport and schema repairs follow it.
GET-23 is merged into the work branch; release acceptance is still open. Each live
artifact retains its effective prompt/skill hashes, model receipt and fixture.
Earlier passing batches do not claim an identical final source revision.

## Late PR review

The exact `630961ea` CI was green, but four unresolved review threads correctly
blocked merge. [Independent review](pr-blocking-review.md) and
[delta verification](pr-review-verification.json) track the repairs separately.
The [real clock/continuation probe](pr-review-clock-final.json) proves three SDK
turns with one continuation identity and a correctly staged year-boundary draft.
Its [first setup failure](pr-review-clock-first.json) is retained. These checks
are not a replacement full native suite or a new rubric score for earlier cases.

## Live scenario matrix

The unchanged rubric requires at least 3/4 in each applicable dimension:
task completion, grounding, naturalness and recovery. Recovery is unscored when
no fault and repair occurred. Small passing batches do not establish reliability.

| Case | Latest reviewed evidence | Result and boundary |
| --- | --- | --- |
| E01 conversation | [eighth quality review](e01-eighth-quality-review.json) | 3/3; latest typed-tool runtime, actual Hao SDK and synthetic dialogue. Minor beverage generalizations scored3, not4. |
| E02 original profile image | [seventh quality review](e02-e04-seventh-quality-review.json) | 3/3; real image/SDK/HTTP/database and scripted human field review, not UI upload. |
| E04 existing identity | [same seventh review](e02-e04-seventh-quality-review.json) | 3/3; stable handle reuses person, seeded relationship Memory preserved. |
| E05 research | [sixteenth quality review](e05-sixteenth-quality-review.json) | Execution/quality 3/3; scores 4/3/3/3, 4/4/3/3, 4/4/3/3. Injected fetch recovery reaches formal SDK completion within unchanged budgets; fifteenth token failure remains. actual SDK and product research with controlled Exa-shaped fictional pages, not real public-search recall. |
| E07 fresh-Session Memory | [ninth quality review](e07-ninth-quality-review.json) | 3/3; latest runtime and explicit host proxy, fresh Sessions with sourced Memory/preferences. Eighth remains2/3; no reliability claim. |
| E10 calendar | [tenth combined proof](e10-tenth-combined-quality-review.json) | 3/3 live drafts and exact native confirmation/readback/cleanup; each scores 4/4/3, recovery not exercised. Frozen host clock fixes ninth-batch date drift. Component continuation on Simulator, not uninterrupted Chat or physical-device proof. |

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

- [Latest Web readback](web-final-source-readback.json): real production build, existing synthetic account, reviewed source fields and explicit fact boundary.
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
  The integrated build passes all 543 unit tests. The latest [three canonical journeys](ios-canonical-final-sixth.json) pass
  unchanged response/evidence gates in 47.065/56.338/39.165 seconds on source
  `7507b604`, including typed operation tools and the raw-argument hook. Release
  build proof is reused from the unchanged native source. Earlier [serial failures](ios-canonical-third.json),
  [proxy-only 2/3](ios-canonical-proxy-fourth.json) and [pre-hook 3/3](ios-canonical-flat-fifth.json) remain visible.
- [Exa probe](exa-staging-live-probe.json): actual search and fetch succeeded.
  [TikHub probe](tikhub-staging-live-probe.json): credential/health proof only.
- Chrome integrated extension contract checks passed; actual installed-extension
  handoff remains pending the browser installation boundary.
- [Staging configuration](staging-harness-configuration.json) records provider
  preparation; [final deployment](testflight-deployment-final.json) proves
  runtime source revision `940e81b0` and matching immutable image, migration 065, real synthetic chat/voice probes,
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
Agent: 157 passed plus one skip with reviewed diagnostics, frozen calendar clock and cleanup-receipt fixes. Web: 398 passed plus one skip; lint and types
pass, and the integrated production build passes. The earlier failed Web
assertions remain in `/tmp/get9-web-integrated-tests.log`; corrected expectations
include the platform header and shared UI cleanup helper name.

[State projection review](state-projection-review.md) verifies exact duplicate successful navigation metadata can be omitted from the ephemeral SDK transcript without changing stored results, evidence, error refresh or domain guards; compaction recovery remains a stated limitation.

[Cleanup receipt review](cleanup-receipt-review.md) verifies that cleanup errors cannot mask primary failures or observed usage; all cleanup stages are attempted.

[Integration boundary review](integration-draft-boundary-review.md) records all
new P1 counterexamples and their independent follow-up. Empty and GET-23 database
baselines reach 68 migrations and repeat successfully. These are local checks,
not merged-release proof. Current-head CI/merge, post-merge iOS release and final Linear closure remain
pending; installed Chrome and physical-device evidence are explicitly unverified.

## Late native source-retraction audit

[Independent identity/navigation review](identity-context-review.md) covers the
same-snapshot identity context supplied with filtered Memory and the native
citation selector. [Complete recovery proof](ios-canonical-dispute-governed-final.json)
passes in 42.115 seconds using an explicitly synthetic executor and real host
search/read, scoped HTTP, PostgreSQL, dispute/retraction and canonical Today
navigation. It asserts the invalidated response and its old action link are
removed before opening the same current Pursuit. This is not a real SDK or
model-quality pass, nor a full native-suite rerun.

Retained attempts: [live no-handoff](ios-canonical-dispute-live-first.json),
[incorrect null-provider setup](ios-canonical-dispute-null-provider.json),
[live identity denial and duplicate-citation selector failure](ios-canonical-dispute-live-traced.json)
with [tool trace](ios-canonical-dispute-live-trace.jsonl),
[identity-fixed live citation/dispute/stale proof with obsolete old-link failure](ios-canonical-dispute-live-identity-fixed.json)
with [tool trace](ios-canonical-dispute-identity-fixed-trace.jsonl), and
[incorrect new-session close selector](ios-canonical-dispute-governed-first.json).
The original five full-suite failures have four same-name passing retests and
this remaining case now has an explicit current-retraction-contract adaptation.
Earlier complete/partial live batches remain sampling evidence, not a guarantee
that every future named-contact routing turn will succeed.
