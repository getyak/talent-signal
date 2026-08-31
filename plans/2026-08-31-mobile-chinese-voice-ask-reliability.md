# Mobile Chinese, voice, and Ask reliability

## Status

Implemented and simulator-verified on 2026-08-31. Signed-device TestFlight
verification remains a release gate. This plan owns only the Ask composer, voice-input
lifecycle, privacy-safe interaction diagnostics, their focused tests, and the
single canonical experience rule needed to prevent recurrence. Existing
Research Live Activity changes in the shared working tree remain outside this
plan and must be preserved.

## Outcome

On a remote iPhone, a recruiter can compose Simplified Chinese with a
multi-stage input method, enter whitespace and line breaks without the UI
fighting the keyboard, request microphone access on first use, recover safely
from permission and foreground transitions, review the voice transcript, and
see whether an Ask is still local, being routed, being requested, or failed.

Completion requires executable proof that committed Chinese is preserved,
provisional marked text is never submitted, draft persistence is coalesced,
the system permission sheet cannot cancel its own voice start, temporary audio
is deleted on interruption, Web composition cannot submit mid-candidate, and
diagnostics contain state metadata but no draft, transcript, candidate, or
relationship content.

## Boundary

In scope:

- the native iOS Ask composer and its draft persistence cadence;
- first-run microphone authorization, scene changes, recording interruption,
  transcript insertion, and recovery copy;
- explicit local/routing/request/failure feedback for Ask submission;
- the equivalent Web relationship composer composition and whitespace rules;
- metadata-only local diagnostics, tests, and a canonical design-system rule.

Out of scope:

- changing the transcription or chat provider, model, backend data contract,
  Tailscale topology, account authentication, or retention policy;
- hosting the Web app on the TestFlight backend host;
- sending messages, contacts, calendar events, or any external write;
- real candidate content in fixtures, logs, screenshots, or evaluation data;
- modifying or validating the concurrent Research Live Activity feature.

## Current evidence and unknowns

- A retained backend audit proves one physical-iPhone Ask completed through the
  remote provider. The send path is therefore intermittent or UI-state
  dependent, not globally unavailable.
- Retained backend logs contain no physical-device voice-transcription request.
  The observed voice failure is therefore before backend receipt.
- The iOS view persists the entire protected Agent Session envelope on every
  draft change on the main actor.
- The iOS voice operation treats every non-active scene phase as foreground
  loss. The system microphone permission sheet itself can make the scene
  inactive, so the first authorization can cancel the operation that requested
  it.
- SwiftUI's text field owns marked-text behavior implicitly and the current
  send control does not know whether a Chinese candidate is provisional.
- The scoped Web draft removes every whitespace-only value from session
  storage, so a controlled textarea can visibly reject a space.
- No physical iPhone is currently connected. Simulator and deterministic
  tests can prove lifecycle logic and UI state, but final microphone ergonomics
  remains a signed-device release gate.

## Approach

1. Preserve the existing SwiftUI field and its UI-automation contract, while a
   UIKit observer exposes the native field's marked-text state. Never submit or
   persist provisional composition; resume only after the input method commits.
2. Coalesce protected draft persistence after typing pauses and flush it on
   background, disappearance, and Send. Keep committed text visible even when
   persistence fails.
3. Model scene activity in `VoiceInputStore`: tolerate the permission sheet's
   temporary inactivity, wait for foreground before opening the recorder,
   cancel on true background or recording interruption, delete temporary
   audio, and present a specific recovery state.
4. Add a compact Ask submission status that distinguishes local relationship
   routing from a governed backend request. Do not imply that an AI provider or
   an external write succeeded before canonical readback.
5. Preserve Web whitespace drafts and block form submission while the browser
   input method has marked text.
6. Emit only coarse state transitions through local diagnostics; never emit
   user text or relationship identifiers.
7. Verify focused unit/UI/Web tests, generated Xcode project, iOS build, docs,
   localization, and representative Simulator surfaces. Record signed-device
   permission and real microphone checks as not run when no device exists.

## Proof matrix

- Simplified Chinese marked text: provisional candidate cannot enable or invoke
  Send; committed Chinese remains in the editor and persisted draft.
- Whitespace/newline: remains visible while editing but cannot create an empty
  Ask.
- Permission first ask: inactive system overlay does not cancel the start;
  recording begins only after permission is granted and the scene is active.
- Denied/revoked: no recording starts, Settings recovery is available, existing
  draft and attachments remain unchanged.
- Background/interruption: recording/transcription is cancelled as required,
  temporary audio is deleted, and no success is claimed.
- Ask: local routing says nothing has been sent; backend request has honest
  pending feedback; failure restores the exact committed draft for retry.
- Privacy: source/test inspection proves diagnostics interpolate no draft,
  transcript, person, candidate, relationship, media, or provider payload.
- Accessibility/localization: editor and controls retain meaningful labels,
  Dynamic Type, 44-point controls, English and Simplified Chinese state copy.

## Replanning signals

Re-plan if `UITextView` cannot preserve the existing expandable geometry or UI
automation contract, if coalescing conflicts with the seven-day protected-draft
recovery guarantee, if iOS scene transitions cannot distinguish the system
permission overlay from background, or if signed-device behavior contradicts
the deterministic lifecycle tests.
