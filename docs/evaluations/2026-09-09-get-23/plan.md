# GET-23 — Product feedback and execution monitoring

## Outcome

Real Web and iOS Agent answers appear in one inspectable monitoring page whether
the user marks them helpful, not helpful, or leaves no feedback. Optional reasons
and corrections remain easy to enter, reversible, and linked to the exact answer
and original execution. Cases can drive the existing evaluation workflow and a
Promptfoo adapter without a competing case store.

User authorization: implement the accepted GET-23 review, including the normal
Linear branch, independent review, PR, CI, merge, and issue-completion workflow.
The user prioritizes intelligence, evaluation usefulness, and convenience. Do
not add privacy approval steps or treat missing feedback as positive feedback.

## Baseline and scope

- Worktree: `/Users/cubxxw/data/talent-signal-get23`.
- Branch: `codex/get-23-feedback-evaluation`, origin/main `56292d3c`.
- GET-9 is active independently; avoid modifying its runtime architecture.
- Existing source includes execution snapshots, correction feedback, regression
  derivation, iOS correction UI, and private runtime observation outbox.
- Existing thumbs still update Session metadata. Web/iOS parity, unscoped
  execution coverage, monitoring, and convenient optional reasons need work.
- Preserve authentication, source/version integrity and external-action semantics.
- No model-generated claim of successful learning; report measurable results.

## Delivery state

Implementation and independent review are complete locally.
[PR #170](https://github.com/getyak/talent-signal/pull/170) is open. Current-head
CI, merge and deployment verification remain pending; Linear is not yet complete.

## Implemented

- Default product run capture across scoped/unscoped Chat, screenshot intake and
  person research; owner-scoped monitoring, status/platform filters and previews.
- Immediate Web/iOS helpful/unhelpful/withdrawal with optional reasons, comments,
  corrections and exact-answer feedback history; recoverable conflict/retry.
- Frozen relationship-text cases in the existing Lab, A/B selection, deep links,
  export and a Promptfoo provider using the existing admitted job executor.
- Request-local model/tool capture, queued persistence outside transactions,
  screenshot resume capture and canonical source/version invalidation.

## Local verification

- PostgreSQL: 29/29 product feedback and learning integration tests on a fresh
  owned database. The subsequent canonical request-ID change passed 7/7 focused
  tests, including identical requests with reversed JSON key ordering.
- Agent: 26/26 provider/capture tests. Eval runner: 203/203 (two workers).
- Web: 357 passing, one existing skipped test; typecheck, lint and production
  build passed. Final Lab/deep-link changes passed repeated typecheck/lint and
  actual UI A/B execution. Backend: 375 passing, 80 opt-in integration tests skipped in its
  default suite; those relevant to GET-23 ran separately above.
- iOS: signed Simulator build and 12/12 focused feedback tests passed. Initial
  parallel test-runner connection hung; serial retry succeeded.
- All 59 migrations through 058 applied to a fresh owned PostgreSQL database.
  The normal migration command's checksum/idempotency readback also ran.
- Documentation and architecture checks passed.
- CI follow-up: registered the proof database/Eval session variable names and
  moved all new native feedback copy into the localization catalog; manifest
  tests passed 11/11 and localization policy passed.
- Restored the Lab workspace manifest for the new product-run tables and their
  existing Session/feedback dependencies. The real workspace lifecycle now
  passes creation, late-write rejection and deletion of runs, spans, feedback
  events and linked cases. The 29 feedback tests passed again with these guards.
  This lifecycle evaluation now runs in backend CI.


## Real UI evidence

Actual Chrome and native iOS Simulator clients used the real local HTTP product
routes and PostgreSQL. The provider intentionally returned controlled synthetic
answers; these receipts prove interactions, version linkage and replay plumbing,
not live-model quality improvement.

- `web-monitor-three-states.png`: Web unhelpful, iOS helpful and iOS unrated in
  the same monitoring page, with distinct counts and platform labels.
- `web-feedback-detail.jpg`: immediate rating plus optional reason, comment,
  correction and the exact historical answer.
- `web-case-saved.jpg`: real Web negative feedback converted to a Lab case.
- `web-lab-comparison.jpg`: the case's original input run with baseline/concise,
  two completed attempts, independent structural checks and unknown semantics.
- `ios-helpful-restored.jpg`: native helpful state restored from the backend.
- `ios-unhelpful-note.jpg`: native unhelpful saved immediately; a reason and keyboard-entered note were
  persisted and independently read back at feedback revision 4.
- Web helpful and a new Web unrated request were exercised too.
  Native source-change recovery surfaced an existing stale Session source
  explicitly; this did not erase the saved vote or notes.

The development proof database spans earlier implementation iterations; the
latest canonical-ID regression guards against native JSON field-order changes
creating duplicate runs. No historical production data is synthesized/backfilled.

## Independent review

See [review.md](review.md). All confirmed P1/P2 findings were fixed. The final
request-ID and Lab navigation changes also passed focused independent review.

## Remaining delivery

1. Verify all latest-head CI and merge gates on PR #170.
2. Merge, verify applicable deployed surfaces and release state, then close
   GET-23 only when its acceptance evidence is satisfied.
