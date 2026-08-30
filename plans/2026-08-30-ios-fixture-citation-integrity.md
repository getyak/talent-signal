# iOS fixture citation integrity

## Outcome

The iOS Ask flow can cite synthetic contact evidence only when that evidence has
a real recruiter-review record, reports the right failure when review authority
is missing, and leaves no active synthetic people after the fixture server
shuts down.

## Boundary

- Preserve the existing rule that purging a raw source does not withdraw
  reviewed, purpose-scoped extracted evidence.
- Change only evaluator-owned synthetic fixture state and iOS validation copy.
- Do not touch unrelated Live Activity, archive, Ask-view, or web work already
  present in the worktree.

## Proof

- Backend fixture preparation creates `reviewed` fragments through the review
  endpoint and receives a non-empty review identifier.
- Fixture retirement cancels evaluator pursuits and deletes every fixture-owned
  capture through the governed deletion endpoint.
- Server shutdown waits for in-flight preparation and retires the final active
  fixture.
- iOS unit coverage distinguishes citation scope mismatch, unavailable source,
  and missing review authority.
- A real Simulator run against an isolated backend can Ask from the synthetic
  contact context without the false binding error.

## Status

- [x] Reproduced and traced the false binding error to a reviewed fixture
  fragment with `last_review_id = NULL`.
- [x] Implement fixture review integrity and lifecycle cleanup.
- [x] Implement precise iOS validation failure.
- [x] Run focused backend and iOS tests. Backend typecheck and 202 tests,
  isolated lifecycle integration, forced-crash recovery, direct `H` Ask
  readback, localization, docs, and 228 iOS unit tests pass. The final focused
  run passed both citation unit tests and the Robin Current XCUITest.
- [x] Verify the real Simulator journey and leave a clean app running. The
  iPhone 17 app is connected to the ready loopback backend and a fresh fixture;
  a final device screenshot confirms the canonical Today surface is visible.
