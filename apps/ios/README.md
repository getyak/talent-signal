# Talent Signal for iOS

The native SwiftUI client provides intentional screenshot import, on-device
text review, temporal identity comparison, explicit relationship attachment,
and a compiled-Wiki receipt. Photos selection and the `Review screenshot in
Talent Signal` App Shortcut enter the same resumable review. The shortcut runs
quietly in the background: it atomically adds the selected image to the local
FIFO review queue and returns without network work, an app launch, or a Live
Activity. An exact retry reuses the still-pending queue item, while a later
import after completion starts a new purpose-scoped review. The original image
stays on-device in this slice; the local backend receives recruiter-reviewed
text and governed source metadata.

The app also retains the synthetic candidate-momentum fixture loop for bounded
review and action testing. It keeps provider keys out of the app bundle and
never performs a candidate-facing or external-system write from screenshot
capture.

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

The `testflight` GitHub Environment accepts only `main` and has no reviewer, so
a successful `main` CI run with iOS release-input changes publishes
automatically. App Store Connect must separately keep an internal testing group
with automatic distribution enabled; that group plus an invited-device install
is the proof that a processed build is available on a phone.
