# iOS quiet capture queue

## Outcome

Make the Talent Signal screenshot App Shortcut finish after a durable local
enqueue, without opening the app or waiting for network work. Multiple captures
must remain reviewable after interruption, and no capture may bypass the
existing evidence and identity review sequence.

## Boundary

In scope:

- declare background App Intent execution on current iOS while preserving the
  iOS 16 deployment target;
- accept both file-backed and in-memory `IntentFile` input;
- replace the single pending slot with an atomic, FIFO, content-idempotent local
  queue;
- preserve per-capture OCR drafts and recovery after process termination;
- add privacy-safe timing events and focused unit coverage;
- build, test, launch, and inspect the real Simulator surface.

Out of scope:

- server upload before recruiter review;
- Live Activity creation (the Talent Signal client has none);
- image upload to an LLM or generative removal of system chrome;
- the unavailable Ailoha repository referenced by historical absolute paths.

## Current evidence

- `ImportConversationScreenshotIntent` performs only local file reading and
  persistence, but currently forces a foreground app launch.
- `PendingCaptureInbox` stores one `pending-image` and `pending.json`, so a
  second capture overwrites the first.
- the original screenshot stays on-device and reviewed text reaches the local
  backend only after explicit review; this boundary must remain unchanged.
- Xcode 26.4 is installed with iOS 26.1 simulators. Apple now documents
  `AppIntent.supportedModes` for foreground/background behavior and deprecates
  `openAppWhenRun` in the current SDK.

## Approach

1. Make the intent a background action, read either `IntentFile.fileURL` or
   `IntentFile.data`, atomically enqueue, log stage timings, and return.
2. Store each pending capture as independent UUID-keyed files. Keep a local
   SHA-256 fingerprint only to make an exact retry reuse a still-pending item;
   after completion, a later import receives a new purpose-scoped ID. Different
   captures remain independent and FIFO ordered.
3. Keep legacy single-slot data readable and migrate it into the queue on first
   access.
4. Teach the handoff store to advance to the next queued capture after the
   current one is removed, without automatically chaining review screens.
5. Prove queue ordering, deduplication, draft isolation, deletion, migration,
   build/test success, and a launched Simulator UI.

## Completion evidence

- focused inbox tests pass, including multiple capture, exact retry, draft
  isolation, removal, and legacy recovery;
- the iOS check builds and tests the generated project;
- the app is installed and launched on a booted iPhone Simulator, with a
  screenshot/UI inspection confirming the expected surface;
- relevant documentation checks pass and unrelated user changes remain intact.

## Verification record (2026-08-11)

- the focused `RelationshipCaptureTests` suite passed 10/10, including FIFO
  ordering, pending-only retry deduplication, purpose-scoped re-import, draft
  isolation, removal, and legacy migration;
- the complete iOS test run passed 29 unit tests and 11 runnable UI tests with
  zero failures; 2 integration UI tests were skipped because their explicitly
  authorized local fixture/backend was not running;
- the latest Release configuration built successfully for a generic iOS
  Simulator destination;
- the app was installed and launched on the booted iOS 26.1 QA Simulator and
  its visible first screen was captured for inspection;
- the remaining acceptance proof is an end-to-end invocation from the system
  Shortcuts UI with timing evidence for `intent_returning`; the local intent
  path itself contains no network or Live Activity work.

## Reconsideration signals

- If App Intents execute in a separate extension for production, move the queue
  root to an App Group container before shipping that extension.
- If raw screenshots are later uploaded, introduce a background `URLSession`
  only after the human-review and authorization boundary is explicitly
  redesigned; a detached Swift task is not durable transfer infrastructure.
