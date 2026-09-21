# macOS download and distribution

Talent Signal is a relationship workspace for client work, partnerships,
collaboration, and recruiting. The downloadable client is `apps/macos`.
`apps/macos-hybrid` remains a separate experimental capability shell.

## Install on another Mac

1. Open [macOS releases](https://github.com/getyak/talent-signal/releases?q=macos-)
   and select a macOS release. Download its Universal `.dmg` (Apple silicon and
   Intel, macOS 14 or later). Preview releases are explicitly labeled.
2. Compare the downloaded file with its `SHA256SUMS.txt` using
   `shasum -a 256 <downloaded-file>`. Drag **Talent Signal** to Applications.
3. Open the app and enter the HTTPS workspace origin supplied by the workspace
   owner, without `/workspace` or other paths. Sign in with your own account.

For an owner-operated private workspace, authorize the second Mac in the same
Tailscale network and connect Tailscale before opening the app. The package
contains no private server address, authentication state, or embedded account.
It does not deploy a server or make an existing private server publicly accessible.
The network button changes the workspace address. Loading failures remain
visible with retry; the app never bypasses TLS validation.

Preview packages are ad-hoc signed and **not Apple-notarized**. Gatekeeper may
block downloaded previews. Do not disable Gatekeeper or strip quarantine.
Ordinary external distribution requires a signed, notarized release. Building
from the tagged source is an alternative for preview evaluation.

## Update and rollback

**Settings → Talent Signal → View macOS releases** opens release downloads.
Quit the app and replace the application in Applications; the bundle identifier
and saved preferences remain stable. Keep the previous package for rollback.
This workflow automates publication, not silent in-app binary replacement.
The hosted workspace is updated by its service operator independently.

## Automated publication

`.github/workflows/release-macos.yml` runs after successful trusted `main` CI.
It compares macOS source, approved icon, packaging, and release policy with the
last macOS tag and skips unrelated changes. It builds and tests the native app
at the exact verified revision before publishing a unique `macos-<run>-<attempt>`
release, Universal DMG/ZIP, and SHA-256 manifest. Preview releases never become
GitHub's general latest release (which is also used by iOS).

Default mode is `preview`. Set repository variable `MACOS_RELEASE_MODE=signed`
only after provisioning Developer ID signing and notarization. Signed mode
fails closed on missing credentials, signing, notarization, staple validation,
or Gatekeeper assessment. It never falls back to a preview silently.
Manual dispatch accepts only the current default branch and requires successful
push CI for that exact revision.

## Signing configuration

Infisical remains the canonical secret store. Configure a separate GitHub OIDC
identity restricted to this repository's `macos-release` environment, audience
`infisical://talent-signal/macos-release`, and `staging:/release` read scope.
Set `INFISICAL_MACOS_IDENTITY_ID` as a repository variable. Restrict the GitHub
`macos-release` environment to the default branch.

The scoped release environment needs:

- `MACOS_CERTIFICATE_P12_BASE64`: Developer ID Application certificate with its private key;
- `MACOS_CERTIFICATE_PASSWORD`: export password;
- `MACOS_SIGNING_IDENTITY`: exact `Developer ID Application: ...` identity;
- `MACOS_NOTARY_KEY_ID`, `MACOS_NOTARY_ISSUER_ID`, `MACOS_NOTARY_PRIVATE_KEY`:
  App Store Connect team API key authorized for notarization.

The runner imports credentials into an ephemeral keychain and removes it after
success or failure. Never commit credentials or publish signing inputs with
release artifacts. Apple Development and Apple Distribution identities are not
substitutes for Developer ID Application signing.

## Local verification

Run `dev-storage-guard audit`, then obtain a task-owned directory with
`dev-storage-guard new-artifact macos-distribution`. Pass that path explicitly:

```sh
MACOS_OUTPUT_DIR=/absolute/task-artifact scripts/macos/package.sh
```

The package script verifies both architectures, icon presence, absence of a
bundled private origin, and bundle signature. Preserve requested deliverables
before removing task build products through the storage guard. Native unit tests
run through `scripts/macos/check.sh`; no iOS simulator is needed.

Sources: [Apple Developer ID](https://developer.apple.com/developer-id/),
[notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow),
[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
