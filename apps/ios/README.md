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
- An Apple Development team with access to `com.talentsignal.app`

## Generate and run

```sh
pnpm ios:generate
open apps/ios/TalentSignal.xcodeproj
```

Select the `TalentSignal` scheme and an iOS 16+ simulator or device.

Release builds require a backend HTTPS URL in `TalentSignalAPIBaseURL` and use
Sign in with Apple before opening the workspace. Configure the App ID capability
and set the backend's `APPLE_SIGN_IN_AUDIENCES` to the same client identifier.
The backend verifies the Apple assertion and issues the application session;
the app stores that session in the device Keychain. Debug builds can show the
real login surface against localhost with `--show-login --auth-backend-url`,
but deterministic simulated login remains a Debug-only fixture path.

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

The repository uses Fastlane Match and the shared private certificate repository
at `getyak/daypage-certs`.

```sh
bundle exec fastlane ios prepare_signing
bundle exec fastlane ios beta
```

`prepare_signing` is a one-time provisioning step. CI runs Match in read-only
mode and uploads through the App Store Connect API. Uploads require:

- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_CONTENT`
- `DEVELOPMENT_TEAM`
- `MATCH_DEPLOY_KEY`
- `MATCH_GIT_URL`
- `MATCH_KEYCHAIN_PASSWORD`
- `MATCH_PASSWORD`

Signing assets remain encrypted through Fastlane Match. Never commit the
API key, match password, deploy key, certificates, or provisioning profiles to
this repository.
