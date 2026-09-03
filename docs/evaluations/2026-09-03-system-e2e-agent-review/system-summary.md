# System E2E and Agent review summary

## Outcome

The post-change working tree is **pass with changes** for the executable Web,
iOS Simulator, macOS fixture, Agent, backend-CI, and evaluation lanes. Every
product defect reproduced during this review was corrected and retested from a
real product surface. The release gate remains **needs evidence**, not pass,
because the canonical backend accepted connections but did not return health or
product responses, and human VoiceOver and physical-device checks were not run.

The frozen baseline commit
`5ba505ae45e3df51b3339427da79c96fde42c137` is not releasable. The corrected
source is identified by
[`post-change-manifest.json`](post-change-manifest.json), and the final
multi-lens adjudication is in [`panel.json`](panel.json).

The entire run used repository-owned synthetic fixtures and disposable local
state. It sent no candidate communication, changed no Contacts, Calendar, ATS,
CRM, reminder, or notification destination, and used no production candidate
data or provider credentials.

## Real surfaces exercised

| Surface | Direct execution | Result |
| --- | --- | --- |
| Web | Public, auth, workspace, Today, People, Evals, Lab, boundary demo, blog, privacy, 404, desktop, and 390 px browser routes; 46 retained screenshots | All executable and failure-state routes pass after retest; account-backed success routes remain not run because the backend was unhealthy |
| iOS | iPhone 17 Pro and iPhone SE (3rd generation), English and Simplified Chinese, AX5, dark appearance, and Reduce Motion | Baseline 11/11 and 8/8 UI journeys pass; 266/266 unit tests pass; post-change Today 1/1, People 2/2, and SE AX5 Ask/Today/People 3/3 pass |
| macOS | Built native app operated through real macOS accessibility/UI events, keyboard flow, dark appearance, Reduced Motion, window resizing, 200% text, and synthetic terminal states | The source-bound five-gate evidence flow and 200% layout retest pass; `pnpm macos:check` passes |
| Agent and system | Agent packages, backend CI, deterministic P0 oracles, evaluation runner/library, safety contracts, secret boundary, brand, and documentation | Agent 73/73, backend CI 256/256 plus Agent 50/50, V1 P0 12/12 with 71 assertions and 30 Agent trials, and all executed validation suites pass |

## Corrections made and proved

### Web

- Logout now completes locally after a bounded backend deadline instead of
  hanging indefinitely.
- Lab now settles into an explicit unavailable state after six seconds, creates
  no false session state, and offers a real retry.
- Today, People, and Evals use truthful disconnected states instead of dead
  controls or ambiguous empty content.
- Resolved identity now shows the actual person and role rather than only an
  internal identifier.
- Public and workspace skip links move focus to `main#main-content`.
- The boundary demo more clearly separates fact review, action review,
  ambiguity, and valid `no_action` outcomes.
- Generated review and action copy is localized to Chinese without changing raw
  evidence.
- Above-fold current images are eagerly loaded; browser retests of home, blog,
  and article routes emit no new LCP warnings.

Post-change Web proof: 311 passed tests and one intentional skip; lint,
typecheck, and the production build with a non-persisted synthetic
`AUTH_SECRET` pass.

### iOS

- Ask keeps provenance reachable and lets the final response line scroll fully
  above the composer at AX5.
- Today no longer truncates calendar context.
- People preserves the full role and Pursuit context at default and
  accessibility sizes.

The final `ios:check` attempt completed localization and a Release Simulator
build, then was interrupted when its Docker integration phase could not obtain
a healthy isolated backend. It is not counted as a completed check. The
separate completed unit and direct UI result bundles are the iOS authority.

### macOS

- Submission eligibility, frozen evidence, and the idempotency key are bound to
  the exact current source item. An older reviewed item can no longer authorize
  a newly visible unreviewed item.
- The real-app retest proves: unconfirmed current evidence disables save;
  selecting Candidate alone still disables save; confirming the exact source
  enables save; the decision contains only that source; and the receipt says
  nothing was sent.
- At 200% text in dark appearance, the full mixed-script identity retains
  semantic title sizing, the receipt is visible in the first viewport, and one
  scroll reaches the complete local-handoff controls.

## Independent Agent adjudication

Three independent review lenses were run against the frozen scenario and
post-change evidence:

- recruiter workflow: `pass_with_changes`, score 2, direct confidence;
- evidence safety: `pass_with_changes`, score 2, direct confidence;
- mobile UX: `pass_with_changes`, score 3, direct confidence.

Candidate-experience and selection-science lenses were intentionally omitted:
the scenario sends no candidate-facing communication and introduces no
assessment, comparison, or person ranking. All four review JSON contracts,
including the panel, validate successfully.

## Remaining release evidence

1. Restore one isolated healthy canonical backend, then run Web and iOS through
   account identity, Today, Pursuit, exact-evidence approval, truthful receipt,
   destination readback, response-loss reconciliation, and duplicate
   prevention. All 12 live release cases remain `needs_review` until that proof
   exists.
2. Perform a human VoiceOver traversal and a physical-device pass across Today,
   Ask, People, evidence review, action preview, receipt, and recovery.
3. Treat the localization inventory of 164 transitional bilingual calls and
   209 raw SwiftUI literals as follow-up debt; the executed localization
   boundary itself passes.

These gaps do not invalidate the bounded corrections or the truthful offline
behavior. They prevent an honest claim that the whole product is ready for
release.

## Environment handoff

Both task-owned Docker projects used during isolated backend attempts were
checked after interruption. Their container, volume, and network lists are
empty. No shared or user-owned Docker project was stopped or removed.

Detailed evidence:

- [Web run summary](web/web-run-summary.md)
- [iOS run summary](ios/ios-run-summary.md)
- [macOS run summary](macos/macos-run-summary.md)
- [Deterministic system checks](checks/run-summary.md)
- [Final adjudication](panel.json)
