# Talent Signal macOS Hybrid

This package is a least-privilege Tauri shell for verified native capabilities.
It does not replace `apps/macos`, load the remote Next.js application, own
canonical relationship data, or give Web content authority to perform native
or external writes.

## Runtime boundary

| Layer | Responsibility |
| --- | --- |
| `@talent-signal/workspace-ui` | Shared React presentation, provisional draft state, and explicit capability outcomes |
| `src/platform.ts` | Typed renderer adapter over an exact Tauri command allowlist |
| `src-tauri/src/backend.rs` | Pinned-HTTPS, loopback-only account and Agent Session verification |
| `src-tauri/src/native.rs` | Keychain binding, capture, local Vision OCR, quick panel, and notification requests |
| PostgreSQL/backend | Canonical account, Session, evidence, review, approval, and receipt truth |

The packaged renderer uses local Vite assets (`tauri://localhost`). The main
window receives only generated command permissions plus the narrow window and
notification permissions it needs. It has no shell, arbitrary filesystem,
URL-open, or generic network permission. The official Tauri single-instance
plugin is registered first so a second process cannot create a competing
capture or lifecycle owner.

Native commands accept bounded typed payloads. Every new operation uses an
exact verified account/Session/binding lease and rechecks durable revocation
and the on-disk binding before committing a side effect.

## Separate pinned-HTTPS backend process

Hybrid mode uses a dedicated loopback backend listener. Do not replace the
ordinary Web listener or reuse its process. Generate a local certificate and
start the same backend source on a separate port:

```bash
tls_dir="$(mktemp -d)"
scripts/macos/configure-hybrid-tls.sh "$tls_dir" 4443

HOST=127.0.0.1 \
PORT=4443 \
TALENT_SIGNAL_TLS_CERTIFICATE_PATH="$tls_dir/server-certificate.pem" \
TALENT_SIGNAL_TLS_PRIVATE_KEY_PATH="$tls_dir/server-private-key.pem" \
pnpm --filter @talent-signal/backend dev
```

Connect the app to `https://127.0.0.1:4443` and paste the public certificate
from `server-certificate.pem`. The adapter accepts only HTTPS loopback URLs with an
explicit non-privileged port and no credentials, path, query, or fragment.
It disables proxies and redirects, pins exactly one certificate, rejects
private-key material and certificate bundles, and sends the bearer token only
after the TLS peer has matched that pin.

## Authenticated binding and revocation

The user explicitly supplies the loopback URL, public certificate, access
token, and Agent Session UUID. Before activation, Rust verifies the live
account and Session contract. It then stores the token in macOS Keychain and
atomically persists a mode-`0600` non-secret binding.

- The token is not written to WebView storage. After submission it is cleared
  from React state; persistent storage is Keychain and Rust caches it only in
  zeroizing memory. Avoid treating this form as a native secure-input field.
- An owner-only inventory records every app-owned Keychain key so a corrupt or
  missing binding cannot orphan superseded credentials.
- A durable multi-key revocation tombstone makes partial disconnect cleanup
  fail closed and recoverable across restarts.
- Rebinding first revokes the prior generation. A native operation cannot
  reuse a verified lease after the binding generation changes.
- Disconnect disables native effects before cleanup and reports `revoked`
  until every owned key, binding, receipt journal, and inventory entry is
  confirmed removed.
- Restart and foreground recovery revalidate durable state and the backend;
  cached credentials never bypass the on-disk binding check.

## Native capability lifecycle

### Window capture

Capture launches the fixed `/usr/sbin/screencapture -i -W -x` picker. Raw
images stay in an owner-only app cache behind opaque UUID handles. Limits are
12 MB per image, 48 MB total, eight artifacts, and a ten-minute raw TTL.

Before the picker starts, the app durably claims a versioned intent as
`started`. Journal writes require the exact current binding generation; stored
receipts are scoped to account, Session, and intent, retained for 24 hours,
and capped without evicting in-flight claims. A failed rebind preserves the
old receipts, while a successfully committed new generation clears them.
Replays cannot open a second picker, including after renderer storage is lost.
Terminal cleanup aggregates failures and does not report success while raw
data or an active process remains.

If the app process crashes while the system picker is open, macOS may keep the
picker process alive. The restarted app refuses to replay that intent and its
janitor removes late output, but it deliberately does not kill a persisted PID
because PID reuse cannot be proven safe. Shipping still requires an
integration test for this crash/restart boundary.

### Local OCR

OCR accepts only a live capture handle for the same account and Session. The
bundled Swift Vision helper reads the internal path and has no cloud or HTTP
fallback. Release builds require the exact bundled helper identity; unsigned
local helpers are accepted only when their Mach-O hash matches the build-time
pin. Stdout is drained concurrently, capped at 256 KB, and the process is
terminated after 20 seconds or on cancellation. Extracted text remains
provisional, editable, and capped at 12,000 characters.

### Quick panel and notifications

The quick panel is a local, content-free Tauri window opened explicitly or by
`Command-K` while the app is focused. Notifications use fixed lifecycle-only
copy and report a request outcome, not proof that macOS displayed it. Both
paths revalidate the exact binding lease; notification deduplication is scoped
to account, Session, activity, and state.

## Build and verify

Prerequisites are Xcode command-line tools, Rust `1.88` with `rustfmt` and
`clippy`, and the repository's pinned Node/pnpm toolchain.

```bash
pnpm --filter @talent-signal/workspace-ui test
pnpm --filter @talent-signal/macos-hybrid test
pnpm --filter @talent-signal/macos-hybrid typecheck
cargo test --manifest-path apps/macos-hybrid/src-tauri/Cargo.toml --lib
cargo clippy --manifest-path apps/macos-hybrid/src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm --filter @talent-signal/macos-hybrid tauri:build
codesign --verify --deep --strict apps/macos-hybrid/src-tauri/target/release/bundle/macos/Talent\ Signal\ Hybrid.app
```

The Vision binary, Rust `target`, generated schemas, and Vite `dist` are local
build products and are not committed. The local bundle is ad-hoc signed only.
Developer ID signing, notarization, updater/rollback distribution,
system-browser OAuth/deep links, permission-granted capture/OCR acceptance,
sleep/wake recovery, crash-picker recovery, and full WebView parity remain
release gates and must not be reported as production capability.
