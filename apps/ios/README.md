# Talent Signal for iOS

The native SwiftUI client opens on Pursuit-first Today. Today, Pursuits, and
People are projections of the same account-scoped canonical workspace; Inbox
opens the Proposal, item decision, revision, Receipt, and readback loop. Failed
reads do not substitute preview facts, and attention ranks work rather than a
person.

Ask opens as a focused, Pursuit-scoped AI conversation with canonical Person
and context lookup, compact prompt tools, capture, and direct record navigation.
Today keeps one decision visually primary and renders later work as quiet
continuations; it has no separate feed or generic search panel.

The bottom Capture control opens one purpose-bound chooser for Text Signal,
conversation screenshot, or Audio Signal. The `Capture Signal` App Shortcut is
suitable for an Action button configuration and only foregrounds that chooser.
`Record Signal` only opens the foreground audio surface. Neither intent starts
the microphone. Audio requires a non-empty purpose, explicit authorization,
system permission, an active foreground scene, available input, and recorder
success before the UI can say `Recording now`. Completed audio stays protected
on-device with a checksum and deletion path; this slice has no upload,
transcription, Proposal, confirmed-state, or external-write authority.

Intentional screenshot import still provides on-device text review, temporal
identity comparison, explicit relationship attachment, and a compiled-Wiki
receipt. Photos selection and the `Review screenshot in Talent Signal` App
Shortcut enter the same resumable review. The shortcut runs quietly in the
background: it atomically adds the selected image to the local FIFO review queue
and returns without network work, an app launch, or a Live Activity. An exact
retry reuses the still-pending queue item, while a later import after completion
starts a new purpose-scoped review. The original image stays on-device in this
slice; the local backend receives recruiter-reviewed text and governed source
metadata.

The app also retains the synthetic candidate-momentum fixture loop for bounded
review and action testing. It keeps provider keys out of the app bundle and
never performs a candidate-facing or external-system write from screenshot
capture. Deterministic launch routing and localhost sessions are compiled out
of Release; a Release-specific test verifies those arguments are inert.

## Requirements

- Xcode 26 or newer
- XcodeGen 2.45 or newer
- An Apple Development team with access to `com.talentsignal.app`, its App
  Group `group.com.talentsignal.app`, and the embedded Share/Live Activity
  extension identifiers

## Generate and run

```sh
cp .env.example .env
pnpm ios:generate
open apps/ios/TalentSignal.xcodeproj
```

Set `TALENT_SIGNAL_API_BASE_URL` in the ignored root `.env`, then select the
`TalentSignal` scheme and an iOS 16+ simulator or device. `ios:generate` parses
the value as data, validates it, and writes an ignored
`apps/ios/Config/Environment.local.xcconfig`; it never sources `.env` as shell
code. Re-run `pnpm ios:configure` after changing the URL without regenerating
the Xcode project. Add `--show-login` to the Debug scheme launch arguments when
testing the account-scoped login flow; deterministic fixture routes remain the
default for local UI development.

Release builds require an HTTPS `TALENT_SIGNAL_API_BASE_URL` and use
Sign in with Apple before opening the workspace. Configure the App ID capability
and set the backend's `APPLE_SIGN_IN_AUDIENCES` to the same client identifier.
The backend verifies the Apple assertion and issues the application session;
the app stores that session in the device Keychain. Debug builds can show the
real login surface against localhost with `--show-login --auth-backend-url`,
but deterministic simulated login remains a Debug-only fixture path.

## Standalone onboarding showcase

The Debug app includes a backend-independent onboarding adapter for the first
verified-progress journey. It is isolated from the authenticated canonical
workspace and never appears because a backend read failed.

Add these scheme launch arguments to start a fresh deterministic showcase:

```text
--standalone-onboarding-reset
--standalone-demo
--demo-proposal-engine
--simulate-action-button
```

The journey creates a protected local session and Pursuit, labels every Demo
Meeting, Demo engine result, and simulated Action Button event, and reaches a
persisted local Today projection only after the user confirms a sourced change
or accepts a next action. Remove `--standalone-onboarding-reset` to verify
relaunch recovery. Settings inside standalone Today can replay onboarding or
reset only the standalone Demo session and its local recordings; it never
resets system permissions, removes user-authored Share captures, or deletes
user Calendar events.

