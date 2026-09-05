# iOS screenshot-to-Session P0

## Outcome

Make an intentional iOS screenshot capture create one durable Agent Session and
start processing immediately. The normal successful path leaves the foreground
quiet; Today and Capture show only active work or a concrete decision that
requires the recruiter.

Completion is observable when one capture keeps a stable Session identifier
across retry, on-device OCR reaches the backend only as proposed evidence, a
non-blocking result leaves the capture queue, and ambiguous or failed processing
opens the exact affected item.

## Boundary

- iOS Photos and App Shortcut screenshot entry, local protected recovery,
  Session history, exception UI, accessibility, and localization.
- Backend contract and validation needed to accept machine-extracted screenshot
  text with proposal-only authority.
- Capture intent authorizes processing, reversible proposals, and source
  attachment for one current confirmed identity clue, one person, and one
  existing relationship context. It does not confirm extracted facts, speaker
  attribution, or external effects.
- Raw screenshots remain device-owned. Removing a local item does not claim to
  delete any governed proposed text already accepted by the backend.
- Contact-file import, action execution, claim-level image crops, and retention
  countdown UI remain outside this P0 slice.

## Evidence and approach

- `PendingCaptureInbox` already offered protected, account-scoped recovery but
  treated every item as a review task.
- Give every staged screenshot a stable Session ID and processing state.
- On foreground availability, create or restore that Session, run local OCR,
  save an immutable proposed capture request, and record the result in Session
  history.
- Keep a capture visible only while queued/processing or when identity or
  relationship context is ambiguous, historical, missing, or a tool fails.
- Reuse the canonical identity/fact screen for the exact blocker instead of
  asking the recruiter to review OCR before any tool runs.

## Milestones

1. Complete: stable capture Session metadata, background processor, retry
   recovery, and proposal-only backend intake.
2. Complete: Photos and Shortcuts enqueue the same flow; Today and Capture show
   active work and decision-only cards.
3. Complete: focused unit, backend, Simulator UI, localization, documentation,
   and visual verification passed.

## Completion proof

- A screenshot gets one stable Session ID before OCR or network work begins.
- Relaunch or retry does not create a second Session or duplicate capture.
- Machine OCR is rejected by the backend unless every fragment remains proposed
  and unconfirmed.
- A unique current identity and relationship match attaches the source, records
  an informational Session turn, and removes the local queue item without
  notifying Today. Its extracted facts remain proposed.
- A blocking ambiguity or failure marks the Session unread and opens the exact
  saved capture from Today or Capture.
- Light, dark, Chinese, long-filename, deletion, and accessibility-size output
  remains understandable and reachable.

## Verification

- iOS 26.5 Simulator: 28 `RelationshipCaptureTests` passed, including stable
  Session deduplication, guarded automatic source attachment, blocking
  ambiguity, and proposal-only request encoding.
- iOS 26.5 Simulator: three focused `CandidateSignalUITests` passed for Today,
  Capture, exact decision opening/deletion, and Chinese dark AX5 reachability;
  final light and dark output was inspected from retained screenshots.
- Backend: 53 focused request-validation, migration, and readiness tests passed.
- Backend and web typechecks, iOS localization validation, `pnpm docs:check`,
  and `git diff --check` passed.
