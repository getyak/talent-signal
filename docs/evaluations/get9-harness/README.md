# GET-9 Harness acceptance evidence

Status: **acceptance in progress**, 2026-09-10. This index routes to observations;
it does not grant release authority. The current checkpoint is `fc0a023c` plus
the reviewed source-literal, revocation and Web-continuity changes. Each live
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
| E07 fresh-Session Memory | [seventh quality review](e07-seventh-quality-review.json) | 3/3; fresh Session retrieves source and saved preference. Sixth remains 1/3 with two pre-response SDK timeouts. |
| E10 calendar | [eighth combined review](e10-eighth-combined-quality-review.json) | 3/3 eventual drafts plus exact native confirmation, EventKit readback and cleanup. Trial 2 required explicit retry; not a complete live-chat-to-device UI journey. |

Every previous attempt remains in this directory, including failed quality,
budget and provider runs. E05 tenth remains 2/3; source wording was promoted
into unsupported professional experience. Literal field checks now reject
that observation label, while qualified inference still requires semantic review.
E07 fifth remains 2/3 because one answer added an unnecessary clarification.
No score, timeout, token budget or test threshold was lowered to pass a case.

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
  Interrupted for diagnosis. Native-database reproduction is still running.
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

Latest backend source: all 477 tests passed across the main run (415 passed,
62 environment-gated skips) and the targeted remaining database run (63 passed,
including one overlap). Agent: 144 passed, one environment-gated skip. Logs:
`/tmp/get9-backend-full-final-db.log`,
`/tmp/get9-backend-final-remaining-db.log`, `/tmp/get9-agent-final-tests.log`.
Web continuity typecheck, lint and production build passed; the build used an
ephemeral process-only AUTH_SECRET after a missing-secret failure. Current-head
CI remains pending. These are local checks, not merged-release proof.
