# iOS — preserve local session when backend validate returns 401

## Outcome

An iOS user whose backend session row was lost (database container
restart, manual `seed`, schema migration) does not have to re-enter
Apple ID / email / password the next time they open the app. The local
Keychain credential survives a backend validation failure when the
local `stored.expiresAt` is still in the future, and the workspace
opens with the last verified identity until the backend becomes
reachable again.

## Why this matters

- The recruitment loop depends on continuity. A lost Keychain
  credential is invisible to the user but forces an auth screen, which
  breaks the "open the app, see your people" rhythm.
- The iOS side already stored credentials in the Keychain with
  `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. The only thing
  deleting them was a single line in `AppSessionStore.restore()`.
- The Web client has a parallel symptom — when `backendSessionIsExpired`
  fires, the workspace page redirects to `/login?reason=backend_session_expired`.
  Web is a separate, larger fix; the iOS scope here is the Keychain
  reset on validate 401.

## In scope

- iOS only.
- `AppSessionStore.restore()` in
  `apps/ios/Sources/Features/AppAuthenticationView.swift`.
- Unit tests in `apps/ios/Tests/AppSessionTests.swift`.
- Version bump in `apps/ios/project.yml`:
  `MARKETING_VERSION 0.1.0 → 0.1.1`,
  `CURRENT_PROJECT_VERSION 1 → 2`.
- Plan record + new iOS TestFlight build via the existing
  `release-ios.yml` workflow.

## Out of scope

- Web `/login?reason=backend_session_expired` recovery.
- Backend session TTL or reconnection policy.
- New automatic revalidation worker on the iOS side (next step;
  future plan).
- macOS / browser-extension parity work.

## Root cause

`AppSessionStore.restore()` (lines 75–132) treats a 401 from
`client.validate(_)` (which calls `GET /v1/auth/session`) as proof that
the local credential is unsafe, and immediately runs
`try? persistence.delete()`. The backend returns 401 whenever the row
in `sessions` is missing, expired, or revoked — not just when the
client credential is invalid. The Keychain still holds a credential
that, on paper, has not reached `stored.expiresAt` yet.

The same code path handles `network error` (e.g. server unreachable)
as the "offline → keep last verified workspace" branch, but a 401
falls into the "invalidatesSession" branch and clears the local copy
without distinguishing "backend lost my row" from "this access token
is bad".

## Chosen approach

1. Keep the locally stored credential when `validate(_)` returns 401,
   provided the local `stored.expiresAt` is still in the future and
   the app was built with the default `allowOfflineWorkspace = true`.
2. Move the phase to `.signedIn(stored)` (do not advance to
   `.signedOut`); the workspace screen stays mounted on the last
   verified identity.
3. Surface a one-line `notice` so the user knows the saved sign-in is
   in use and a re-verification is pending.
4. Only clear the Keychain copy when the local `expiresAt` is
   actually in the past, when the user explicitly signs out, when
   `endingPersistence` has a matching fingerprint, or when the
   endpoint scope has changed.
5. Preserve every other branch exactly. The `Debug`-only
   `allowOfflineWorkspace: false` call site continues to enforce a
   strict validate-or-sign-out path.
6. Bump the build number so TestFlight shows the new artifact, and
   publish via the existing `release-ios.yml` workflow.

## Rejected alternatives

- **Hard refresh the local credential on every 401** — would force a
  new server-side `insertSession` row, increasing backend load during
  transient failures and discarding the existing JWT in keychain.
- **Add a long-lived offline grace period (e.g. 24h)** — the
  `stored.expiresAt` already encodes the server-issued lifetime;
  extending it locally would silently let a revoked token keep
  producing UI activity.
- **Add an automatic revalidation worker** — useful, but a larger
  change that mixes URLSession lifecycle with view state. Deferred to
  a follow-up plan.

## Milestones

1. **Patch `AppSessionStore.restore()`** — replace the
   `try? persistence.delete()` path with the keep-on-401 branch.
2. **Unit test** — add `testValidateFailurePreservesLocalKeychainSession`
   in `AppSessionTests.swift` that asserts: stored credential is
   retained, phase is `.signedIn(stored)`, `notice` mentions the
   saved sign-in.
3. **Version bump** — `apps/ios/project.yml` to `0.1.1` / build `2`.
4. **`pnpm ios:check`** — regenerate the Xcode project, build without
   signing, run the unit and UI test bundles.
5. **Plan-record & release** — record this plan in
   `plans/2026-09-10-ios-keep-keychain-on-validate-401.md` and
   publish via `release-ios.yml`.

## Completion evidence

- `pnpm ios:check` exits 0 (via `IOS_ONLY_TESTING=TalentSignalTests`
  on a sandbox runner against the existing
  `talent-signal-testflight-local-api-1` backend on `127.0.0.1:4317`).
- **TestFlight build candidate `0.1.74` ready** — the next version
  will be derived by `scripts/ci/next-ios-version.sh` from the
  current head tag `v0.1.73`; `MARKETING_VERSION` and
  `CURRENT_PROJECT_VERSION` are rewritten in-place by
  `fastlane ios archive_beta` via `increment_version_number` /
  `increment_build_number`, so no manual edits are required.
- 518 / 518 `TalentSignalTests` passed (0 failed, 0 unexpected),
  including the two new regression tests
  `testValidateFailurePreservesLocalKeychainSessionForRetry` and
  `testValidateFailureWithOfflineDisabledStillClearsKeychain`.
- Existing assertions about Keychain removal, remote revocation, and
  protected sign-out recovery continue to pass.

## Open uncertainty

- Whether the iOS `reconcile()` cycle will automatically revalidate
  after a backend recovers. The current code only validates from
  `restore()`. A follow-up plan will investigate adding a revalidation
  trigger on successful URLSession callbacks so the saved sign-in
  re-confirms without requiring an app relaunch.
