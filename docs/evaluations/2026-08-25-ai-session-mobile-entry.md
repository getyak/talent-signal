# AI session mobile entry evaluation

Date: 2026-08-25

Lenses: mobile task completion, visual hierarchy, accessibility, evidence
provenance, recruiter control, and external-write safety.

## Outcome

The iOS return surface now treats Agent Sessions as the frequent retrieval
layer while keeping Pursuit, evidence, Proposal, and Receipt as the governed
record. `Today / Sessions / People` support tap and horizontal-swipe
navigation. The former underline is replaced by a soft moving selection field
with a reduced-motion fallback.

The bottom surface is one compact Agent composer. Its primary action opens Ask;
its secondary waveform action opens a medium-height text, photo, or voice
intake. The intake does not imply that AI has confirmed identity, facts, or an
external write.

## Evidence level

- Native SwiftUI built with Xcode 26.6 for the iOS 26.5 Simulator runtime.
- Nineteen focused `RelationshipArchiveTests` passed.
- Focused UI journeys passed for Today, swipeable Sessions, Session reopening,
  compact Ask, compact capture, Simplified Chinese, AX5 content size, and
  reduced-motion navigation.
- Today, Ask, and capture also passed on the compact FitCoach SE simulator.
- English and Simplified Chinese screenshots were inspected at 1206 by 2622.
- VoiceOver speech order, a physical device, and production backend
  Session retention remain unverified.

## Visible evidence

- English Today: `ai-session-today-en.png`
- English Session list: `ai-session-list-en.png`
- English reopened Session: `ai-session-thread-en.png`
- English Ask: `ai-session-ask-en.png`
- English capture: `ai-session-capture-en.png`
- Simplified Chinese Session list: `ai-session-list-zh.png`
- Simplified Chinese capture: `ai-session-capture-zh.png`

The PNGs are stored in the Codex visualization artifact directory for this
evaluation run rather than copied into canonical product documentation.

## Mobile UX verdict

`pass_with_changes`

- The first viewport has one stable information hierarchy and one compact
  input threshold. Sessions are reachable by tap or swipe and can be reopened.
- The selected destination uses shape, type weight, and motion instead of a
  black underline. All header and composer controls retain 44-point targets.
- Dynamic Type switches the lightweight capture modes to a vertical stack and
  Ask retains a one-column route at AX5.
- Remaining work: verify VoiceOver order and physical-device thumb reach, then
  tune truncation with realistic multilingual Session titles.

## Evidence-safety verdict

`pass_with_changes`; no veto condition observed.

- Session history is an in-memory projection over successful Agent tasks. It
  does not replace canonical Pursuit state and it cannot silently confirm a
  Proposal or execute an external write.
- The capture sheet names its purpose and warns that identity, facts, and
  external writes remain unconfirmed.
- Synthetic preview state is visibly labeled and canonical launch starts with
  no invented Sessions.
- Remaining work: a durable Session API needs explicit workspace scope,
  retention, deletion, message provenance, and cross-device read state before
  the client may persist private Agent responses.

## Checks

- `xcodebuild build-for-testing`
- focused unit and UI test runs with `.xcresult` bundles
- rendered English and Simplified Chinese inspection
- `git diff --check`
- `pnpm docs:check`

## Reconsider when

A governed backend Session contract exists. Replace the in-memory projection
with canonical readback at that point; do not introduce an independent client
conversation database.
