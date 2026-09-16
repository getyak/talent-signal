# M3/M4 macOS Hybrid boundary observation

## Identity and scope

- Implementation: `7ea86be2e87486a60ebe5b210d50338ec4c4b53a`
- Fixed design input:
  `talent-signal-design-handoff@2d1af8983d23fb584d4086bfa894bcb9b5fa706a`
- Platform: macOS 26.4 (`25E246`), Apple silicon (`arm64`)
- App: packaged local Tauri `.app`, built from the implementation above
- Backend: isolated HTTPS loopback service and PostgreSQL synthetic fixture
- Fixture: synthetic account `Fixture Alpha Search` and Session
  `Hybrid M3 synthetic Session`
- External writes and production deployment: none; not authorized
- Screen Recording permission: not granted or changed during this observation
- Human design acceptance: `not_reviewed`

This observation proves a least-privilege feasibility slice. It does not claim
that the Hybrid host is release-ready, that the native capability matrix is
complete, or that TS-026 through TS-030 has passed.

## Post-review renderer recovery hardening

Commit `4e932e60fac5d07ef09e6eafa1ee6f7708959cde` was verified after the
historical `7ea86be2` packaged observation. It does not replace or relabel the
screenshots below.

- The renderer persists only an opaque capture-intent UUID for the exact
  account/Session scope, with a strict 24-hour expiry and defensive handling of
  corrupt or unavailable Web Storage.
- A stale or unbound authority result retains a still-valid unknown intent so a
  later verified recovery can replay or cancel it. A verified rebind prunes all
  other scopes, and confirmed disconnect clears every capture-intent scope.
- `NativeCapabilityWorkbench` is keyed by the verified account/Session, so a
  verified A-to-B status transition remounts it instead of carrying A's
  in-memory capture handle, intent reference, OCR, or transport state into B.

Hybrid UI verification passed 2 files/14 tests and typecheck. The native gate
passed 33 Rust tests, formatting, and clippy with warnings denied. A fresh
ad-hoc bundle passed `codesign --verify --deep --strict`; it remained 15,120
KiB, with app executable SHA-256
`9a0e81f996b298c5954e5ecd1e3eb51f950150e2afbc1482483b1ffeeec96a64`
and unchanged Vision helper SHA-256
`8cd4193c6b193f2a732d74410883e0d4607075fd44a4121297ffd05f8152a95d`.

Residual P3 evidence boundary: the verified scope remount is covered by a
structural regression test rather than a live React status-swap integration
test. No permission was changed, no production credential was used, and no
TS-026…TS-030 status or human design acceptance was promoted.

## Observed packaged-app behavior

1. The packaged app rendered only bundled local assets. Its generated Tauri
   capability grants the ten typed Talent Signal commands to the main window;
   it does not grant `core:default`, shell, arbitrary filesystem, URL-open, or
   remote Web permissions.
2. The observed activation used `https://127.0.0.1:<port>`; the validator
   accepts only explicit HTTPS loopback roots, including `127.0.0.1`,
   `localhost`, and `::1`. The client compared the presented leaf certificate
   DER SHA-256 with the exact configured certificate before delegating
   hostname, time, chain, and signature validation to WebPKI. Redirects and
   proxies were disabled and verification responses were capped at 64 KiB. An
   integration test proved that a different leaf signed by the same configured
   CA is rejected before the bearer token can be sent.
3. The access token existed transiently in the React activation form, then the
   form value was cleared. The persistent token was stored in macOS Keychain;
   it was not written to WebView storage or the binding file. The binding and
   owned-key inventory were mode `0600`; a content scan found no access token,
   bearer value, or synthetic secret in either file.
4. Every new sensitive native effect (capture, OCR, quick panel, or
   notification) reverified the account and Agent Session against the pinned
   loopback backend before commit. Cancellation matched only the current
   in-memory exact scope and operation; capability/status reads and disconnect
   did not claim backend revalidation. Authoritative verification failure
   invalidated the active lifecycle generation before a sensitive effect could
   commit. Rebinding committed the new binding before clearing the old receipt
   and Keychain material, so a failed rebind retained the previous committed
   binding.
5. After the app process was terminated and the same packaged binary was
   reopened, it recovered the Keychain-backed binding and displayed a new
   successful verification timestamp (`2026-09-16 07:46:21`).