For real Calendar proof, use `--standalone-onboarding` on an iOS 17+ device,
choose Calendar, read the purpose explanation, then tap `Allow Calendar Access`.
The adapter requests EventKit Full Access, reads only the bounded recent and
upcoming window, listens for EventKit changes, and treats write-only, denied,
restricted, empty, and revoked states as distinct recoverable outcomes. It does
not write an event during onboarding.

For real voice proof on iOS 26+, choose Voice, confirm the purpose-bound capture
authorization, and start the recorder while the app is foregrounded. The Draft
exists before the microphone prompt. Audio is atomically finalized under
Application Support. When available, `SpeechAnalyzer` and `SpeechTranscriber`
receive the foreground audio stream and progressively update the editable
transcript. When permission, locale, model assets, or device support is
unavailable, the same local Draft remains editable as text and the recorder
falls back without inventing a transcript.

While that foreground recorder is active, the embedded Live Activity shows
only `Recording Signal`, elapsed time, and Stop. It then moves through
`Saved · Organizing` to `Ready to Review`; it never exposes a name, meeting
title, transcript, or Proposal on the Lock Screen or Dynamic Island. Its Stop
control writes a draft-scoped request through the App Group. The recorder and
persisted Draft remain authoritative if Live Activities are disabled.

The app exposes `Capture Signal`, `Review Signal`, and `Open Pursuit` first in
App Shortcuts, followed by the foreground-recording and screenshot helpers.
Only the user can map one in system Settings. The Simulator `Simulate Action
Button` control is Debug-only, visible as `Simulated`, and is not
physical-device proof.

The `Talent Signal` Share Extension accepts one image, text item, or web URL.
After the user taps Post, it writes the payload first and atomically appends a
versioned `CaptureEnvelope` to `group.com.talentsignal.app`. The containing app
imports each stable envelope ID once and opens the same editable Signal →
Proposal → Review path. For an image without a note, the user must add a Signal
before processing; the app does not claim the Action Button can read another
app's screen. Verify on a signed device by sharing from Photos, Safari, or a
text selection, then reopening the standalone Debug showcase.

## Verify

```sh
pnpm ios:check
```

The check script builds Release without signing, boots an available iPhone
simulator, and runs the unit and UI tests. The relationship-capture UI test
expects the authorized synthetic backend fixture on `127.0.0.1:4317`; it skips
when that fixture is unavailable.

The release identity is:

- App name: `Talent Signal`
- Bundle ID: `com.talentsignal.app`
- Team ID: `6RG2F8YY59`

## TestFlight

The repository uses Fastlane Match and the isolated private certificate
repository at `getyak/talent-signal-certs`. It contains only encrypted Talent
Signal signing assets on `main`. CI accesses it with a dedicated read-only
deploy key. `MATCH_GIT_BRANCH` may override the branch for a deliberate
migration, but release jobs default explicitly to `main` rather than Fastlane's
legacy `master` default.

```sh
bundle exec fastlane ios prepare_signing
bundle exec fastlane ios beta
```

`prepare_signing` is an explicit provisioning or rotation step. CI runs Match
in read-only mode, waits for App Store Connect to finish processing the build,
and then creates the matching release tag. Uploads require:

- the public `TALENT_SIGNAL_API_BASE_URL` Actions variable in the `testflight`
  GitHub Environment;

- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_CONTENT`
- `DEVELOPMENT_TEAM`
- `MATCH_DEPLOY_KEY`
- `MATCH_GIT_URL`
- `MATCH_KEYCHAIN_PASSWORD`
- `MATCH_PASSWORD`

The release job validates the URL, requests a current Apple authentication
challenge with the repository contract, and only then begins signing. The API
origin is public app metadata and must stay an Actions variable. Credentials,
tokens, database URLs, and provider keys must never be compiled into the app.

Signing assets remain encrypted through Fastlane Match. Never commit the
API key, match password, deploy key, certificates, or provisioning profiles to
this repository.

The `testflight` GitHub Environment accepts only `main` and has no reviewer, so
a successful `main` CI run with iOS release-input changes publishes
automatically. App Store Connect must separately keep an internal testing group
with automatic distribution enabled; that group plus an invited-device install
is the proof that a processed build is available on a phone.
