# Talent Signal macOS Hybrid

This package is an isolated Tauri feasibility shell. It does not replace
`apps/macos`, load the remote Next.js application, own canonical relationship
data, or add authority to Web content.

## Runtime boundary

| Layer | Responsibility |
| --- | --- |
| `@talent-signal/workspace-ui` | Shared React presentation, provisional draft state, explicit capability outcomes |
| `src/platform.ts` | Typed renderer adapter over a fixed Tauri command allowlist |
| `src-tauri/src/backend.rs` | Authenticated loopback-only account and Agent Session verification |
| `src-tauri/src/native.rs` | Keychain binding, selected-window capture, local Vision OCR, quick panel, state-only notification |
| PostgreSQL/backend | Canonical account, Session, evidence, review, approval, and receipt truth |

The packaged renderer uses local Vite assets (`tauri://localhost`). The Tauri
capability grants only `core:default` to the main local window; it grants no
shell, arbitrary filesystem, URL-open, or remote network permission. Native
commands accept bounded typed payloads and revalidate the account and Agent
Session against the loopback backend before every operation except immediate
capture cancellation.

## Authenticated binding

The user explicitly supplies a loopback base URL, access token, and Agent
Session UUID. The Rust adapter accepts only `http://127.0.0.1`,
`http://localhost`, or `http://[::1]` with an explicit non-privileged port and
no credentials, path, query, or fragment. Proxies and redirects are disabled.
The current backend contract and live account/Session identity are then
verified before:

- the token is stored in macOS Keychain;
- the non-secret binding is atomically persisted with mode `0600`;
- any native command becomes available.

Disconnect removes both stores on a best-effort basis and fails visibly if the
connection cannot be made unusable. Restart and foreground recovery revalidate
the persisted binding instead of trusting local state. After one successful
Keychain read per process, the token is held only in zeroizing Rust memory so
focus changes and native operations can revalidate the backend without
repeated Keychain prompts; it is never exposed to the WebView.

## Native capability lifecycle

- Capture launches the fixed `/usr/sbin/screencapture -i -W -x` window picker.
  The image stays in the app cache behind an opaque UUID handle, is capped at
  12 MB, expires after ten minutes, and is removed on cancellation,
  disconnect, or next app startup after a crash.
- OCR accepts only a live capture handle in the same account and Session. The
  bundled Swift Vision helper reads the internal path; it has no cloud or HTTP
  fallback. Its output is provisional, editable, and capped at 12,000
  characters.
- The quick panel is a second local Tauri window. It can be opened explicitly
  from the workbench or with `Command-K` while the app is focused. It exposes
  no candidate, evidence, or message content.
- Notifications contain only a fixed `ready` or `failed` lifecycle message and
  deduplicate the same account, Session, activity, and state in-process.

## Build and verify

Prerequisites are Xcode command-line tools, Rust stable with `rustfmt` and
`clippy`, and the repository's pinned Node/pnpm toolchain.

```bash
pnpm --filter @talent-signal/macos-hybrid test
pnpm --filter @talent-signal/macos-hybrid typecheck
pnpm --filter @talent-signal/macos-hybrid build
cargo test --manifest-path apps/macos-hybrid/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/macos-hybrid/src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm --filter @talent-signal/macos-hybrid tauri:build
```

The Vision binary, Rust `target`, generated capability schemas, and Vite
`dist` are local build products and are not committed. The packaged app is
ad-hoc signed for local feasibility only. Apple Developer ID signing,
notarization, updater/rollback distribution, system-browser OAuth/deep links,
sleep/wake, integrated permission-granted capture/OCR, and full WebView parity
remain separate release gates; their absence must not be reported as success.