6. Starting a second copy with `open -n` left one running app process. The
   single-instance plugin is registered before application setup.
7. The explicit quick-panel button opened a local, content-free window. It
   displayed no candidate, message, evidence, or external-action data and
   explicitly said that the panel does not prove the Session is still valid.
8. The notification command requested a fixed lifecycle-state notification.
   A second identical request in the same process was suppressed. This proves
   request submission and in-process dedupe only; it does not prove that macOS
   displayed a notification, and dedupe does not survive restart.
9. Window capture reported `permission_required` because Screen Recording was
   not granted. No real window was captured, no integrated OCR request ran,
   and permission was not changed merely to obtain a passing screenshot.

The authenticated backend listened only on loopback. The test used a synthetic
certificate and secret, not a production credential or public endpoint.

## Native and persistence boundaries

| Boundary | Implemented behavior | Observed result |
| --- | --- | --- |
| Capture | User-selected window only; 12 MB per artifact, 48 MB total, 8 artifacts, 10-minute raw TTL | Permission denial was visible; granted capture was not run |
| Cancellation | Lifecycle epoch, child termination, and raw-file deletion; after a started claim and exact binding generation exist, a terminal receipt follows confirmed termination | Rust tests passed; live capture cancellation was not run |
| OCR | Bundled Vision helper only; 20-second timeout; 256 KB stdout cap; no network or cloud fallback | Direct helper success and failure observed; integrated OCR was not run |
| Receipts | Cross-process file lock; started/terminal states; exact operation intent; 24-hour, 256-record bound | Receipt state, replay, quota, and lifecycle unit tests passed; cross-process lock and crash/restart integration were not executed |
| Session binding | Exact leaf pin, account/Session revalidation, Keychain token, owned-key inventory, atomic mode-`0600` files | Activation and restart readback observed |
| Quick panel | Explicit local invocation; content-free continuation prompt | Packaged UI observed |
| Notification | Fixed state body, account/Session/activity/state dedupe key | First request submitted; same-process duplicate suppressed; display unproven |

## Direct Vision-helper observation

The helper embedded in the exact packaged app was invoked directly, outside
the Tauri capture flow:

- On the synthetic app screenshot, it returned `status: recognized`, a
  467-character text result containing `Talent Signal`, and no keys other than
  `status` and `text`.
- On `/usr/bin/true`, it returned `status: failed`, empty text, and exit code 3.
- No cloud service or fallback path was configured or invoked.

This proves the bundled local helper's bounded success/failure behavior. It is
not evidence for TS-027 because capture-to-OCR integration and cancellation at
the required native boundary were not executed.

## Package facts

| Fact | Observed value |
| --- | --- |
| Bundle | `apps/macos-hybrid/src-tauri/target/release/bundle/macos/Talent Signal Hybrid.app` |
| On-disk size | 15,120 KiB (15,482,880 bytes) |
| App executable SHA-256 | `ceef3d40669461e220f3fb649fd18aeb31ccea3a787e5f1b0f35da740b4f9bfa` |
| Vision helper SHA-256 | `8cd4193c6b193f2a732d74410883e0d4607075fd44a4121297ffd05f8152a95d` |
| Bundle identifier | `com.talentsignal.hybrid` |
| Signature | ad hoc; no TeamIdentifier |
| Hardened runtime | Runtime Version 26.5.0 |
| Integrity check | `codesign --verify --deep --strict` passed |
| Notarization | not run; Apple release credentials were not available or requested |

The ad hoc package is local feasibility evidence only. It is not a signed,
notarized, update-tested, or distributable release artifact.

## Automated verification

- Rust: 33 tests passed.
- Rust formatting and `cargo clippy --all-targets -- -D warnings`: passed.
- Hybrid UI: 2 files and 9 tests passed; typecheck and production UI build
  passed.
- Shared workspace UI: 4 files and 18 tests passed; typecheck and build passed.
- Web: 97 files passed and 1 skipped; 610 tests passed and 1 skipped. Lint,
  typecheck, and the 39-page optimized production build passed with a
  synthetic build-only `AUTH_SECRET`.
- Backend: 58 files passed and 10 skipped; 438 tests passed and 133 skipped.
  Typecheck and build passed.
- Agent: 27 files passed and 1 skipped; 244 tests passed and 1 skipped.
  Agent Host: 14 files and 58 tests passed. Their typechecks and builds passed.
