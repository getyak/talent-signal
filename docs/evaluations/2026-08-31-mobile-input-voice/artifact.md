# Mobile input, voice, and Ask reliability evaluation

Date: 2026-08-31
Verdict: **pass with signed-device verification required**

## Scope

This evaluation covers the native iOS Ask composer, its first-run microphone
lifecycle and submission feedback, plus the matching Web IME and draft rules.
It uses synthetic text only and does not include candidate conversations,
transcripts, media, identities, or provider payloads.

## Implemented behavior

- Native marked text from a multi-stage input method is provisional: Send is
  disabled, no draft snapshot is written, and no Ask is submitted until commit.
- Committed whitespace remains visible and recoverable; exact-empty input is
  still treated as no Ask.
- Protected iOS draft writes are coalesced after typing and flushed on Send,
  disappearance, or background rather than rebuilding the envelope on every
  keystroke.
- A microphone permission overlay may temporarily make the scene inactive.
  Voice start waits for an active scene after authorization; true background
  and audio interruption cancel without sending temporary audio.
- Submission feedback distinguishes local relationship routing (not sent) from
  a workspace request and verified response.
- Diagnostics contain only closed state vocabulary and composition state. They
  do not interpolate user content or relationship identifiers.
- Web composers preserve committed whitespace and suppress submission and
  persistence during browser composition.

## Executable evidence

- `pnpm ios:check` with smoke scope passed on an iPhone 17 Pro simulator with
  iOS 26.5: Release build succeeded, 250 unit tests passed, and the isolated
  backend UI suite passed 8 of 8 journeys with no failures or skips.
- Focused lifecycle tests cover permission-overlay inactivity, true foreground
  loss, audio interruption, temporary-audio deletion behavior, and marked-text
  submission policy.
- A focused Simplified Chinese, AX5 Dynamic Type, dark-mode Ask surface test
  passed and its recording-state screenshot was visually inspected.
- Web lint and TypeScript checks passed. Vitest passed 287 tests with one
  intentional skip.
- Localization validation passed for 788 catalog keys. Documentation routing,
  links, and diagram checks passed.

## Mobile UX score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| Platform-native behavior | 3/3 | Native text field and marked-text semantics retained |
| Accessibility | 3/3 | AX5 Chinese recording surface and meaningful control labels verified |
| State completeness | 3/3 | Permission, composition, routing, request, failure, and interruption states modeled |
| Feedback quality | 3/3 | Local work is not described as sent; workspace request is explicit |
| Performance hygiene | 3/3 | Draft encryption/persistence coalesced instead of synchronous per keystroke |

## Safety gate

Pass with one external verification gate. The implementation does not broaden
collection, retention, model exposure, logging, or external-write authority.
Temporary voice audio remains purpose-bound and is cancelled/deleted on the
new interruption paths. State telemetry is content-free.

## Not run here

No signed physical iPhone was connected. Before release, run the TestFlight
build on a real device with Simplified Chinese Pinyin and dictation, covering:
first permission grant, denial, later revocation, candidate-bar composition,
space/newline editing, incoming-call or Siri interruption, background/return,
and one real Tailscale workspace request. Confirm that the transcript remains
editable before Send and that server audit sees no request before explicit
submission. Simulator success is not evidence for microphone hardware,
TestFlight entitlements, the production tailnet, or a third-party transcriber.
