# Voice-to-Agent ribbon and Ask Live Activity

> Superseded on 2026-09-06 by
> [`2026-09-06-ios-voice-composer-design.md`](2026-09-06-ios-voice-composer-design.md):
> release now creates an editable transcript draft and requires a separate Send.

## Outcome

This historical plan made voice a direct Agent input and a submitted Ask visible
as one calm, privacy-safe Live Activity. Its original release-to-send behavior is
no longer current: the superseding plan keeps live words provisional, creates an
editable transcript on release, and starts the Ask only after explicit `Send`.

## Boundary

In scope: the Relationship Ask composer, foreground voice recording and
transcription, direct voice submission, Ask lifecycle projection, Dynamic
Island/Lock Screen rendering, exact Session deep links, reduced motion,
accessibility, failure, timeout, and retry entry.

Out of scope: background microphone capture, transcript or candidate content in
ActivityKit payloads, server push updates after the app process is suspended,
and any automatic contact, calendar, message, or proposal approval.

## Evidence and approach

- The current voice control records on tap, produces an editable draft, and
  requires a second Send. Recording status lives above the composer.
- `RelationshipAskView` already protects typed intent and retries before the
  network request. The new lifecycle starts only after that protection exists.
- Existing Agent Work Live Activity is a synthetic generic work fixture. A
  dedicated Ask activity avoids treating a response as a suggested action and
  keeps the payload narrowly scoped to opaque workspace/session/instance IDs.
- The selected visual target is the 2026-09-05 combined voice-ribbon board:
  `/Users/cubxxw/.codex/generated_images/01a06d61-44de-7512-b111-cf2be75c91a9/exec-1603bb2e-0163-41e0-8fbe-6d7f90b9ff86.png`.

## Milestones

1. **Complete — Input loop:** replace detached recording status with an expanding
   composer ribbon, add hold/release/lock/cancel behavior, best-effort on-device
   live words, and direct submission after remote transcription.
2. **Complete — Message lifecycle:** add the private Ask ActivityKit contract,
   controller, living relationship-gap mark, concise state projection, and exact
   Session deep link.
3. **Complete — Proof:** cover state/identity/gesture contracts with focused tests
   and inspect the real Simulator surface in normal, failure, timeout,
   reduced-motion, and accessibility states.

## Completion evidence

- No audio is captured before an explicit hold/tap and first-use disclosure.
- Temporary audio is deleted after transcription or cancellation; Live Activity
  carries no question, transcript, person, or relationship text.
- Review opens the exact protected Session. Failure and timeout preserve the
  original retry path and cannot duplicate the governed request.
- The complete iOS unit suite passes: 447 tests, zero failures.
- Focused Simulator journeys pass for physical hold-and-release, hands-free tap,
  live words, typed-text isolation, ordinary send, failure/retry, and the four
  SpringBoard Dynamic Island states.
- `pnpm ios:localization:check`, `pnpm docs:check`, diff validation, and a clean
  Release Simulator build pass. The credentialed remote-provider UI journey
  remains environment-gated; deterministic capture and the isolated loopback
  backend provide the retained local proof.