- TLS configuration script: 1 test passed.
- Backend TLS configuration: 1 file and 4 tests passed.
- Root `pnpm check`, documentation/architecture checks, pinned GitHub Actions,
  and `actionlint` 1.7.7: passed.
- `git diff --check`: passed.
- Independent review of `7ea86be2`: no unresolved code P0 or P1. The four
  remaining P2 feasibility/release gaps are recorded below rather than
  promoted away.

The first root-check attempt supplied a non-default backend URL to the entire
Web test process and caused six URL expectation failures. The same source then
passed the complete root check after that test-environment pollution was
removed; no code was changed to hide the failure.

## Render evidence

| Evidence | Pixels | SHA-256 | Proves only |
| --- | ---: | --- | --- |
| `screenshots/hybrid-verified-exact-pin-7ea86be2.png` | 1292 × 932 | `bb98276a0f753ee79bdd032ce5c8da454d65905249ac29d810a2b3d8efd76eef` | packaged UI after exact-pin Session verification and permission-required capture state |
| `screenshots/hybrid-quick-panel-content-free-7ea86be2.png` | 532 × 372 | `7abbdd9b15a339a7a04cef947bcb3bc3a6421741a4146312ad518a677004951e` | explicit local quick panel and content-free copy |
| `screenshots/hybrid-native-receipts-7ea86be2.png` | 1292 × 932 | `ee814e96993f3e506663a1a291a87d31042d73d3a097c45be9199e2e1ed9b64c` | quick-panel receipt plus submitted/suppressed notification request state |
| `screenshots/hybrid-restart-reverified-7ea86be2.png` | 1292 × 932 | `20660aac216f37e84fcfa87e02b2f1809da2ee5243a109508c992ab489536e4a` | post-restart Keychain recovery and fresh backend verification timestamp |
| `../web/screenshots/web-plugs-shared-native-boundary.jpg` | 1280 × 720 | `74ddd6e93580bc1b0c9ba5227653ec134d232560986de7bf278fd7bd62ff8730` | Web projection of the shared connector/native-capability contract; not proof of the native bridge |

Screenshots cannot prove certificate validation, secret storage, cancellation,
OCR locality, notification display, signing identity, or production behavior.

## Gates deliberately not promoted

- TS-026 remains `not_run`: Screen Recording was not granted, so a real
  capture followed by cancellation and zero downstream OCR/model work was not
  executed.
- TS-027 remains `not_run`: the direct Vision helper was observed, but the
  integrated capture-to-OCR failure/cancellation boundary was not.
- TS-028 remains `not_run`: the explicit quick panel passed its local
  content-free slice, but the complete focused-app/global-shortcut,
  multi-display, restart, and Session-continuation matrix was not executed.
- TS-029 remains `not_run`: request submission and same-process dedupe were
  observed, but actual OS display, denial, restart, and privacy behavior were
  not.
- TS-030 remains `not_run`: exact-pinned binding fails closed and lifecycle
  invalidation is tested, but connector ownership, OAuth/deep links, expiry,
  scope revocation, and privilege-escalation behavior were not executed end to
  end.

Four reviewed P2 feasibility/release gaps remain:

1. If an active capture reservation has not yet obtained its binding key,
   invalidation can stop the child and delete raw data but cannot write a
   terminal receipt. No `started` claim exists at that point, so this is a
   conservative availability gap rather than a false completion claim.
2. The receipt does not persist the binding generation. If a new binding is
   committed and the app crashes before the old started receipt is cleared,
   the same account/Session can remain conservatively blocked for up to 24
   hours or until explicit disconnect.
3. Private state reads check `symlink_metadata` and then reopen the path for
   reading. A same-user path replacement can race those operations. Release
   hardening should open with `O_NOFOLLOW`, validate metadata on that file
   descriptor, and perform the bounded read through the same descriptor.
4. The Vision helper's hash/signature check and later path-based execution do
   not share one file identity. The ad hoc local feasibility package was
   inspected and used successfully, but distribution must execute an
   immutable, properly signed helper without a same-user replacement window.

Chinese IME, upload/Markdown/streaming parity, sleep/wake, deep links, broader
WebView parity, signed/notarized update and rollback, permission-granted native
operations, and human design acceptance remain open.
