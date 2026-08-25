# PRD-06: System capture entrypoints

## Problem and user outcome

An independent recruiter should be able to invoke one truthful Capture Signal
action from the iPhone Action button, Shortcuts, or the app, then land in the
smallest foreground review surface required by the source type. A system entry
must never claim that recording or persistence started before the app actually
has permission, an active foreground audio session, and durable local storage.

## In-scope requirements

- `V1-CAP-003` and `V1-CAP-004`;
- a system-discoverable Capture Signal App Shortcut suitable for the iPhone
  Action button;
- one explicit app-intent handoff route into the native Capture surface;
- foreground-only audio recording with truthful permission, preparation,
  recording, stopped, failed, interruption, retry, and deletion states;
- continued background screenshot enqueue without network or review bypass;
- Release metadata and automation-boundary checks.

## Out of scope

- background or ambient microphone capture, call recording, meeting bots, or
  automatic transcription;
- uploading unreviewed audio, model analysis, confirmed state, or external
  messaging/calendar/ATS/CRM effects;
- claiming a physical Action button invocation without physical-device proof.

## Entrypoints and handoff

`Capture Signal` is the primary App Shortcut. It foregrounds the app and opens
one Capture hub; the user then chooses text, screenshot review, or foreground
audio. `Review conversation screenshot` remains a separate inline shortcut
because it can safely finish after a durable local enqueue. The App Intent layer
owns only typed routing and immediate system feedback; feature stores own state.

## Audio state and privacy boundary

Audio may transition idle → requesting permission → preparing → recording only
while the scene is active. The recording indicator appears only after the audio
session and recorder both report success. Denied permission, unavailable input,
interruption, backgrounding, or start failure returns a non-recording state.
Stop durably stores one protected local source and checksum. Delete removes that
local payload. No audio leaves the device in this PRD.

## Deterministic and runtime proof

Tests cover App Intent route reduction, foreground requirement, denied and
undetermined permission, start failure, successful start/stop, interruption,
background stop, relaunch metadata, deletion, Release metadata generation, and
AX5/small-device reachability. Simulator proof is labeled as microphone-path
simulation; physical Action button and device microphone proof remain missing.

## Falsifiers

The slice fails if an intent records in the background, the UI shows recording
before start succeeds, audio survives a completed delete, a system entry bypasses
review, Release recognizes deterministic test routing, or any source creates an
external effect.

## Checkpoint — 2026-08-24

Complete for the Simulator-backed V1 boundary. The app now exposes generated
Release metadata for `Capture Signal`, `Record Signal`, and the existing
background screenshot shortcut. Capture and Record foreground the app; neither
starts audio. The in-app Capture rail opens the same text, screenshot, and audio
chooser.

The audio store implements authorization, purpose, permission, foreground,
preparation, recording, interruption, durable local receipt, relaunch restore,
failure, and deletion states. The production recorder writes a file-protected
M4A and protected metadata under the app-support outbox, computes SHA-256 from
the persisted payload, and exposes success only after that receipt exists. No
audio upload or transcription path exists.

Frozen evidence in `docs/evaluations/2026-08-24-v1-prd-06/` includes the
generated Release App Intent metadata, six visually inspected iPhone 17 Pro
screens, eight passing state-machine tests, three passing UI journeys including
AX5 dark accessibility audit, a clean Release build, and a Release-compiled
test proving synthetic arguments cannot select test routes. Physical Action
button, real-device microphone, and manual VoiceOver evidence remain explicitly
missing and are not converted into claims.
